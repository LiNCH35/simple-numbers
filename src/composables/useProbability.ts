import { ref, watch } from 'vue';
import { ProbabilityCalculator } from '../core/probability.mjs';

export function useProbability(myListOfSimple: any, tolerance: any, logs: any, isGenerating: any) {
  const combinationCount = ref(0);
  const skippedCount = ref(0);
  const truncatedAdds = ref(0);
  const currentProbabilitySum = ref(0);
  const currentProbability = ref(0.5);

  let calculator: any = null;
  let refreshRun = 0;

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
    refreshRun++;
    calculator = null;
    currentProbabilitySum.value = 0;
  }

  function initializeProbabilityCache() {
    calculateProbability();
  }

  async function refreshStatsBackground() {
    const run = ++refreshRun;
    let toleranceValue: number;
    try {
      toleranceValue = readTolerance();
    } catch {
      return;
    }
    const base = myListOfSimple.value;
    truncatedAdds.value = 0;
    const calc = new ProbabilityCalculator(Infinity, toleranceValue);
    let chunkStart = performance.now();
    for (const number of base) {
      if (run !== refreshRun) return;
      calc.addPrime(number);
      if (calc.lastAddTruncated) {
        truncatedAdds.value++;
      }
      if (performance.now() - chunkStart >= 16) {
        syncFromCalculator(calc, false);
        await new Promise((resolve) => setTimeout(resolve, 0));
        chunkStart = performance.now();
      }
    }
    if (run !== refreshRun) return;
    calculator = calc;
    syncFromCalculator(calc);
  }

  watch(tolerance, () => {
    if (isGenerating.value) return;
    resetProbabilityCache();
    refreshStatsBackground();
  });

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
