export interface GapBar {
  gap: number;
  count: number;
  pct: number;
}

export interface GapAnalysis {
  gaps: number;
  meanGap: number;
  dispersion: number;
  gap1Pct: number;
  oddPct: number;
  twinPct: number;
  twinIndex: number;
  mod6: { m0: number; m2: number; m4: number };
  histogram: GapBar[];
}

export function analyzeGaps(sequence: number[]): GapAnalysis | null {
  const n = sequence.length - 1;
  if (n <= 0) return null;

  let sum = 0;
  let sum2 = 0;
  let gap1 = 0;
  let odd = 0;
  let twin = 0;
  let m0 = 0;
  let m2 = 0;
  let m4 = 0;
  const counts = new Map<number, number>();

  for (let i = 0; i < n; i++) {
    const g = sequence[i + 1] - sequence[i];
    sum += g;
    sum2 += g * g;
    if (g === 1) gap1++;
    else if (g % 2 === 1) odd++;
    if (g === 2) twin++;
    if (g % 6 === 0) m0++;
    else if (g % 6 === 2) m2++;
    else if (g % 6 === 4) m4++;
    counts.set(g, (counts.get(g) ?? 0) + 1);
  }

  const mean = sum / n;
  const variance = sum2 / n - mean * mean;
  const histogram: GapBar[] = [...counts.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([gap, count]) => ({ gap, count, pct: (100 * count) / n }));

  return {
    gaps: n,
    meanGap: mean,
    dispersion: variance / (mean * mean),
    gap1Pct: (100 * gap1) / n,
    oddPct: (100 * odd) / n,
    twinPct: (100 * twin) / n,
    twinIndex: (twin / n) * mean,
    mod6: { m0: (100 * m0) / n, m2: (100 * m2) / n, m4: (100 * m4) / n },
    histogram
  };
}
