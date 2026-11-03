import { ProbabilityCalculator } from './probability.mjs';

export function splitmix32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x9e3779b9) | 0;
    let t = a ^ (a >>> 16);
    t = Math.imul(t, 0x21f0aaad);
    t = t ^ (t >>> 15);
    t = Math.imul(t, 0x735a2d97);
    return ((t = t ^ (t >>> 15)) >>> 0) / 4294967296;
  };
}

export function isPrime(n) {
  if (!Number.isInteger(n) || n < 2) return false;
  if (n < 4) return true;
  if (n % 2 === 0) return false;
  for (let divisor = 3; divisor * divisor <= n; divisor += 2) {
    if (n % divisor === 0) return false;
  }
  return true;
}

export function primeCountPrefix(limit) {
  if (!Number.isInteger(limit) || limit < 0) {
    throw new Error('limit must be a non-negative integer');
  }
  const counts = new Uint32Array(limit + 1);
  const sieve = new Uint8Array(limit + 1);
  let count = 0;
  for (let n = 2; n <= limit; n++) {
    if (sieve[n] === 0) {
      count++;
      for (let multiple = n * n; multiple <= limit; multiple += n) sieve[multiple] = 1;
    }
    counts[n] = count;
  }
  return counts;
}

export function countPrimesUpTo(limit) {
  return primeCountPrefix(limit)[limit];
}

export function calculateSequenceDifferences(sequence, xMax, xStep = 5) {
  if (!Number.isInteger(xStep) || xStep < 1) {
    throw new Error('xStep must be a positive integer');
  }
  const sorted = [...sequence].sort((a, b) => a - b);
  const counts = primeCountPrefix(xMax);
  const points = [];
  let sequenceIndex = 0;
  for (let x = xStep; x <= xMax; x += xStep) {
    while (sequenceIndex < sorted.length && sorted[sequenceIndex] <= x) sequenceIndex++;
    points.push({ x, difference: sequenceIndex - counts[x] });
  }
  return points;
}

export const TWIN_PRIME_CONSTANT = 1.3203236316937392;

export function createGenerator(options = {}) {
  const {
    seed = 42,
    sensitivity = Infinity,
    tolerance = 1e-12,
    maxCombinations = Infinity,
    initial = [2, 3],
    mode = 'jump',
    trackProbability = true,
    jumpGap = 'round',
    twinBias = false
  } = options;

  if (mode !== 'jump' && mode !== 'step') {
    throw new Error(`mode must be "jump" or "step", got: ${mode}`);
  }
  if (!Array.isArray(initial) || initial.length === 0) {
    throw new Error('initial must be a non-empty array');
  }
  if (initial.some(v => !Number.isInteger(v) || v < 2)) {
    throw new Error('initial values must be integers >= 2');
  }
  if (sensitivity !== Infinity && (!Number.isFinite(sensitivity) || sensitivity < 0)) {
    throw new Error(`sensitivity must be a non-negative number or Infinity, got: ${sensitivity}`);
  }
  if (!Number.isFinite(tolerance) || tolerance <= 0) {
    throw new Error(`tolerance must be a positive finite number, got: ${tolerance}`);
  }
  if (typeof trackProbability !== 'boolean') {
    throw new Error(`trackProbability must be a boolean, got: ${trackProbability}`);
  }
  if (jumpGap !== 'round' && jumpGap !== 'floor') {
    throw new Error(`jumpGap must be "round" or "floor", got: ${jumpGap}`);
  }
  if (typeof twinBias !== 'boolean') {
    throw new Error(`twinBias must be a boolean, got: ${twinBias}`);
  }
  if (twinBias && mode !== 'step') {
    throw new Error('twinBias requires step mode');
  }

  const initialList = initial.slice();
  const random = splitmix32(seed);
  const calculator = new ProbabilityCalculator(sensitivity, tolerance, maxCombinations);
  const sequence = initialList.slice();

  for (const prime of initialList) {
    if (trackProbability) calculator.addPrime(prime);
  }

  let currentNumber = initialList[initialList.length - 1] + 1;

  const acceptNumber = (number) => {
    sequence.push(number);
    if (trackProbability) calculator.addPrime(number);
  };

  const nextJump = () => {
    if (jumpGap === 'floor') {
      currentNumber += 1 + Math.floor(-Math.log(1 - random()) * (Math.log(currentNumber) - 0.5));
    } else {
      currentNumber += Math.max(1, Math.round(-Math.log(1 - random()) * Math.log(currentNumber)));
    }
    acceptNumber(currentNumber);
  };

  const nextStep = () => {
    const logX = Math.log(currentNumber);
    let probability = 1 / logX;
    if (twinBias) {
      const compensation = 1 + ((TWIN_PRIME_CONSTANT - 1) / logX) * (1 - 1 / logX);
      if (currentNumber - sequence[sequence.length - 1] === 2) {
        probability = Math.min(1, (probability * TWIN_PRIME_CONSTANT) / compensation);
      } else {
        probability /= compensation;
      }
    }
    const accepted = random() < probability;
    if (accepted) {
      acceptNumber(currentNumber);
    }
    currentNumber++;
    return accepted;
  };

  const generate = (count) => {
    if (!Number.isInteger(count) || count < initialList.length) {
      throw new Error(`count must be an integer >= ${initialList.length}`);
    }
    let truncatedAdds = 0;
    while (sequence.length < count) {
      if (mode === 'jump') nextJump();
      else nextStep();
      if (calculator.lastAddTruncated) truncatedAdds++;
    }
    return {
      sequence: sequence.slice(),
      probability: calculator.probability,
      probabilitySum: calculator.sum,
      combinations: calculator.combinations,
      skippedCombinations: calculator.skipped,
      truncatedAdds,
      currentNumber
    };
  };

  return { generate, calculator };
}
