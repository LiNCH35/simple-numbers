export function maxOf(values: number[]): number {
  let max = -Infinity;
  for (let i = 0; i < values.length; i++) {
    if (values[i] > max) {
      max = values[i];
    }
  }
  return max;
}

export function minOf(values: number[]): number {
  let min = Infinity;
  for (let i = 0; i < values.length; i++) {
    if (values[i] < min) {
      min = values[i];
    }
  }
  return min;
}
