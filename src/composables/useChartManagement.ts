import { ref, nextTick } from 'vue';
import { ChartRenderer } from '../utils/chartRenderer';
import { calculateAverageDifferences } from './useGPUCalculations';

export function useChartManagement() {
  const showChart = ref(false);
  const chartCanvas = ref<HTMLCanvasElement | null>(null);
  const multipleSequences = ref<number[][]>([]);
  const averageDifferencesData = ref<{x: number, averageDifference: number}[]>([]);
  const chartData = ref<{x: number, difference: number}[][]>([]);
  const sequenceCanvases = ref<HTMLCanvasElement[]>([]);
  const averageChartCanvas = ref<HTMLCanvasElement | null>(null);
  const currentSequenceIndex = ref(0);

  function sizeCanvas(canvas: HTMLCanvasElement, height = 400) {
    const width = canvas.clientWidth || canvas.width;
    if (width > 0 && Math.abs(canvas.width - width) > 1) {
      canvas.width = Math.round(width);
      canvas.height = height;
    }
  }

  function renderSequence(canvas: HTMLCanvasElement, sequence: number[]) {
    sizeCanvas(canvas);
    const renderer = new ChartRenderer(canvas);
    renderer.renderSingleSequence(sequence);
  }

  function previousSequence() {
    if (currentSequenceIndex.value > 0) {
      currentSequenceIndex.value--;
      redrawCurrentSequence();
    }
  }

  function nextSequence() {
    if (currentSequenceIndex.value < multipleSequences.value.length - 1) {
      currentSequenceIndex.value++;
      redrawCurrentSequence();
    }
  }

  function redrawCurrentSequence() {
    nextTick(() => {
      const canvas = sequenceCanvases.value[currentSequenceIndex.value];
      const sequence = multipleSequences.value[currentSequenceIndex.value];
      if (canvas && sequence) {
        renderSequence(canvas, sequence);
      }
    });
  }

  function drawDistributionChart(myListOfSimple: number[]) {
    showChart.value = true;

    nextTick(() => {
      const canvas = chartCanvas.value;
      if (!canvas) return;

      renderSequence(canvas, myListOfSimple);
    });
  }

  function drawMultipleSequencesChart() {
    showChart.value = true;

    nextTick(() => {
      if (multipleSequences.value.length > 1) {
        drawSeparateCharts();
      }

      if (multipleSequences.value.length > 1) {
        drawAverageDifferenceChart();
      }
    });
  }

  function setSequenceCanvas(index: number, element: any) {
    if (element) {
      sequenceCanvases.value[index] = element;
      renderSequence(element, multipleSequences.value[index]);
    }
  }

  function drawSeparateCharts() {
    multipleSequences.value.forEach((sequence, index) => {
      const canvas = sequenceCanvases.value[index];
      if (!canvas) return;
      if (index === currentSequenceIndex.value) {
        renderSequence(canvas, sequence);
      } else {
        const renderer = new ChartRenderer(canvas);
        renderer.renderSingleSequence(sequence);
      }
    });
  }

  async function drawAverageDifferenceChart() {
    const canvas = averageChartCanvas.value;
    if (!canvas) return;

    const averageDifferences = await calculateAverageDifferences(multipleSequences.value);

    averageDifferencesData.value = averageDifferences;

    sizeCanvas(canvas);
    const renderer = new ChartRenderer(canvas);
    renderer.renderAverageDifferences(averageDifferences);
  }

  return {
    showChart,
    chartCanvas,
    multipleSequences,
    averageDifferencesData,
    chartData,
    sequenceCanvases,
    averageChartCanvas,
    currentSequenceIndex,
    previousSequence,
    nextSequence,
    drawDistributionChart,
    drawMultipleSequencesChart,
    setSequenceCanvas,
    drawSeparateCharts,
    drawAverageDifferenceChart
  };
}
