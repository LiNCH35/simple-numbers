function* indexCombinations(n, k) {
  if (k < 0 || k > n || n === 0) return;
  const indices = new Array(k);
  for (let i = 0; i < k; i++) indices[i] = i;
  while (true) {
    yield indices.slice();
    let i = k - 1;
    while (i >= 0 && indices[i] === n - k + i) i--;
    if (i < 0) return;
    indices[i]++;
    for (let j = i + 1; j < k; j++) indices[j] = indices[j - 1] + 1;
  }
}

export class ProbabilityCalculator {
  constructor(
    sensitivity = Infinity,
    tolerance = 1e-12,
    maxCombinations = Infinity,
    maxCombinationsPerPrime = 30000000
  ) {
    if (sensitivity !== Infinity && (!Number.isFinite(sensitivity) || sensitivity < 0)) {
      throw new Error('sensitivity must be a non-negative finite number or Infinity');
    }
    if (!Number.isFinite(tolerance) || tolerance <= 0) {
      throw new Error('tolerance must be a positive finite number');
    }
    this.sensitivity = sensitivity === Infinity ? Infinity : Math.floor(sensitivity);
    this.tolerance = tolerance;
    this.limit = 1 / tolerance;
    this.maxCombinations = maxCombinations === Infinity ? Infinity : Math.floor(maxCombinations);
    this.maxCombinationsPerPrime =
      maxCombinationsPerPrime === Infinity ? Infinity : Math.floor(maxCombinationsPerPrime);
    this.primes = [];
    this.sum = 0;
    this.compensation = 0;
    this.combinations = 0;
    this.skipped = 0;
    this.perAddCombinations = 0;
    this.lastAddTruncated = false;
  }

  get probability() {
    return 1 - this.sum;
  }

  addTerm(term) {
    const t = this.sum + term;
    if (Math.abs(this.sum) >= Math.abs(term)) {
      this.compensation += (this.sum - t) + term;
    } else {
      this.compensation += (term - t) + this.sum;
    }
    this.sum = t;
    this.combinations++;
    this.perAddCombinations++;
    if (this.perAddCombinations > this.maxCombinationsPerPrime) {
      this.lastAddTruncated = true;
    }
    if (this.combinations > this.maxCombinations) {
      throw new Error(
        `combination hard cap exceeded (${this.maxCombinations}). ` +
          'Increase tolerance or maxCombinations to continue.'
      );
    }
  }

  addPrime(newPrime) {
    const prev = this.primes;
    this.perAddCombinations = 0;
    this.lastAddTruncated = false;
    if (this.sensitivity >= 1) {
      if (newPrime <= this.limit) {
        const subsetCap = Math.min(this.sensitivity, prev.length + 1) - 1;
        this.walkSubsets(prev, subsetCap, newPrime);
      } else {
        this.skipped++;
      }
    }
    this.sum += this.compensation;
    this.compensation = 0;
    let i = prev.length;
    while (i > 0 && prev[i - 1] > newPrime) i--;
    this.primes.splice(i, 0, newPrime);
    return this.probability;
  }

  walkSubsets(values, cap, baseProduct) {
    const limit = this.limit;
    const walk = (start, product, size) => {
      if (this.lastAddTruncated) {
        this.skipped++;
        return;
      }
      const sign = (size + 1) % 2 === 1 ? 1 : -1;
      this.addTerm(sign / product);
      if (this.lastAddTruncated) return;
      if (size >= cap) return;
      for (let i = start; i < values.length; i++) {
        const nextProduct = product * values[i];
        if (nextProduct > limit) {
          this.skipped += values.length - i;
          break;
        }
        walk(i + 1, nextProduct, size + 1);
        if (this.lastAddTruncated) return;
      }
    };
    walk(0, baseProduct, 0);
  }
}

export function probabilityFor(
  numbers,
  sensitivity = Infinity,
  tolerance = 1e-12,
  maxCombinations = Infinity,
  maxCombinationsPerPrime = 30000000
) {
  const calculator = new ProbabilityCalculator(
    sensitivity,
    tolerance,
    maxCombinations,
    maxCombinationsPerPrime
  );
  for (const number of numbers) calculator.addPrime(number);
  return calculator;
}
