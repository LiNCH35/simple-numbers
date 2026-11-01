import { ref, computed, watch } from 'vue';

export function useProbability(myListOfSimple: any, sensitivity: any, logs: any) {
  const probabilityCache = ref<Map<string, number>>(new Map());
  const currentProbabilitySum = ref(0);
  const currentProbability = ref(0.5);

  const length = computed(() => myListOfSimple.value.length);

  function myLog(...args: any[]) {
    if (logs.value) {
      console.log(...args);
    }
  }

  function calculateProbability() {
    currentProbabilitySum.value = getProbabilityFromCache();
    currentProbability.value = 1 - currentProbabilitySum.value;
  }

  function getProbabilityFromCache() {
    if (length.value === 0) return 0;
    
    if (probabilityCache.value.size === 0) {
      initializeProbabilityCache();
    }
    
    return currentProbabilitySum.value;
  }

  function initializeProbabilityCache() {
    probabilityCache.value.clear();
    currentProbabilitySum.value = 0;
    
    for (let i = 1; i < Math.pow(2, length.value); i++) {
      const count = i.toString(2).split('1').length - 1;
      if (count > sensitivity.value) {
        continue;
      }
      
      const combination = getCombinationFromBits(i);
      const product = getProductForCombination(combination);
      const sign = combination.length % 2 === 1 ? 1 : -1;
      const contribution = sign / product;
      
      probabilityCache.value.set(combination.join(','), contribution);
      currentProbabilitySum.value += contribution;
      
      myLog({ combination, product, sign, contribution });
    }
  }

  function addProbabilityContributions(newPrime: number) {
    const newCombinations: string[] = [];
    const newContributions: number[] = [];
    
    for (let i = 1; i < Math.pow(2, length.value - 1); i++) {
      const count = i.toString(2).split('1').length - 1;
      if (count > sensitivity.value - 1) {
        continue;
      }
      
      const existingCombination = getCombinationFromBits(i);
      const newCombination = [...existingCombination, newPrime];
      
      if (newCombination.length > sensitivity.value) {
        continue;
      }
      
      const product = getProductForCombination(newCombination);
      const sign = newCombination.length % 2 === 1 ? 1 : -1;
      const contribution = sign / product;
      
      const key = newCombination.join(',');
      newCombinations.push(key);
      newContributions.push(contribution);
      
      probabilityCache.value.set(key, contribution);
      currentProbabilitySum.value += contribution;
      
      myLog({ newCombination, product, sign, contribution });
    }
    
    if (sensitivity.value >= 1) {
      const singleKey = newPrime.toString();
      const singleContribution = 1 / newPrime;
      
      if (!probabilityCache.value.has(singleKey)) {
        probabilityCache.value.set(singleKey, singleContribution);
        currentProbabilitySum.value += singleContribution;
        newCombinations.push(singleKey);
        newContributions.push(singleContribution);
        
        myLog({ singleCombination: [newPrime], product: newPrime, sign: 1, contribution: singleContribution });
      }
    }
    
    return { newCombinations, newContributions };
  }

  function getCombinationFromBits(bits: number): number[] {
    const combination: number[] = [];
    for (let n = 0; n < length.value; n++) {
      if (bits & (1 << n)) {
        combination.push(myListOfSimple.value[n]);
      }
    }
    return combination;
  }

  function getProductForCombination(combination: number[]): number {
    let product = 1;
    for (const num of combination) {
      product *= num;
    }
    return product;
  }

  function resetProbabilityCache() {
    probabilityCache.value.clear();
    currentProbabilitySum.value = 0;
  }

  watch(sensitivity, () => {
    resetProbabilityCache();
    calculateProbability();
  });

  return {
    probabilityCache,
    currentProbabilitySum,
    currentProbability,
    calculateProbability,
    addProbabilityContributions,
    resetProbabilityCache,
    initializeProbabilityCache
  };
}
