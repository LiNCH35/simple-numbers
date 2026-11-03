<template>
  <div class="container">
    <div class="layout">
      <aside class="sidebar">
        <div class="stats">
          <div class="stat"><span class="stat-label">Number</span><span class="stat-value">{{ currentNumber }}</span></div>
          <div class="stat"><span class="stat-label">Count</span><span class="stat-value">{{ myListOfSimple.length }}</span></div>
          <div class="stat"><span class="stat-label">Probability</span><span class="stat-value">{{ currentProbability.toFixed(3) }}</span></div>
          <div class="stat" v-if="skippedCount > 0"><span class="stat-label">Skipped</span><span class="stat-value">{{ skippedCount }}</span></div>
          <div class="stat" v-if="truncatedAdds > 0"><span class="stat-label truncated-warning">Truncated</span><span class="stat-value truncated-warning">{{ truncatedAdds }}</span></div>
          <div class="stat" v-if="generationTime > 0"><span class="stat-label">Time</span><span class="stat-value">{{ generationTime.toFixed(2) }}s</span></div>
        </div>

        <p v-if="truncatedAdds > 0" class="truncated-note">Accuracy reduced by the combination budget — use a larger tolerance.</p>

        <div class="controls">
          <div class="buttons">
            <button class="primary" @click="getListWrapper">List {{ maxSimples }}</button>
            <button @click="generateMultipleSequences">Generate Multiple</button>
          </div>

          <!-- Прогресс бар генерации -->
          <div v-if="isGenerating" class="progress-container">
            <h4>Generating Sequences...</h4>
            <div class="progress-bar">
              <div class="progress-fill" :style="{width: generationProgress + '%'}"></div>
            </div>
            <div class="progress-text">{{ Math.round(generationProgress) }}%<span v-if="progressMode === 'multiple'"> / Sequence {{ Math.floor(generationProgress / (100 / sequenceCount)) + 1 }} of {{ sequenceCount }}</span><span v-else> / {{ progressCurrent }} / {{ progressTotal }} numbers</span></div>
          </div>

          <div class="settings">
            <label class="check-label">
              <input type="checkbox" v-model="logs">
              Logs
            </label>
            <label class="check-label">
              <input type="checkbox" v-model="calibrated">
              Calibrated (Cramér)
            </label>
            <label>
              Tolerance:
              <select v-model="tolerance">
                <option :value="1e-4">1e-4 (fastest)</option>
                <option :value="1e-6">1e-6 (fast)</option>
                <option :value="1e-9">1e-9 (default)</option>
                <option :value="1e-12">1e-12 (slow)</option>
                <option :value="1e-15">1e-15 (may be very slow)</option>
              </select>
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
      </aside>

      <main class="main-pane">
        <div v-if="showChart" class="chart-container">
          <div v-if="multipleSequences.length <= 1" class="single-chart-container">
            <h3>Difference Distribution</h3>
            <canvas ref="chartCanvas" width="800" height="400"></canvas>
          </div>

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
              <canvas :ref="el => setSequenceCanvas(index, el)" width="800" height="400"></canvas>
            </div>
          </div>

          <!-- Усредненный график -->
          <div v-if="multipleSequences.length > 1" class="average-chart-container">
            <h3>Average Difference Distribution</h3>
            <canvas ref="averageChartCanvas" width="800" height="400"></canvas>
          </div>
        </div>

        <div v-else class="empty-state">
          <p>Run <strong>List</strong> to build the difference distribution.</p>
          <p class="empty-state-hint">Generate Multiple runs several sequences, compares them and shows the average.</p>
        </div>

        <div class="experiment-section">
          <h3>Experiment Analysis — avg diff vs π(x)</h3>
          <p v-if="analysisError" class="experiment-error">
            analysis.json unavailable ({{ analysisError }}). Generate it with scripts/run-experiment.mjs and scripts/analyze-results.mjs.
          </p>
          <p v-else-if="analysisLoading" class="experiment-note">Loading analysis.json...</p>
          <template v-else-if="analysisGroups.length > 0">
            <div class="experiment-meta">
              <span>{{ analysisTotalRuns }} runs · generated {{ analysisGeneratedAt }}</span>
            </div>
            <div class="experiment-groups">
              <label v-for="group in analysisGroups" :key="group.key" class="check-label">
                <input type="checkbox" v-model="experimentVisible[group.key]">
                {{ group.key }}
              </label>
            </div>
            <div class="experiment-table">
              <table>
                <thead>
                  <tr>
                    <th>Group</th>
                    <th>Runs</th>
                    <th>x</th>
                    <th>π(x)</th>
                    <th>Avg diff</th>
                    <th>±σ</th>
                    <th>Rel dev</th>
                    <th>Slope</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="group in analysisGroups" :key="group.key">
                    <td>{{ group.key }}</td>
                    <td>{{ group.runs }}</td>
                    <td>{{ group.final.x }}</td>
                    <td>{{ group.final.real }}</td>
                    <td>{{ formatDiff(group.final.avgDiff) }}</td>
                    <td>{{ group.final.std === null ? '-' : formatDiff(group.final.std) }}</td>
                    <td>{{ (group.final.relDev * 100).toFixed(3) }}%</td>
                    <td>{{ group.slope.toExponential(2) }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <canvas ref="experimentChartCanvas" width="900" height="420"></canvas>
          </template>
        </div>
      </main>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, onMounted, onUnmounted, watch } from "vue";
import { useProbability } from '../composables/useProbability';
import { useSequenceGeneration } from '../composables/useSequenceGeneration';
import { useChartManagement } from '../composables/useChartManagement';
import { useExperimentAnalysis } from '../composables/useExperimentAnalysis';
import { ChartRenderer } from '../utils/chartRenderer';

const initialValue = [2, 3];
const myListOfSimple = ref<number[]>(initialValue);
const currentNumber = ref(initialValue[initialValue.length - 1] + 1);
const logs = ref(false);
const calibrated = ref(false);
const maxSimples = ref(25);
const tolerance = ref(1e-9);
const sequenceCount = ref(3);

// Probability composable
const {
  currentProbability,
  currentProbabilitySum,
  combinationCount,
  skippedCount,
  truncatedAdds,
  calculateProbability,
  addProbabilityContributions,
  resetProbabilityCache
} = useProbability(myListOfSimple, tolerance, logs);

// Sequence generation composable
const {
  result,
  generationStartTime,
  generationTime,
  generationProgress,
  isGenerating,
  progressMode,
  progressCurrent,
  progressTotal,
  getList,
  getListFast
} = useSequenceGeneration(
  myListOfSimple,
  currentNumber,
  currentProbability,
  currentProbabilitySum,
  addProbabilityContributions,
  resetProbabilityCache,
  calculateProbability,
  logs,
  initialValue,
  calibrated
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

const {
  groups: analysisGroups,
  generatedAt: analysisGeneratedAt,
  totalRuns: analysisTotalRuns,
  isLoading: analysisLoading,
  error: analysisError,
  loadAnalysis
} = useExperimentAnalysis();

const experimentVisible = ref<Record<string, boolean>>({});
const experimentChartCanvas = ref<HTMLCanvasElement | null>(null);

const visibleExperimentCurves = computed(() =>
  analysisGroups.value
    .filter((group) => experimentVisible.value[group.key] !== false)
    .map((group) => ({ key: group.key, colorIndex: group.colorIndex, points: group.points }))
);

function formatDiff(value: number): string {
  return Math.round(value).toLocaleString('en-US');
}

function drawExperimentChart() {
  const canvas = experimentChartCanvas.value;
  if (!canvas) return;
  const curves = visibleExperimentCurves.value;
  if (curves.length === 0) return;
  const width = canvas.clientWidth || canvas.width;
  if (width > 0) {
    canvas.width = Math.round(width);
    canvas.height = 420;
  }
  const renderer = new ChartRenderer(canvas);
  renderer.renderExperimentCurves(curves);
}

watch(experimentVisible, () => drawExperimentChart(), { deep: true });

async function getListWrapper() {
  await getList(maxSimples.value, showChart);
  multipleSequences.value = [];
  currentSequenceIndex.value = 0;
  drawDistributionChart(myListOfSimple.value);
}

async function getListFastWrapper() {
  await getListFast(maxSimples.value, showChart);
}

async function generateMultipleSequences() {
  showChart.value = false;
  
  generationStartTime.value = Date.now();
  generationTime.value = 0;
  generationProgress.value = 0;
  progressMode.value = 'multiple';
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
}

let resizeTimer: ReturnType<typeof setTimeout> | undefined;

function handleResize() {
  if (resizeTimer !== undefined) clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    resizeTimer = undefined;
    drawExperimentChart();
    if (!showChart.value) return;
    if (multipleSequences.value.length > 1) drawMultipleSequencesChart();
    else drawDistributionChart(myListOfSimple.value);
  }, 150);
}

onMounted(async () => {
  window.addEventListener('resize', handleResize);
  const loaded = await loadAnalysis();
  if (loaded) {
    const visibility: Record<string, boolean> = {};
    analysisGroups.value.forEach((group) => {
      visibility[group.key] = true;
    });
    experimentVisible.value = visibility;
    await nextTick();
    drawExperimentChart();
  }
});
onUnmounted(() => {
  window.removeEventListener('resize', handleResize);
  if (resizeTimer !== undefined) clearTimeout(resizeTimer);
});
</script>

<style src="./WelcomeItem.css"></style>
