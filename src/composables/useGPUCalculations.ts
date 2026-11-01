import { isRealPrime } from '../data/primeNumbers';
import { initGPU } from './useGPU';

export async function calculateSequenceDifferencesGPU(sequence: number[]): Promise<{x: number, difference: number}[]> {
  const gpu = await initGPU();
  if (!gpu) {
    return calculateSequenceDifferencesCPU(sequence);
  }

  const maxNumber = Math.max(...sequence);
  const xStep = 5;
  const xMax = Math.ceil(maxNumber / xStep) * xStep;
  const xValues = Array.from({length: Math.floor(xMax / xStep) + 1}, (_, i) => i * xStep);

  const countPseudoKernel = gpu.createKernel(function(sequence: number[], x: number) {
    let count = 0;
    for (let i = 0; i < this.constants.sequenceLength; i++) {
      if (sequence[i] <= x) {
        count++;
      }
    }
    return count;
  }).setConstants({ sequenceLength: sequence.length }).setOutput([xValues.length]);

  const realPrimeCounts = new Float32Array(xMax + 1);
  let realPrimeCount = 0;
  for (let i = 0; i <= xMax; i++) {
    if (isRealPrime(i)) {
      realPrimeCount++;
    }
    realPrimeCounts[i] = realPrimeCount;
  }

  const pseudoCounts = countPseudoKernel(sequence, xValues) as Float32Array;

  const differences: {x: number, difference: number}[] = [];
  for (let i = 0; i < xValues.length; i++) {
    const x = xValues[i];
    const pseudoCount = pseudoCounts[i];
    const realCount = realPrimeCounts[Math.floor(x)];
    differences.push({ x, difference: pseudoCount - realCount });
  }

  return differences;
}

export function calculateSequenceDifferencesCPU(sequence: number[]): {x: number, difference: number}[] {
  const maxNumber = Math.max(...sequence);
  const xStep = 5;
  const xMax = Math.ceil(maxNumber / xStep) * xStep;
  const differences: {x: number, difference: number}[] = [];
  
  for (let x = 0; x <= xMax; x += xStep) {
    const pseudoCount = sequence.filter(num => num <= x).length;
    const realCount = Array.from({length: x + 1}, (_, i) => i).filter(isRealPrime).length;
    const difference = pseudoCount - realCount;
    
    differences.push({x, difference});
  }
  
  return differences;
}

export async function calculateSequenceDifferences(sequence: number[]): Promise<{x: number, difference: number}[]> {
  return calculateSequenceDifferencesGPU(sequence);
}

export async function calculateAverageDifferencesGPU(sequences: number[][]): Promise<{x: number, averageDifference: number}[]> {
  const gpu = await initGPU();
  if (!gpu) {
    return calculateAverageDifferencesCPU(sequences);
  }

  if (sequences.length === 0) return [];

  const minNumbers = sequences.map(sequence => Math.max(...sequence));
  const maxOfMins = Math.min(...minNumbers);

  const xStep = 5;
  const xMax = Math.ceil(maxOfMins / xStep) * xStep;
  const xValues = Array.from({length: Math.floor(xMax / xStep) + 1}, (_, i) => i * xStep);

  const maxSeqLength = Math.max(...sequences.map(s => s.length));
  const flattenedSequences = new Float32Array(sequences.length * maxSeqLength);
  for (let i = 0; i < sequences.length; i++) {
    for (let j = 0; j < sequences[i].length; j++) {
      flattenedSequences[i * maxSeqLength + j] = sequences[i][j];
    }
    for (let j = sequences[i].length; j < maxSeqLength; j++) {
      flattenedSequences[i * maxSeqLength + j] = -1;
    }
  }

  const realPrimeCounts = new Float32Array(xMax + 1);
  let realPrimeCount = 0;
  for (let i = 0; i <= xMax; i++) {
    if (isRealPrime(i)) {
      realPrimeCount++;
    }
    realPrimeCounts[i] = realPrimeCount;
  }

  const countAllPseudoKernel = gpu.createKernel(function(sequences: number[], x: number, maxSeqLength: number) {
    const seqCount = this.constants.sequenceCount;
    const counts = new Float32Array(seqCount);
    
    for (let s = 0; s < seqCount; s++) {
      let count = 0;
      for (let i = 0; i < maxSeqLength; i++) {
        const val = sequences[s * maxSeqLength + i];
        if (val >= 0 && val <= x) {
          count++;
        }
      }
      counts[s] = count;
    }
    
    return counts;
  }).setConstants({ sequenceCount: sequences.length }).setOutput([xValues.length]);

  const allPseudoCounts = countAllPseudoKernel(flattenedSequences, xValues, maxSeqLength) as Float32Array[];

  const result: {x: number, averageDifference: number}[] = [];
  for (let i = 0; i < xValues.length; i++) {
    const x = xValues[i];
    const realCount = realPrimeCounts[Math.floor(x)];
    
    let sumDifferences = 0;
    for (let s = 0; s < sequences.length; s++) {
      const pseudoCount = (allPseudoCounts as any)[i * sequences.length + s];
      sumDifferences += pseudoCount - realCount;
    }
    
    result.push({
      x,
      averageDifference: sumDifferences / sequences.length
    });
  }

  return result;
}

export function calculateAverageDifferencesCPU(sequences: number[][]): {x: number, averageDifference: number}[] {
  if (sequences.length === 0) return [];
  
  const minNumbers = sequences.map(sequence => Math.max(...sequence));
  const maxOfMins = Math.min(...minNumbers);
  
  const xStep = 5;
  const xMax = Math.ceil(maxOfMins / xStep) * xStep;
  const points: {x: number, differences: number[]}[] = [];
  
  for (let x = 0; x <= xMax; x += xStep) {
    const differences: number[] = [];
    
    sequences.forEach(sequence => {
      const pseudoCount = sequence.filter(num => num <= x).length;
      const realCount = Array.from({length: x + 1}, (_, i) => i).filter(isRealPrime).length;
      const difference = pseudoCount - realCount;
      differences.push(difference);
    });
    
    points.push({x, differences});
  }
  
  const result = points.map(point => ({
    x: point.x,
    averageDifference: point.differences.reduce((sum, diff) => sum + diff, 0) / point.differences.length
  }));
  
  return result;
}

export async function calculateAverageDifferences(sequences: number[][]): Promise<{x: number, averageDifference: number}[]> {
  return calculateAverageDifferencesGPU(sequences);
}
