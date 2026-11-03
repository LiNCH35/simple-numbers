import { calculateSequenceDifferences, getDifferenceRange, DifferencePoint } from './chartCalculations';
import { maxOf, minOf } from './arrayStats';

export interface ChartConfig {
  width: number;
  height: number;
  padding: number;
}

export interface ExperimentCurvePoint {
  x: number;
  avgDiff: number;
  std: number | null;
}

export interface ExperimentCurve {
  key: string;
  colorIndex: number;
  points: ExperimentCurvePoint[];
}

function niceStep(range: number, targetTicks: number): number {
  const raw = range / targetTicks;
  if (!Number.isFinite(raw) || raw <= 0) return 1;
  const magnitude = Math.pow(10, Math.floor(Math.log10(raw)));
  const normalized = raw / magnitude;
  const nice = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return nice * magnitude;
}

export class ChartRenderer {
  private ctx: CanvasRenderingContext2D;
  private config: ChartConfig;
  private colors: string[];
  
  constructor(canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
    this.config = {
      width: canvas.width,
      height: canvas.height,
      padding: 50
    };
    this.colors = [
      '#34557d', '#a3543f', '#4f7d4f', '#8a6aa0', '#b08a3e',
      '#4f8a8a', '#96546b', '#5a6b9e', '#7d5434', '#4a6b52'
    ];
  }
  
  /**
   * Рисует оси координат
   */
  drawAxes(): void {
    const { ctx, config } = this;
    
    ctx.strokeStyle = '#1c1c1a';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(config.padding, config.padding);
    ctx.lineTo(config.padding, config.height - config.padding);
    ctx.lineTo(config.width - config.padding, config.height - config.padding);
    ctx.stroke();
  }
  
  /**
   * Рисует сетку и подписи на оси Y
   */
  drawYGrid(minDiff: number, maxDiff: number): void {
    const { ctx, config } = this;
    const chartHeight = config.height - 2 * config.padding;
    const range = maxDiff - minDiff;
    const step = niceStep(range, 8);
    const start = Math.ceil(minDiff / step) * step;

    ctx.strokeStyle = '#ececea';
    ctx.lineWidth = 1;
    ctx.fillStyle = '#8a8a84';
    ctx.font = '10px system-ui, sans-serif';
    ctx.textAlign = 'right';

    for (let diff = start; diff <= maxDiff; diff += step) {
      const y = config.height - config.padding - ((diff - minDiff) / (range || 1)) * chartHeight;

      ctx.beginPath();
      ctx.moveTo(config.padding, y);
      ctx.lineTo(config.width - config.padding, y);
      ctx.stroke();

      ctx.fillText(diff.toString(), config.padding - 10, y + 3);
    }
  }
  
  /**
   * Рисует сетку и подписи на оси X
   */
  drawXGrid(xMax: number): void {
    const { ctx, config } = this;
    const chartWidth = config.width - 2 * config.padding;
    const step = niceStep(xMax, 12);

    ctx.textAlign = 'center';

    for (let x = 0; x <= xMax; x += step) {
      const xPos = config.padding + (x / xMax) * chartWidth;

      ctx.strokeStyle = '#ececea';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(xPos, config.padding);
      ctx.lineTo(xPos, config.height - config.padding);
      ctx.stroke();

      ctx.fillStyle = '#8a8a84';
      ctx.fillText(x.toString(), xPos, config.height - config.padding + 20);
    }
  }
  
  /**
   * Рисует одну последовательность с указанным диапазоном Y
   */
  private drawSequenceWithRange(sequence: number[], color: string, xMax: number, minY: number, maxY: number): void {
    const { ctx, config } = this;
    const chartWidth = config.width - 2 * config.padding;
    const chartHeight = config.height - 2 * config.padding;
    
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 1.5;

    const differences = calculateSequenceDifferences(sequence, xMax);

    differences.forEach((point, index) => {
      const xPos = config.padding + (point.x / xMax) * chartWidth;
      const yPos = config.height - config.padding - ((point.difference - minY) / (maxY - minY)) * chartHeight;

      // Рисуем точку
      ctx.beginPath();
      ctx.arc(xPos, yPos, 2, 0, 2 * Math.PI);
      ctx.fill();
      
      // Рисуем линию к следующей точке
      if (index < differences.length - 1) {
        const nextPoint = differences[index + 1];
        const nextX = config.padding + (nextPoint.x / xMax) * chartWidth;
        const nextY = config.height - config.padding - ((nextPoint.difference - minY) / (maxY - minY)) * chartHeight;
        
        ctx.beginPath();
        ctx.moveTo(xPos, yPos);
        ctx.lineTo(nextX, nextY);
        ctx.stroke();
      }
    });
  }

  /**
   * Рисует усредненные разницы (для среднего графика)
   */
  renderAverageDifferences(averageDifferences: {x: number, averageDifference: number}[]): void {
    if (averageDifferences.length === 0) return;
    
    // Очищаем canvas
    this.ctx.clearRect(0, 0, this.config.width, this.config.height);
    
    // Находим параметры для осей
    const maxX = maxOf(averageDifferences.map(d => d.x));
    const xMax = Math.ceil(maxX / 5) * 5;
    const minY = minOf(averageDifferences.map(d => d.averageDifference));
    const maxY = maxOf(averageDifferences.map(d => d.averageDifference));
    const safeMinY = maxY === minY ? minY - 1 : minY;
    const safeMaxY = maxY === minY ? maxY + 1 : maxY;
    
    // Рисуем базовые элементы
    this.drawAxes();
    this.drawYGrid(safeMinY, safeMaxY);
    this.drawXGrid(xMax);
    
    // Рисуем усредненные разницы
    this.drawAverageDifferencePoints(averageDifferences, xMax, safeMinY, safeMaxY);
    
    // Рисуем подписи
    this.drawAxisLabels();
  }
  
  /**
   * Рисует точки усредненных разниц
   */
  private drawAverageDifferencePoints(averageDifferences: {x: number, averageDifference: number}[], xMax: number, minY: number, maxY: number): void {
    const chartWidth = this.config.width - 2 * this.config.padding;
    const chartHeight = this.config.height - 2 * this.config.padding;
    
    this.ctx.strokeStyle = this.colors[0];
    this.ctx.fillStyle = this.colors[0];
    this.ctx.lineWidth = 1.5;

    averageDifferences.forEach((point, index) => {
      const x = this.config.padding + (point.x / xMax) * chartWidth;
      const y = this.config.height - this.config.padding - ((point.averageDifference - minY) / (maxY - minY)) * chartHeight;

      // Рисуем точку
      this.ctx.beginPath();
      this.ctx.arc(x, y, 2, 0, 2 * Math.PI);
      this.ctx.fill();
      
      // Рисуем линию к следующей точке
      if (index < averageDifferences.length - 1) {
        const nextPoint = averageDifferences[index + 1];
        const nextX = this.config.padding + (nextPoint.x / xMax) * chartWidth;
        const nextY = this.config.height - this.config.padding - ((nextPoint.averageDifference - minY) / (maxY - minY)) * chartHeight;
        
        this.ctx.beginPath();
        this.ctx.moveTo(x, y);
        this.ctx.lineTo(nextX, nextY);
        this.ctx.stroke();
      }
    });
  }

  /**
   * Рисует одну последовательность на графике
   */
  drawSequence(sequence: number[], color: string, xMax: number): void {
    const { ctx, config } = this;
    const chartWidth = config.width - 2 * config.padding;
    const chartHeight = config.height - 2 * config.padding;
    const { min, max } = getDifferenceRange([sequence], xMax);
    
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 1.5;

    const differences = calculateSequenceDifferences(sequence, xMax);

    differences.forEach((point, index) => {
      const xPos = config.padding + (point.x / xMax) * chartWidth;
      const yPos = config.height - config.padding - ((point.difference - min) / (max - min)) * chartHeight;

      // Рисуем точку
      ctx.beginPath();
      ctx.arc(xPos, yPos, 2, 0, 2 * Math.PI);
      ctx.fill();
      
      // Рисуем линию к следующей точке
      if (index < differences.length - 1) {
        const nextPoint = differences[index + 1];
        const nextX = config.padding + (nextPoint.x / xMax) * chartWidth;
        const nextY = config.height - config.padding - ((nextPoint.difference - min) / (max - min)) * chartHeight;
        
        ctx.beginPath();
        ctx.moveTo(xPos, yPos);
        ctx.lineTo(nextX, nextY);
        ctx.stroke();
      }
    });
  }
  
  /**
   * Рисует легенду для последовательностей
   */
  drawLegend(sequenceCount: number): void {
    const { ctx, config } = this;

    ctx.fillStyle = '#6f6f6a';
    ctx.font = '11px system-ui, sans-serif';
    ctx.textAlign = 'left';
    
    for (let i = 0; i < sequenceCount; i++) {
      const color = this.colors[i % this.colors.length];
      ctx.fillStyle = color;
      ctx.fillRect(config.padding + 10 + i * 80, config.padding + 10, 15, 15);
      
      ctx.fillStyle = '#333';
      ctx.fillText(`Seq ${i + 1}`, config.padding + 30 + i * 80, config.padding + 22);
    }
  }
  
  /**
   * Добавляет подписи осей
   */
  drawAxisLabels(): void {
    const { ctx, config } = this;

    ctx.fillStyle = '#6f6f6a';
    ctx.font = '11px system-ui, sans-serif';
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
  
  /**
   * Основной метод отрисовки нескольких последовательностей
   */
  render(sequences: number[][]): void {
    if (sequences.length === 0) return;
    
    // Очищаем canvas
    this.ctx.clearRect(0, 0, this.config.width, this.config.height);
    
    // Находим общие параметры
    const allNumbers = sequences.flat();
    const maxNumber = maxOf(allNumbers);
    const xMax = Math.ceil(maxNumber / 5) * 5;
    const { min, max } = getDifferenceRange(sequences, xMax);
    
    // Рисуем базовые элементы
    this.drawAxes();
    this.drawYGrid(min, max);
    this.drawXGrid(xMax);
    
    // Рисуем последовательности
    sequences.forEach((sequence, index) => {
      const color = this.colors[index % this.colors.length];
      // Для каждой последовательности используем свой диапазон Y
      const { min: seqMin, max: seqMax } = getDifferenceRange([sequence], xMax);
      this.drawSequenceWithRange(sequence, color, xMax, seqMin, seqMax);
    });
    
    // Рисуем легенду и подписи
    this.drawLegend(sequences.length);
    this.drawAxisLabels();
  }
  
  /**
   * Рисует одну последовательность (для drawDistributionChart)
   */
  renderSingleSequence(sequence: number[]): void {
    if (sequence.length === 0) return;

    // Очищаем canvas
    this.ctx.clearRect(0, 0, this.config.width, this.config.height);

    // Находим параметры
    const maxNumber = maxOf(sequence);
    const xMax = Math.ceil(maxNumber / 5) * 5;
    const { min, max } = getDifferenceRange([sequence], xMax);

    // Рисуем базовые элементы
    this.drawAxes();
    this.drawYGrid(min, max);
    this.drawXGrid(xMax);

    // Рисуем последовательность
    this.drawSequence(sequence, this.colors[0], xMax);

    // Рисуем подписи
    this.drawAxisLabels();
  }

  private px(x: number, xMax: number): number {
    return this.config.padding + (x / xMax) * (this.config.width - 2 * this.config.padding);
  }

  private py(value: number, minY: number, maxY: number): number {
    const chartHeight = this.config.height - 2 * this.config.padding;
    return this.config.height - this.config.padding - ((value - minY) / (maxY - minY)) * chartHeight;
  }

  private drawZeroLine(minY: number, maxY: number): void {
    if (minY > 0 || maxY < 0) return;
    const { ctx, config } = this;
    ctx.save();
    ctx.strokeStyle = '#b9b9b2';
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(config.padding, this.py(0, minY, maxY));
    ctx.lineTo(config.width - config.padding, this.py(0, minY, maxY));
    ctx.stroke();
    ctx.restore();
  }

  private drawConfidenceBand(points: ExperimentCurvePoint[], color: string, xMax: number, minY: number, maxY: number): void {
    const withStd = points.filter((p): p is ExperimentCurvePoint & { std: number } => p.std !== null);
    if (withStd.length < 2) return;
    const { ctx } = this;
    ctx.save();
    ctx.globalAlpha = 0.14;
    ctx.fillStyle = color;
    ctx.beginPath();
    withStd.forEach((p, i) => {
      const x = this.px(p.x, xMax);
      const y = this.py(p.avgDiff + p.std, minY, maxY);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    for (let i = withStd.length - 1; i >= 0; i--) {
      const p = withStd[i];
      ctx.lineTo(this.px(p.x, xMax), this.py(p.avgDiff - p.std, minY, maxY));
    }
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  private drawCurveLine(points: ExperimentCurvePoint[], color: string, xMax: number, minY: number, maxY: number): void {
    if (points.length === 0) return;
    const { ctx } = this;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    points.forEach((p, i) => {
      const x = this.px(p.x, xMax);
      const y = this.py(p.avgDiff, minY, maxY);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }

  private drawCurveLegend(curves: ExperimentCurve[]): void {
    const { ctx, config } = this;
    ctx.font = '11px system-ui, sans-serif';
    ctx.textAlign = 'left';
    curves.forEach((curve, i) => {
      const color = this.colors[curve.colorIndex % this.colors.length];
      const y = config.padding + 10 + i * 18;
      ctx.fillStyle = color;
      ctx.fillRect(config.padding + 10, y, 14, 12);
      ctx.fillStyle = '#333333';
      ctx.fillText(curve.key, config.padding + 30, y + 10);
    });
  }

  private drawCurveAxisLabels(): void {
    const { ctx, config } = this;
    ctx.fillStyle = '#6f6f6a';
    ctx.font = '11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('x', config.width / 2, config.height - 5);
    ctx.save();
    ctx.translate(15, config.height / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText('avg diff (pseudo - real)', 0, 0);
    ctx.restore();
  }

  /**
   * Рисует средние кривые avgDiff по группам эксперимента с полосами ±σ
   */
  renderExperimentCurves(curves: ExperimentCurve[]): void {
    if (curves.length === 0) return;

    this.ctx.clearRect(0, 0, this.config.width, this.config.height);

    const values: number[] = [];
    curves.forEach((curve) => curve.points.forEach((p) => {
      values.push(p.std === null ? p.avgDiff : p.avgDiff - p.std);
      values.push(p.std === null ? p.avgDiff : p.avgDiff + p.std);
    }));
    if (values.length === 0) return;

    const xMax = Math.ceil(maxOf(curves.flatMap((c) => c.points.map((p) => p.x))) / 5) * 5;
    let minY = minOf(values);
    let maxY = maxOf(values);
    if (minY > 0) minY = 0;
    if (maxY < 0) maxY = 0;
    if (minY === maxY) {
      minY -= 1;
      maxY += 1;
    }

    this.drawAxes();
    this.drawYGrid(minY, maxY);
    this.drawXGrid(xMax);
    this.drawZeroLine(minY, maxY);

    curves.forEach((curve) => {
      const color = this.colors[curve.colorIndex % this.colors.length];
      this.drawConfidenceBand(curve.points, color, xMax, minY, maxY);
      this.drawCurveLine(curve.points, color, xMax, minY, maxY);
    });

    this.drawCurveLegend(curves);
    this.drawCurveAxisLabels();
  }
}
