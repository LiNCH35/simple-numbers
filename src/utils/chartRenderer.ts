import { calculateSequenceDifferences, getDifferenceRange, DifferencePoint } from './chartCalculations';
import { isRealPrime } from '../data/primeNumbers';

export interface ChartConfig {
  width: number;
  height: number;
  padding: number;
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
      '#007bff', '#dc3545', '#28a745', '#ffc107', '#6f42c1',
      '#fd7e14', '#20c997', '#e83e8c', '#6c757d', '#343a40'
    ];
  }
  
  /**
   * Рисует оси координат
   */
  drawAxes(): void {
    const { ctx, config } = this;
    
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 2;
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
    
    ctx.strokeStyle = '#e0e0e0';
    ctx.lineWidth = 0.5;
    ctx.fillStyle = '#666';
    ctx.font = '10px Arial';
    ctx.textAlign = 'right';
    
    // Рисуем целочисленные линии сетки
    for (let diff = minDiff; diff <= maxDiff; diff++) {
      const y = config.height - config.padding - ((diff - minDiff) / (maxDiff - minDiff)) * chartHeight;
      
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
    const xStep = 5;
    
    ctx.textAlign = 'center';
    
    for (let x = 0; x <= xMax; x += xStep) {
      const xPos = config.padding + (x / xMax) * chartWidth;
      
      ctx.strokeStyle = '#e0e0e0';
      ctx.beginPath();
      ctx.moveTo(xPos, config.padding);
      ctx.lineTo(xPos, config.height - config.padding);
      ctx.stroke();
      
      ctx.fillStyle = '#666';
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
    ctx.lineWidth = 2;
    
    const differences = calculateSequenceDifferences(sequence, xMax);
    
    differences.forEach((point, index) => {
      const xPos = config.padding + (point.x / xMax) * chartWidth;
      const yPos = config.height - config.padding - ((point.difference - minY) / (maxY - minY)) * chartHeight;
      
      // Рисуем точку
      ctx.beginPath();
      ctx.arc(xPos, yPos, 3, 0, 2 * Math.PI);
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
    const maxX = Math.max(...averageDifferences.map(d => d.x));
    const xMax = Math.ceil(maxX / 5) * 5;
    const minY = Math.min(...averageDifferences.map(d => d.averageDifference));
    const maxY = Math.max(...averageDifferences.map(d => d.averageDifference));
    
    // Рисуем базовые элементы
    this.drawAxes();
    this.drawYGrid(minY, maxY);
    this.drawXGrid(xMax);
    
    // Рисуем усредненные разницы
    this.drawAverageDifferencePoints(averageDifferences, xMax, minY, maxY);
    
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
    this.ctx.lineWidth = 2;
    
    averageDifferences.forEach((point, index) => {
      const x = this.config.padding + (point.x / xMax) * chartWidth;
      const y = this.config.height - this.config.padding - ((point.averageDifference - minY) / (maxY - minY)) * chartHeight;
      
      // Рисуем точку
      this.ctx.beginPath();
      this.ctx.arc(x, y, 4, 0, 2 * Math.PI);
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
    ctx.lineWidth = 2;
    
    const differences = calculateSequenceDifferences(sequence, xMax);
    
    differences.forEach((point, index) => {
      const xPos = config.padding + (point.x / xMax) * chartWidth;
      const yPos = config.height - config.padding - ((point.difference - min) / (max - min)) * chartHeight;
      
      // Рисуем точку
      ctx.beginPath();
      ctx.arc(xPos, yPos, 3, 0, 2 * Math.PI);
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
    
    ctx.fillStyle = '#333';
    ctx.font = '12px Arial';
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
  
  /**
   * Основной метод отрисовки нескольких последовательностей
   */
  render(sequences: number[][]): void {
    if (sequences.length === 0) return;
    
    // Очищаем canvas
    this.ctx.clearRect(0, 0, this.config.width, this.config.height);
    
    // Находим общие параметры
    const allNumbers = sequences.flat();
    const maxNumber = Math.max(...allNumbers);
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
    const maxNumber = Math.max(...sequence);
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
}
