export declare class ProbabilityCalculator {
  sensitivity: number;
  tolerance: number;
  limit: number;
  maxCombinations: number;
  maxCombinationsPerPrime: number;
  primes: number[];
  sum: number;
  compensation: number;
  combinations: number;
  skipped: number;
  perAddCombinations: number;
  lastAddTruncated: boolean;
  readonly probability: number;
  constructor(
    sensitivity?: number,
    tolerance?: number,
    maxCombinations?: number,
    maxCombinationsPerPrime?: number
  );
  addTerm(term: number): void;
  addPrime(newPrime: number): number;
  walkSubsets(values: number[], cap: number, baseProduct: number): void;
}

export declare function probabilityFor(
  numbers: number[],
  sensitivity?: number,
  tolerance?: number,
  maxCombinations?: number,
  maxCombinationsPerPrime?: number
): ProbabilityCalculator;
