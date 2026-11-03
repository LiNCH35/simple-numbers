import { primeCountPrefix } from '../core/sequence.mjs';
import { maxOf, minOf } from './arrayStats';

export interface DistributionData {
  x: number;
  difference: number;
}

export interface ChartConfig {
  width: number;
  height: number;
  padding: number;
}

export function drawDistributionChart(
  canvas: HTMLCanvasElement,
  numbers: number[],
  setShowChart: (value: boolean) => void
) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  
  // Очищаем canvas
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  // Получаем данные для графика
  if (numbers.length === 0) return;
  
  const maxNumber = maxOf(numbers);
  const config: ChartConfig = {
    width: canvas.width,
    height: canvas.height,
    padding: 50
  };
  
  // Создаем данные распределения: для каждого X считаем разницу между псевдопростыми и настоящими простыми
  const distributionData = createDistributionData(numbers, maxNumber);
  
  // Рисуем график
  drawAxes(ctx, config);
  drawGrid(ctx, config, distributionData);
  drawData(ctx, config, distributionData);
  drawLabels(ctx, config, distributionData);
}

function createDistributionData(numbers: number[], maxNumber: number): DistributionData[] {
  const xStep = 5;
  const xMax = Math.ceil(maxNumber / xStep) * xStep;
  const realPrimeCounts = primeCountPrefix(Math.max(0, xMax));
  const sorted = [...numbers].sort((a, b) => a - b);
  const distributionData: DistributionData[] = [];
  let pseudoIndex = 0;

  for (let x = 0; x <= xMax; x += xStep) {
    while (pseudoIndex < sorted.length && sorted[pseudoIndex] <= x) {
      pseudoIndex++;
    }
    distributionData.push({x, difference: pseudoIndex - realPrimeCounts[x]});
  }

  return distributionData;
}

function drawAxes(ctx: CanvasRenderingContext2D, config: ChartConfig) {
  ctx.strokeStyle = '#333';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(config.padding, config.padding);
  ctx.lineTo(config.padding, config.height - config.padding);
  ctx.lineTo(config.width - config.padding, config.height - config.padding);
  ctx.stroke();
}

function drawGrid(ctx: CanvasRenderingContext2D, config: ChartConfig, data: DistributionData[]) {
  const chartWidth = config.width - 2 * config.padding;
  const chartHeight = config.height - 2 * config.padding;
  const xMax = maxOf(data.map(d => d.x));
  const maxDifference = maxOf(data.map(d => Math.abs(d.difference)));
  const minDifference = minOf(data.map(d => d.difference));
  
  ctx.strokeStyle = '#e0e0e0';
  ctx.lineWidth = 0.5;
  ctx.fillStyle = '#666';
  ctx.font = '10px Arial';
  
  // Горизонтальная сетка (ось Y)
  ctx.textAlign = 'right';
  for (let i = 0; i <= 10; i++) {
    const y = config.padding + (chartHeight / 10) * i;
    const value = minDifference + (maxDifference - minDifference) * (1 - i / 10);
    
    ctx.beginPath();
    ctx.moveTo(config.padding, y);
    ctx.lineTo(config.width - config.padding, y);
    ctx.stroke();
    
    ctx.fillText(value.toFixed(1), config.padding - 10, y + 3);
  }
  
  // Вертикальная сетка (ось X)
  ctx.textAlign = 'center';
  data.forEach(point => {
    const x = config.padding + (point.x / xMax) * chartWidth;
    
    ctx.beginPath();
    ctx.moveTo(x, config.padding);
    ctx.lineTo(x, config.height - config.padding);
    ctx.stroke();
    
    ctx.fillText(point.x.toString(), x, config.height - config.padding + 20);
  });
}

function drawData(ctx: CanvasRenderingContext2D, config: ChartConfig, data: DistributionData[]) {
  const chartWidth = config.width - 2 * config.padding;
  const chartHeight = config.height - 2 * config.padding;
  const xMax = maxOf(data.map(d => d.x));
  const maxDifference = maxOf(data.map(d => Math.abs(d.difference)));
  const minDifference = minOf(data.map(d => d.difference));
  
  ctx.strokeStyle = '#007bff';
  ctx.fillStyle = '#007bff';
  ctx.lineWidth = 2;
  
  data.forEach((point, index) => {
    const x = config.padding + (point.x / xMax) * chartWidth;
    const y = config.height - config.padding - ((point.difference - minDifference) / (maxDifference - minDifference)) * chartHeight;
    
    // Рисуем точку
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, 2 * Math.PI);
    ctx.fill();
    
    // Рисуем линию к следующей точке
    if (index < data.length - 1) {
      const nextPoint = data[index + 1];
      const nextX = config.padding + (nextPoint.x / xMax) * chartWidth;
      const nextY = config.height - config.padding - ((nextPoint.difference - minDifference) / (maxDifference - minDifference)) * chartHeight;
      
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(nextX, nextY);
      ctx.stroke();
    }
  });
}

function drawLabels(ctx: CanvasRenderingContext2D, config: ChartConfig) {
  ctx.fillStyle = '#333';
  ctx.font = '12px Arial';
  ctx.textAlign = 'center';
  
  // Подпись оси X
  ctx.fillText('Natural Numbers (step = 5)', config.width / 2, config.height - 5);
  
  // Подпись оси Y
  ctx.save();
  ctx.translate(15, config.height / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText('Difference (Pseudo - Real Primes)', 0, 0);
  ctx.restore();
}
