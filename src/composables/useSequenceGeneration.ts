import { ref, nextTick } from 'vue';

export function useSequenceGeneration(
  myListOfSimple: any,
  currentNumber: any,
  currentProbability: any,
  currentProbabilitySum: any,
  addProbabilityContributions: any,
  resetProbabilityCache: any,
  calculateProbability: any,
  logs: any,
  initialValue: number[]
) {
  const result = ref<[number, number][][]>([]);
  const generationStartTime = ref<number>(0);
  const generationTime = ref<number>(0);
  const generationProgress = ref<number>(0);
  const isGenerating = ref<boolean>(false);

  function myLog(...args: any[]) {
    if (logs.value) {
      console.log(...args);
    }
  }

  function getNextSimpleByStep() {
    const result = isNextSimple();
    
    if (result) {
      const newPrime = currentNumber.value;
      myListOfSimple.value = [...myListOfSimple.value, newPrime];
      
      addProbabilityContributions(newPrime);
      currentProbability.value = 1 - currentProbabilitySum.value;
      
      nextTick();
      
      myLog('simple');
    } else {
      myLog('not simple');
    }
    currentNumber.value++;
    return result;
  }

  function getNextSimple() {
    const min = currentNumber.value + 1;
    const max = min + (1 / currentProbability.value);
    currentNumber.value = Math.floor(Math.random() * (max - min)) + min;
    myListOfSimple.value = [...myListOfSimple.value, currentNumber.value];
    addProbabilityContributions(currentNumber.value);
    currentProbability.value = 1 - currentProbabilitySum.value;
    nextTick();
  }

  function isNextSimple() {
    const randomNumber = Math.random();
    return randomNumber <= currentProbability.value;
  }

  async function getList(maxSimples: number, showChart: any) {
    showChart.value = false;
    
    generationStartTime.value = Date.now();
    generationTime.value = 0;
    
    myListOfSimple.value = initialValue;
    currentNumber.value = myListOfSimple.value[myListOfSimple.value.length - 1] + 1;
    
    resetProbabilityCache();
    calculateProbability();

    do {
      getNextSimple();
      await nextTick();
      await new Promise(resolve => setTimeout(resolve, 100));
    } while (maxSimples > myListOfSimple.value.length);
    
    generationTime.value = (Date.now() - generationStartTime.value) / 1000;
    
    result.value.push(myListOfSimple.value.map((v, i) => [v, i]));
  }

  async function getListFast(maxSimples: number, showChart: any) {
    showChart.value = false;
    
    generationStartTime.value = Date.now();
    generationTime.value = 0;
    
    myListOfSimple.value = initialValue;
    currentNumber.value = myListOfSimple.value[myListOfSimple.value.length - 1] + 1;
    
    resetProbabilityCache();
    calculateProbability();

    do {
      getNextSimple();
    } while (maxSimples > myListOfSimple.value.length);
    
    generationTime.value = (Date.now() - generationStartTime.value) / 1000;
    
    result.value.push(myListOfSimple.value.map((v, i) => [v, i]));
  }

  return {
    result,
    generationStartTime,
    generationTime,
    generationProgress,
    isGenerating,
    getNextSimpleByStep,
    getNextSimple,
    isNextSimple,
    getList,
    getListFast
  };
}
