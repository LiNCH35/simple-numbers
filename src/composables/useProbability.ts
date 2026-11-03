import { ref } from 'vue';
import { ProbabilityCalculator } from '../core/probability.mjs';

export function useProbability(myListOfSimple: any, tolerance: any, logs: any) {
  const combinationCount = ref(0);
  const skippedCount = ref(0);
  const truncatedAdds = ref(0);
  const currentProbabilitySum = ref(0);
  const currentProbability = ref(0.5);

  let calculator: any = null;

  function myLog(...args: any[]) {
    if (logs.value) {
      console.log(...args);
    }
  }

  function readTolerance() {
    const value = Number(tolerance.value);
    if (!Number.isFinite(value) || value <= 0) {
      throw new Error('tolerance must be a positive finite number');
    }
    return value;
  }

  function syncFromCalculator(source: any = calculator, logIt = true) {
    currentProbabilitySum.value = source.sum;
    currentProbability.value = source.probability;
    combinationCount.value = source.combinations;
    skippedCount.value = source.skipped;
    if (logIt) {
      myLog({
        combinations: source.combinations,
        skipped: source.skipped,
        probabilitySum: source.sum,
        probability: source.probability
      });
    }
  }

  function rebuildCalculator(base: number[]) {
    truncatedAdds.value = 0;
    calculator = new ProbabilityCalculator(Infinity, readTolerance());
    for (const number of base) {
      calculator.addPrime(number);
    }
    syncFromCalculator();
  }

  function calculateProbability() {
    rebuildCalculator(myListOfSimple.value);
    return currentProbability.value;
  }

  function addProbabilityContributions(newPrime: number) {
    const expectedBaseLength = myListOfSimple.value.length - 1;
    if (!calculator || calculator.primes.length !== expectedBaseLength) {
      rebuildCalculator(myListOfSimple.value.slice(0, expectedBaseLength));
    }
    calculator.addPrime(newPrime);
    if (calculator.lastAddTruncated) {
      truncatedAdds.value++;
    }
    syncFromCalculator();
    return { newCombinations: [], newContributions: [] };
  }

  function resetProbabilityCache() {
    calculator = null;
    currentProbabilitySum.value = 0;
  }

  function initializeProbabilityCache() {
    calculateProbability();
  }

  return {
    combinationCount,
    skippedCount,
    truncatedAdds,
    currentProbabilitySum,
    currentProbability,
    calculateProbability,
    addProbabilityContributions,
    resetProbabilityCache,
    initializeProbabilityCache
  };
}
