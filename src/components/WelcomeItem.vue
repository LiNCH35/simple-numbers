<template>
  <div class="container">
    <div class="stats">
      <span>Number: {{ currentNumber }}</span>
      <span>Count: {{ myListOfSimple.length }}</span>
      <span>Probability: {{ currentProbability.toFixed(3) }}</span>
      <span v-if="generationTime > 0">Time: {{ generationTime.toFixed(2) }}s</span>
    </div>
    
    <div class="controls">
      <div class="buttons">
        <button @click="calculateProbability">Calculate</button>
        <button @click="getNextSimple">Next</button>
        <button @click="getNextSimpleByStep">Step</button>
        <button @click="getListWrapper">List {{ maxSimples }}</button>
        <button @click="drawDistributionChartWrapper">Show Chart</button>
        <button @click="generateMultipleSequences">Generate Multiple</button>
      </div>
      
      <!-- Прогресс бар генерации -->
      <div v-if="isGenerating" class="progress-container">
        <h4>Generating Sequences...</h4>
        <div class="progress-bar">
          <div class="progress-fill" :style="{width: generationProgress + '%'}"></div>
        </div>
        <div class="progress-text">{{ Math.round(generationProgress) }}% / Sequence {{ Math.floor(generationProgress / (100 / sequenceCount)) + 1 }} of {{ sequenceCount }}</div>
      </div>
      
      <div class="settings">
        <label>
          <input type="checkbox" v-model="logs">
          Logs
        </label>
        <label>
          Sensitivity:
          <input type="number" v-model="sensitivity" min="1" max="10">
        </label>
        <label>
          Sequences:
          <input type="number" v-model="sequenceCount" min="1" max="100">
        </label>
        <label>
          Max:
          <input type="number" v-model="maxSimples" min="1" max="100">
        </label>
      </div>
    </div>
    
    <div class="result">
      <div class="sequence">
        <span v-for="(num, index) in myListOfSimple" :key="index">{{ num }}</span>
      </div>
    </div>
    
    <div v-if="showChart" class="chart-container">
      <!-- Переключатель последовательностей -->
      <div v-if="multipleSequences.length > 1" class="sequence-selector">
        <h4>Sequence Navigation</h4>
        <div class="sequence-controls">
          <button @click="previousSequence" :disabled="currentSequenceIndex === 0">← Previous</button>
          <span class="sequence-indicator">Sequence {{ currentSequenceIndex + 1 }} / {{ multipleSequences.length }}</span>
          <button @click="nextSequence" :disabled="currentSequenceIndex === multipleSequences.length - 1">Next →</button>
        </div>
      </div>
      
      <!-- Отдельные канвасы для каждой последовательности -->
      <div v-if="multipleSequences.length > 1" class="separate-charts-container">
        <h4>Individual Sequence Charts</h4>
        <div v-for="(sequence, index) in multipleSequences" :key="index" class="separate-chart" v-show="index === currentSequenceIndex">
          <h5>Sequence {{ index + 1 }}</h5>
          <canvas :ref="el => setSequenceCanvas(index, el)" width="600" height="400"></canvas>
        </div>
      </div>
      
      <!-- Усредненный график -->
      <div v-if="multipleSequences.length > 1" class="average-chart-container">
        <h3>Average Difference Distribution</h3>
        <canvas ref="averageChartCanvas" width="800" height="400"></canvas>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { useProbability } from '../composables/useProbability';
import { useSequenceGeneration } from '../composables/useSequenceGeneration';
import { useChartManagement } from '../composables/useChartManagement';

const initialValue = [2, 3];
const myListOfSimple = ref<number[]>(initialValue);
const currentNumber = ref(initialValue[initialValue.length - 1] + 1);
const logs = ref(false);
const maxSimples = ref(25);
const sensitivity = ref(5);
const sequenceCount = ref(3);

// Probability composable
const {
  currentProbability,
  calculateProbability,
  addProbabilityContributions,
  resetProbabilityCache
} = useProbability(myListOfSimple, sensitivity, logs);

// Sequence generation composable
const {
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
} = useSequenceGeneration(
  myListOfSimple,
  currentNumber,
  currentProbability,
  ref(0),
  addProbabilityContributions,
  resetProbabilityCache,
  calculateProbability,
  logs,
  initialValue
);

// Chart management composable
const {
  showChart,
  chartCanvas,
  multipleSequences,
  sequenceCanvases,
  averageChartCanvas,
  currentSequenceIndex,
  previousSequence,
  nextSequence,
  drawDistributionChart,
  drawMultipleSequencesChart,
  setSequenceCanvas
} = useChartManagement();

const length = computed(() => myListOfSimple.value.length);

async function getListWrapper() {
  await getList(maxSimples.value, showChart);
}

async function getListFastWrapper() {
  await getListFast(maxSimples.value, showChart);
}

function drawDistributionChartWrapper() {
  drawDistributionChart(myListOfSimple.value);
}

async function generateMultipleSequences() {
  showChart.value = false;
  
  generationStartTime.value = Date.now();
  generationTime.value = 0;
  generationProgress.value = 0;
  isGenerating.value = true;
  
  await new Promise(resolve => setTimeout(resolve, 100));
  
  multipleSequences.value = [];
  
  const originalMyListOfSimple = [...myListOfSimple.value];
  const originalCurrentNumber = currentNumber.value;
  
  for (let seq = 0; seq < sequenceCount.value; seq++) {
    myListOfSimple.value = [...initialValue];
    currentNumber.value = initialValue[initialValue.length - 1] + 1;
    
    resetProbabilityCache();
    calculateProbability();
    
    await getListFastWrapper();
    
    multipleSequences.value.push([...myListOfSimple.value]);
    
    generationProgress.value = ((seq + 1) / sequenceCount.value) * 100;
    
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  
  myListOfSimple.value = originalMyListOfSimple;
  currentNumber.value = originalCurrentNumber;
  
  generationTime.value = (Date.now() - generationStartTime.value) / 1000;
  generationProgress.value = 100;
  isGenerating.value = false;
  
  drawMultipleSequencesChart();
}</script>

<style src="./WelcomeItem.css"></style>
