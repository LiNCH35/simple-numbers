import { primeCountPrefix } from '../core/sequence.mjs';
import { maxOf, minOf } from '../utils/arrayStats';
import { initGPU } from './useGPU';

export async function calculateSequenceDifferencesGPU(sequence: number[]): Promise<{x: number, difference: number}[]> {
  try {
    const gpu = await initGPU();
    if (!gpu) {
      return calculateSequenceDifferencesCPU(sequence);
    }

    const maxNumber = maxOf(sequence);
    const xStep = 5;
    const xMax = Math.ceil(maxNumber / xStep) * xStep;
    const xValues = Array.from({length: Math.floor(xMax / xStep) + 1}, (_, i) => i * xStep);
    const sortedSequence = Float32Array.from([...sequence].sort((a, b) => a - b));
    const maxSteps = Math.ceil(Math.log2(Math.max(2, sequence.length))) + 1;

    const countPseudoKernel = gpu.createKernel(function(sortedSequence: number[], x: number) {
      let low = 0;
      let high = this.constants.sequenceLength;
      for (let step = 0; step < this.constants.maxSteps; step++) {
        if (low >= high) {
          break;
        }
        const mid = Math.floor((low + high) / 2);
        if (sortedSequence[mid] <= x) {
          low = mid + 1;
        } else {
          high = mid;
        }
      }
      return low;
    }).setConstants({ sequenceLength: sequence.length, maxSteps }).setOutput([xValues.length]);

    const realPrimeCounts = primeCountPrefix(xMax);

    const pseudoCounts = countPseudoKernel(sortedSequence, xValues) as Float32Array;

    const differences: {x: number, difference: number}[] = [];
    for (let i = 0; i < xValues.length; i++) {
      const x = xValues[i];
      const pseudoCount = pseudoCounts[i];
      const realCount = realPrimeCounts[Math.floor(x)];
      differences.push({ x, difference: pseudoCount - realCount });
    }

    if (differences.some(point => !Number.isFinite(point.difference))) {
      return calculateSequenceDifferencesCPU(sequence);
    }
    return differences;
  } catch (e) {
    console.warn('GPU sequence differences failed, using CPU fallback:', e);
    return calculateSequenceDifferencesCPU(sequence);
  }
}

export function calculateSequenceDifferencesCPU(sequence: number[]): {x: number, difference: number}[] {
  const maxNumber = maxOf(sequence);
  const xStep = 5;
  const xMax = Math.ceil(maxNumber / xStep) * xStep;
  const realPrimeCounts = primeCountPrefix(Math.max(0, xMax));
  const sorted = [...sequence].sort((a, b) => a - b);
  const differences: {x: number, difference: number}[] = [];
  let pseudoIndex = 0;

  for (let x = 0; x <= xMax; x += xStep) {
    while (pseudoIndex < sorted.length && sorted[pseudoIndex] <= x) {
      pseudoIndex++;
    }
    differences.push({x, difference: pseudoIndex - realPrimeCounts[x]});
  }

  return differences;
}

export async function calculateSequenceDifferences(sequence: number[]): Promise<{x: number, difference: number}[]> {
  return calculateSequenceDifferencesGPU(sequence);
}

export async function calculateAverageDifferencesGPU(sequences: number[][]): Promise<{x: number, averageDifference: number}[]> {
  try {
    const gpu = await initGPU();
    if (!gpu) {
      return calculateAverageDifferencesCPU(sequences);
    }

    if (sequences.length === 0) return [];

    const minNumbers = sequences.map(sequence => maxOf(sequence));
    const maxOfMins = minOf(minNumbers);

    const xStep = 5;
    const xMax = Math.ceil(maxOfMins / xStep) * xStep;
    const xValues = Float32Array.from({length: Math.floor(xMax / xStep) + 1}, (_, i) => i * xStep);

    const maxSeqLength = maxOf(sequences.map(s => s.length));
    const sortedFlat = new Float32Array(sequences.length * maxSeqLength);
    const seqLengths = new Float32Array(sequences.length);
    for (let i = 0; i < sequences.length; i++) {
      const sorted = [...sequences[i]].sort((a, b) => a - b);
      seqLengths[i] = sorted.length;
      for (let j = 0; j < sorted.length; j++) {
        sortedFlat[i * maxSeqLength + j] = sorted[j];
      }
      for (let j = sorted.length; j < maxSeqLength; j++) {
        sortedFlat[i * maxSeqLength + j] = Infinity;
      }
    }
    const maxSteps = Math.ceil(Math.log2(Math.max(2, maxSeqLength))) + 1;

    const realPrimeCounts = primeCountPrefix(xMax);
    const realPrimeCountsInput = Float32Array.from(realPrimeCounts);

    const averageKernel = gpu.createKernel(function(sortedSequences: number[], seqLengths: number[], xValues: number[], realPrimeCounts: number[]) {
      const seqCount = this.constants.sequenceCount;
      const maxSeqLength = this.constants.maxSeqLength;
      const maxSteps = this.constants.maxSteps;
      const x = xValues[this.thread.x];
      let sum = 0;
      for (let s = 0; s < seqCount; s++) {
        const base = s * maxSeqLength;
        let low = 0;
        let high = seqLengths[s];
        for (let step = 0; step < maxSteps; step++) {
          if (low >= high) {
            break;
          }
          const mid = Math.floor((low + high) / 2);
          if (sortedSequences[base + mid] <= x) {
            low = mid + 1;
          } else {
            high = mid;
          }
        }
        sum += low - realPrimeCounts[Math.floor(x)];
      }
      return sum / seqCount;
    }).setConstants({ sequenceCount: sequences.length, maxSeqLength, maxSteps }).setOutput([xValues.length]);

    const averages = averageKernel(sortedFlat, seqLengths, xValues, realPrimeCountsInput) as Float32Array;

    const result: {x: number, averageDifference: number}[] = [];
    for (let i = 0; i < xValues.length; i++) {
      result.push({ x: xValues[i], averageDifference: averages[i] });
    }

    if (result.some(point => !Number.isFinite(point.averageDifference))) {
      return calculateAverageDifferencesCPU(sequences);
    }
    return result;
  } catch (e) {
    console.warn('GPU average differences failed, using CPU fallback:', e);
    return calculateAverageDifferencesCPU(sequences);
  }
}

export function calculateAverageDifferencesCPU(sequences: number[][]): {x: number, averageDifference: number}[] {
  if (sequences.length === 0) return [];

  const minNumbers = sequences.map(sequence => maxOf(sequence));
  const maxOfMins = minOf(minNumbers);

  const xStep = 5;
  const xMax = Math.ceil(maxOfMins / xStep) * xStep;
  const realPrimeCounts = primeCountPrefix(Math.max(0, xMax));
  const sortedSequences = sequences.map(sequence => [...sequence].sort((a, b) => a - b));
  const cursors = sortedSequences.map(() => 0);
  const result: {x: number, averageDifference: number}[] = [];

  for (let x = 0; x <= xMax; x += xStep) {
    let sumDifferences = 0;
    for (let s = 0; s < sortedSequences.length; s++) {
      const sorted = sortedSequences[s];
      while (cursors[s] < sorted.length && sorted[cursors[s]] <= x) {
        cursors[s]++;
      }
      sumDifferences += cursors[s] - realPrimeCounts[x];
    }
    result.push({x, averageDifference: sumDifferences / sortedSequences.length});
  }

  return result;
}

export async function calculateAverageDifferences(sequences: number[][]): Promise<{x: number, averageDifference: number}[]> {
  return calculateAverageDifferencesGPU(sequences);
}
