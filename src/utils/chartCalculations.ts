import { isRealPrime } from '../data/primeNumbers';

export interface DifferencePoint {
  x: number;
  difference: number;
}

/**
 * Вычисляет разницы между псевдопростыми и настоящими простыми числами для одной последовательности
 */
export function calculateSequenceDifferences(sequence: number[], xMax: number, xStep: number = 5): DifferencePoint[] {
  const differences: DifferencePoint[] = []
  
  for (let x = 0; x <= xMax; x += xStep) {
    const pseudoCount = sequence.filter(num => num <= x).length
    const realCount = Array.from({length: x + 1}, (_, i) => i).filter(isRealPrime).length
    differences.push({x, difference: pseudoCount - realCount})
  }
  
  return differences
}

/**
 * Собирает все разницы из нескольких последовательностей для определения диапазона оси Y
 */
export function getAllDifferences(sequences: number[][], xMax: number, xStep: number = 5): number[] {
  const allDifferences: number[] = []
  
  sequences.forEach(sequence => {
    const differences = calculateSequenceDifferences(sequence, xMax)
    differences.forEach(point => allDifferences.push(point.difference))
  })
  
  return allDifferences
}

/**
 * Определяет диапазон для оси Y на основе всех разниц
 */
export function getDifferenceRange(sequences: number[][], xMax: number, xStep: number = 5) {
  const allDifferences = getAllDifferences(sequences, xMax, xStep)
  
  if (allDifferences.length === 0) {
    return { min: 0, max: 10 }
  }
  
  return {
    min: Math.min(...allDifferences),
    max: Math.max(...allDifferences)
  }
}
