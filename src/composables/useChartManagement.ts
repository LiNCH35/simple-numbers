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

  function previousSequence() {
    if (currentSequenceIndex.value > 0) {
      currentSequenceIndex.value--;
    }
  }

  function nextSequence() {
    if (currentSequenceIndex.value < multipleSequences.value.length - 1) {
      currentSequenceIndex.value++;
    }
  }

  function drawDistributionChart(myListOfSimple: number[]) {
    showChart.value = true;
    
    nextTick(() => {
      const canvas = chartCanvas.value;
      if (!canvas) return;
      
      const renderer = new ChartRenderer(canvas);
      renderer.renderSingleSequence(myListOfSimple);
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
      const renderer = new ChartRenderer(element);
      renderer.renderSingleSequence(multipleSequences.value[index]);
    }
  }

  function drawSeparateCharts() {
    multipleSequences.value.forEach((sequence, index) => {
      const canvas = sequenceCanvases.value[index];
      if (canvas) {
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
