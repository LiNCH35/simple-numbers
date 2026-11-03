import { primeCountPrefix } from '../core/sequence.mjs';
import { maxOf, minOf } from './arrayStats';

export interface DifferencePoint {
  x: number;
  difference: number;
}

/**
 * Вычисляет разницы между псевдопростыми и настоящими простыми числами для одной последовательности
 */
export function calculateSequenceDifferences(sequence: number[], xMax: number, xStep: number = 5): DifferencePoint[] {
  const sorted = [...sequence].sort((a, b) => a - b)
  const realPrimeCounts = primeCountPrefix(Math.max(0, Math.ceil(xMax)))
  const differences: DifferencePoint[] = []
  let pseudoIndex = 0

  for (let x = 0; x <= xMax; x += xStep) {
    while (pseudoIndex < sorted.length && sorted[pseudoIndex] <= x) {
      pseudoIndex++
    }
    differences.push({x, difference: pseudoIndex - realPrimeCounts[x]})
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
    min: minOf(allDifferences),
    max: maxOf(allDifferences)
  }
}
