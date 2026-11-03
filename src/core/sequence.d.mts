import { ProbabilityCalculator } from './probability.mjs';

export declare function mulberry32(seed: number): () => number;
export declare function isPrime(n: number): boolean;
export declare function primeCountPrefix(limit: number): Uint32Array;
export declare function countPrimesUpTo(limit: number): number;

export declare interface DifferencePoint {
  x: number;
  difference: number;
}

export declare function calculateSequenceDifferences(sequence: number[], xMax: number, xStep?: number): DifferencePoint[];

export declare interface GeneratorResult {
  sequence: number[];
  probability: number;
  probabilitySum: number;
  combinations: number;
  skippedCombinations: number;
  truncatedAdds: number;
  currentNumber: number;
}

export declare interface Generator {
  generate(count: number): GeneratorResult;
  calculator: ProbabilityCalculator;
}

export declare function createGenerator(options?: {
  seed?: number;
  sensitivity?: number;
  tolerance?: number;
  maxCombinations?: number;
  initial?: number[];
  mode?: 'jump' | 'step';
  calibrated?: boolean;
  trackProbability?: boolean;
}): Generator;
