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
            <button @click="stopGeneration" :disabled="!isGenerating">Stop</button>
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
            <label>
              Tolerance:
              <select v-model="tolerance">
                <option :value="1e-4">1e-4 (fastest)</option>
                <option :value="1e-6">1e-6 (fast)</option>
                <option :value="1e-9">1e-9 (default)</option>
                <option :value="1e-10">1e-10 (precise)</option>
                <option :value="1e-12">1e-12 (slow)</option>
              </select>
            </label>
            <label>
              Seed:
              <input type="number" v-model="seed" min="0" title="splitmix32 seed; multiple sequences use seed, seed+1, ...">
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

        <div class="gap-section">
          <h3>Gap Structure<span v-if="gapSubtitle"> — {{ gapSubtitle }}</span></h3>
          <template v-if="gapAnalysis">
            <div class="gap-stats">
              <span>gaps {{ gapAnalysis.gaps }}</span>
              <span>mean {{ gapAnalysis.meanGap.toFixed(2) }}</span>
              <span>twinIndex {{ gapAnalysis.twinIndex.toFixed(3) }}</span>
              <span>gap=2 {{ gapAnalysis.twinPct.toFixed(1) }}%</span>
              <span>var/mean² {{ gapAnalysis.dispersion.toFixed(2) }}</span>
              <span>mod6 {{ mod6Shares }}</span>
            </div>
            <canvas ref="gapAnalysisCanvas" width="900" height="260"></canvas>
            <div class="gap-compare">
              <label class="check-label">
                <input type="checkbox" v-model="realCompare">
                Compare with real primes
              </label>
              <span v-if="realComparison" class="real-compare-note">
                π(x): model {{ realComparison.count }} / real {{ realComparison.pi }} · twinIndex model {{ gapAnalysis?.twinIndex.toFixed(3) }} / real {{ realComparison.gaps.twinIndex.toFixed(3) }} (×{{ realTwinRatio.toFixed(2) }}) · mean {{ gapAnalysis?.meanGap.toFixed(2) }} / {{ realComparison.gaps.meanGap.toFixed(2) }} · mod6 real {{ realMod6Shares }}
              </span>
              <span v-else-if="compareNote" class="experiment-note">{{ compareNote }}</span>
            </div>
            <canvas v-if="realCompare && realComparison" ref="compareCanvas" width="900" height="300"></canvas>
          </template>
          <p v-else class="experiment-note">Run List or Generate Multiple to see the gap structure.</p>
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
            <div class="experiment-options">
              <label class="check-label">
                <input type="checkbox" v-model="theoryOverlays">
                Theory: Li(x)−π(x) / ±√π(x)
              </label>
              <label class="check-label">
                <input type="checkbox" v-model="experimentLogX">
                log x
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
import { analyzeGaps, type GapAnalysis } from '../composables/useGapAnalysis';
import { usePersistentRef } from '../composables/usePersistentRef';
import { ChartRenderer, type ExperimentOverlays, type ExperimentCurvePoint } from '../utils/chartRenderer';
import { primesUpTo } from '../core/real-primes.mjs';

const initialValue = [2, 3];
const myListOfSimple = ref<number[]>(initialValue);
const currentNumber = ref(initialValue[initialValue.length - 1] + 1);
const logs = usePersistentRef<boolean>('logs', false);
const maxSimples = usePersistentRef<number>('maxSimples', 25);
const tolerance = usePersistentRef<number>('tolerance', 1e-9);
const allowedTolerances = [1e-4, 1e-6, 1e-9, 1e-10, 1e-12];
if (!allowedTolerances.includes(Number(tolerance.value))) {
  tolerance.value = 1e-9;
}
const sequenceCount = usePersistentRef<number>('sequenceCount', 3);
const seed = usePersistentRef<number>('seed', 42);
const isGenerating = ref(false);

// Probability composable
const {
  currentProbability,
  combinationCount,
  skippedCount,
  truncatedAdds
} = useProbability(myListOfSimple, tolerance, logs);

// Sequence generation composable
const {
  result,
  generationStartTime,
  generationTime,
  generationProgress,
  progressMode,
  progressCurrent,
  progressTotal,
  getList,
  getListFast,
  stopRequested,
  stopGeneration,
  dispose: disposeGeneration
} = useSequenceGeneration(
  myListOfSimple,
  currentNumber,
  currentProbability,
  logs,
  initialValue,
  isGenerating,
  seed,
  tolerance,
  { combinations: combinationCount, skipped: skippedCount, truncatedAdds }
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
const theoryOverlays = usePersistentRef<boolean>('theoryOverlays', true);
const experimentLogX = usePersistentRef<boolean>('experimentLogX', false);

const visibleExperimentCurves = computed(() =>
  analysisGroups.value
    .filter((group) => experimentVisible.value[group.key] !== false)
    .map((group) => ({ key: group.key, colorIndex: group.colorIndex, points: group.points }))
);

const experimentOverlays = computed<ExperimentOverlays | null>(() => {
  if (!theoryOverlays.value) return null;
  const visible = analysisGroups.value.filter((group) => experimentVisible.value[group.key] !== false);
  if (visible.length === 0) return null;
  const widest = visible.reduce((a, b) => (b.points.length > a.points.length ? b : a));
  const sample = widest.points.filter((p) => p.real !== undefined && p.li !== undefined);
  if (sample.length === 0) return null;
  return {
    liDiff: sample.map((p) => ({ x: p.x, value: (p.li as number) - (p.real as number) })),
    sqrtPi: sample.map((p) => ({ x: p.x, value: Math.sqrt(p.real as number) }))
  };
});

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
  renderer.renderExperimentCurves(curves, {
    overlays: experimentOverlays.value,
    logX: experimentLogX.value
  });
}

watch(experimentVisible, () => drawExperimentChart(), { deep: true });
watch([theoryOverlays, experimentLogX], () => drawExperimentChart());

async function getListWrapper() {
  await getList(maxSimples.value, showChart);
  multipleSequences.value = [];
  currentSequenceIndex.value = 0;
  drawDistributionChart(myListOfSimple.value);
}

async function getListFastWrapper(seedValue?: number) {
  await getListFast(maxSimples.value, showChart, seedValue);
}

const gapAnalysisCanvas = ref<HTMLCanvasElement | null>(null);
const gapAnalysis = ref<GapAnalysis | null>(null);
const realCompare = usePersistentRef<boolean>('realCompare', false);
const realComparison = ref<{ pi: number; count: number; gaps: GapAnalysis; primes: Int32Array } | null>(null);
const compareCanvas = ref<HTMLCanvasElement | null>(null);
const compareNote = ref('');

const currentGapSequence = computed<number[] | null>(() => {
  if (multipleSequences.value.length > 1) {
    return multipleSequences.value[currentSequenceIndex.value] ?? null;
  }
  return myListOfSimple.value.length > initialValue.length ? myListOfSimple.value : null;
});

const gapSubtitle = computed(() =>
  multipleSequences.value.length > 1 ? `Sequence ${currentSequenceIndex.value + 1}` : ''
);

const mod6Shares = computed(() => {
  const mod6 = gapAnalysis.value?.mod6;
  if (!mod6) return '';
  return `${mod6.m0.toFixed(1)} / ${mod6.m2.toFixed(1)} / ${mod6.m4.toFixed(1)} %`;
});

function drawGapChart() {
  const sequence = currentGapSequence.value;
  gapAnalysis.value = sequence ? analyzeGaps(sequence) : null;
  if (!gapAnalysis.value) return;
  nextTick(() => {
    const canvas = gapAnalysisCanvas.value;
    if (!canvas) return;
    const width = canvas.clientWidth || canvas.width;
    if (width > 0) {
      canvas.width = Math.round(width);
      canvas.height = 260;
    }
    new ChartRenderer(canvas).renderGapHistogram(gapAnalysis.value!.histogram);
  });
}

const realMod6Shares = computed(() => {
  const mod6 = realComparison.value?.gaps.mod6;
  if (!mod6) return '';
  return `${mod6.m0.toFixed(1)} / ${mod6.m2.toFixed(1)} / ${mod6.m4.toFixed(1)} %`;
});

const realTwinRatio = computed(() => {
  const model = gapAnalysis.value?.twinIndex;
  const real = realComparison.value?.gaps.twinIndex;
  if (!model || real === undefined) return 0;
  return real / model;
});

function buildCountCurve(sorted: number[] | Int32Array, xs: number[]): ExperimentCurvePoint[] {
  const points: ExperimentCurvePoint[] = [];
  let idx = 0;
  for (const x of xs) {
    while (idx < sorted.length && sorted[idx] <= x) idx++;
    points.push({ x, avgDiff: idx, std: null });
  }
  return points;
}

function drawCompareChart() {
  const canvas = compareCanvas.value;
  const seq = currentGapSequence.value;
  const comp = realComparison.value;
  if (!canvas || !seq || !comp) return;
  const lo = seq[0];
  const hi = seq[seq.length - 1];
  const samples = 100;
  const xs: number[] = [];
  for (let i = 0; i < samples; i++) {
    xs.push(lo + ((hi - lo) * i) / (samples - 1));
  }
  const renderer = new ChartRenderer(canvas);
  renderer.renderExperimentCurves(
    [
      { key: 'model', colorIndex: 0, points: buildCountCurve(seq, xs) },
      { key: 'real primes', colorIndex: 1, points: buildCountCurve(comp.primes, xs) }
    ],
    { yLabel: 'count ≤ x' }
  );
}

function computeRealComparison() {
  const seq = currentGapSequence.value;
  if (!realCompare.value || !seq || seq.length < 3) {
    realComparison.value = null;
    compareNote.value = '';
    return;
  }
  const xMax = seq[seq.length - 1];
  if (xMax > 1e8) {
    realComparison.value = null;
    compareNote.value = `sequence x too large for in-browser sieve (x = ${xMax.toLocaleString('en-US')})`;
    return;
  }
  const primes = primesUpTo(xMax);
  realComparison.value = { pi: primes.length, count: seq.length, gaps: analyzeGaps(primes)!, primes };
  compareNote.value = '';
  nextTick(() => drawCompareChart());
}

watch(currentGapSequence, () => {
  drawGapChart();
  computeRealComparison();
});

watch(realCompare, () => computeRealComparison());

async function generateMultipleSequences() {
  showChart.value = false;
  stopRequested.value = false;

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
    if (stopRequested.value) break;

    myListOfSimple.value = [...initialValue];
    currentNumber.value = initialValue[initialValue.length - 1] + 1;

    await getListFastWrapper(Number(seed.value) + seq);

    if (stopRequested.value) break;

    multipleSequences.value.push([...myListOfSimple.value]);

    generationProgress.value = ((seq + 1) / sequenceCount.value) * 100;

    await new Promise(resolve => setTimeout(resolve, 50));
  }

  myListOfSimple.value = originalMyListOfSimple;
  currentNumber.value = originalCurrentNumber;

  generationTime.value = (Date.now() - generationStartTime.value) / 1000;
  if (!stopRequested.value) {
    generationProgress.value = 100;
  }
  isGenerating.value = false;

  if (multipleSequences.value.length > 0) {
    drawMultipleSequencesChart();
  }
}

let resizeTimer: ReturnType<typeof setTimeout> | undefined;

function handleResize() {
  if (resizeTimer !== undefined) clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    resizeTimer = undefined;
    drawExperimentChart();
    drawGapChart();
    drawCompareChart();
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
  disposeGeneration();
});
</script>

<style src="./WelcomeItem.css"></style>
