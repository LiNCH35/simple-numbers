import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createGenerator, TWIN_PRIME_CONSTANT, isPrime } from '../src/core/sequence.mjs';
import { primesUpTo } from '../src/core/real-primes.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const resultsDir = path.join(__dirname, '..', 'results');

const quick = process.argv.includes('--quick');
const xBig = quick ? 2000000 : 1e8;
const n = quick ? 200000 : 2000000;
const seeds = quick ? [1, 2] : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const curvePoints = 200;
const curveFrom = 300000;
const pairGaps = [2, 4, 6, 8, 10, 12, 30];

const modelConfigs = [
  { id: 'jump', opts: { mode: 'jump' } },
  { id: 'jump-corr', opts: { mode: 'jump', twinRate: 0.8, gapShape: 1.5 } },
  { id: 'jump-lattice6-corr', opts: { mode: 'jump', lattice6: true, twinRate: 2.1, gapShape: 1.45 } },
  { id: 'jump-lattice30-corr', opts: { mode: 'jump', lattice30: true, twinRate: 3.4, gapShape: 1.4 } }
];

function singularSeries(g) {
  let s = TWIN_PRIME_CONSTANT;
  const half = g / 2;
  for (let p = 3; p <= half; p += 2) {
    if (half % p === 0 && isPrime(p)) s *= (p - 1) / (p - 2);
  }
  return s;
}

function gapsOf(seq) {
  const g = new Float64Array(seq.length - 1);
  for (let i = 1; i < seq.length; i++) g[i - 1] = seq[i] - seq[i - 1];
  return g;
}

function gapShares(gaps, upTo) {
  const counts = new Map();
  let total = 0;
  for (let i = 0; i < gaps.length; i++) {
    if (gaps[i] > upTo) break;
    total++;
    counts.set(gaps[i], (counts.get(gaps[i]) ?? 0) + 1);
  }
  const shares = {};
  for (let g = 2; g <= 60; g += 2) shares[g] = (100 * (counts.get(g) ?? 0)) / total;
  let champion = 2;
  let championShare = 0;
  for (const [g, c] of counts) {
    const pct = (100 * c) / total;
    if (pct > championShare) {
      championShare = pct;
      champion = g;
    }
  }
  return { total, shares, champion, championShare };
}

function autocorr(gaps) {
  const count = gaps.length;
  let sum = 0;
  let sum2 = 0;
  let p1 = 0;
  let p2 = 0;
  for (let i = 0; i < count; i++) {
    const g = gaps[i];
    sum += g;
    sum2 += g * g;
    if (i > 0) p1 += gaps[i - 1] * g;
    if (i > 1) p2 += gaps[i - 2] * g;
  }
  const mean = sum / count;
  const variance = sum2 / count - mean * mean;
  const c1 = p1 / (count - 1) - ((sum - gaps[0]) / (count - 1)) * ((sum - gaps[count - 1]) / (count - 1));
  const c2 = p2 / (count - 2) - ((sum - gaps[0] - gaps[1]) / (count - 2)) * ((sum - gaps[count - 2] - gaps[count - 1]) / (count - 2));
  return { rho1: c1 / variance, rho2: c2 / variance, mean };
}

function digitDiag(seq) {
  const counts = Array.from({ length: 10 }, () => new Float64Array(10));
  const row = new Float64Array(10);
  let pairs = 0;
  let prev = -1;
  for (let i = 0; i < seq.length; i++) {
    const p = seq[i];
    if (p === 2 || p === 5) {
      prev = -1;
      continue;
    }
    const a = p % 10;
    if (a % 2 === 0 || a === 5) {
      prev = -1;
      continue;
    }
    if (prev > 0) {
      counts[prev][a]++;
      row[a]++;
      pairs++;
    }
    prev = a;
  }
  let diag = 0;
  let cnt = 0;
  for (const a of [1, 3, 7, 9]) {
    for (const b of [1, 3, 7, 9]) {
      diag += counts[a][b] / ((row[a] * row[b]) / pairs) - 1;
      cnt++;
    }
  }
  return diag / cnt;
}

function mod6Shares(seq) {
  const g = gapsOf(seq);
  let m0 = 0;
  let m2 = 0;
  let m4 = 0;
  for (const x of g) {
    if (x % 6 === 0) m0++;
    else if (x % 6 === 2) m2++;
    else if (x % 6 === 4) m4++;
  }
  const nG = g.length;
  return { m0: (100 * m0) / nG, m2: (100 * m2) / nG, m4: (100 * m4) / nG };
}

function twinIndex(seq) {
  const g = gapsOf(seq);
  const nG = g.length;
  let sum = 0;
  let twin = 0;
  for (const x of g) {
    sum += x;
    if (x === 2) twin++;
  }
  const mean = sum / nG;
  return (twin / nG) * mean;
}

function dispersion(seq) {
  const g = gapsOf(seq);
  const nG = g.length;
  let sum = 0;
  let sum2 = 0;
  for (const x of g) {
    sum += x;
    sum2 += x * x;
  }
  const mean = sum / nG;
  const variance = sum2 / nG - mean * mean;
  return variance / (mean * mean);
}

function recordsOf(seq) {
  const g = gapsOf(seq);
  const list = [];
  let max = 0;
  for (let i = 0; i < g.length; i++) {
    if (g[i] > max) {
      max = g[i];
      list.push({ p: seq[i + 1], g: max, cg: max / (Math.log(seq[i + 1]) * Math.log(seq[i + 1])) });
    }
  }
  return list;
}

function countCurve(sortedModel, realPrimes, xMax) {
  const xs = [];
  const cm = [];
  const cr = [];
  let im = 0;
  let ir = 0;
  for (let s = 0; s < curvePoints; s++) {
    const x = curveFrom + ((xMax - curveFrom) * s) / (curvePoints - 1);
    while (im < sortedModel.length && sortedModel[im] <= x) im++;
    while (ir < realPrimes.length && realPrimes[ir] <= x) ir++;
    xs.push(Math.round(x));
    cm.push(im);
    cr.push(ir);
  }
  return { xs, model: cm, real: cr };
}

console.log(`article-data: real sieve to ${xBig}, models n=${n} × ${seeds.length} seeds × ${modelConfigs.length} configs${quick ? ' (quick)' : ''}`);

const real = primesUpTo(xBig);
const realGaps = gapsOf(real);
const realShares = gapShares(realGaps, xBig);
const realAutocorr = autocorr(realGaps);
const realMod6 = mod6Shares(real);
const realDiag = digitDiag(real);
const realTwin = twinIndex(real);
const realDisp = dispersion(real);
const realRecords = recordsOf(real);

const realBits = new Uint8Array(Math.ceil((xBig + 40) / 8));
for (const p of real) realBits[p >> 3] |= 1 << (p & 7);
const realIsP = (v) => (realBits[v >> 3] & (1 << (v & 7))) !== 0;
const realPairs = {};
for (const g of pairGaps) {
  let c = 0;
  for (let i = 0; i < real.length; i++) {
    const p = real[i];
    if (p + g > xBig) break;
    if (realIsP(p + g)) c++;
  }
  realPairs[g] = c;
}

const championMilestones = [1e4, 1e5, 1e6, 1e7, 1e8].filter((m) => m <= xBig);
const evolution = [];
{
  const counts = new Map();
  let mi = 0;
  for (let i = 1; i < real.length; i++) {
    const g = real[i] - real[i - 1];
    counts.set(g, (counts.get(g) ?? 0) + 1);
    while (mi < championMilestones.length && real[i] >= championMilestones[mi]) {
      const total = i;
      evolution.push({
        x: real[i],
        s6: (100 * (counts.get(6) ?? 0)) / total,
        s12: (100 * (counts.get(12) ?? 0)) / total,
        s30: (100 * (counts.get(30) ?? 0)) / total,
        s2: (100 * (counts.get(2) ?? 0)) / total,
        s4: (100 * (counts.get(4) ?? 0)) / total
      });
      mi++;
    }
  }
}

const pairModels = {};
for (const config of modelConfigs) {
  const seq = createGenerator({ seed: 1, tolerance: 1e-10, trackProbability: false, ...config.opts }).generate(n).sequence;
  const xMax = seq[seq.length - 1];
  const bits = new Uint8Array(Math.ceil((xMax + 40) / 8));
  for (const p of seq) bits[p >> 3] |= 1 << (p & 7);
  const isP = (v) => (bits[v >> 3] & (1 << (v & 7))) !== 0;
  const pairs = {};
  for (const g of pairGaps) {
    let c = 0;
    for (let i = 0; i < seq.length; i++) {
      const p = seq[i];
      if (p + g > xMax) break;
      if (isP(p + g)) c++;
    }
    pairs[g] = c;
  }
  const counts = new Map();
  const g = gapsOf(seq);
  for (const x of g) counts.set(x, (counts.get(x) ?? 0) + 1);
  const shares = {};
  for (let gg = 2; gg <= 60; gg += 2) shares[gg] = (100 * (counts.get(gg) ?? 0)) / g.length;
  pairModels[config.id] = { pairs, xMax, shares };
  console.log(`pairs ${config.id}: 30/6 = ${(pairs[30] / pairs[6]).toFixed(3)} (xMax ${xMax})`);
}

const perConfig = {};
for (const config of modelConfigs) {
  const runs = [];
  for (const seed of seeds) {
    const seq = createGenerator({ seed, tolerance: 1e-10, trackProbability: false, ...config.opts }).generate(n).sequence;
    const g = gapsOf(seq);
    const xMax = seq[seq.length - 1];
    const pi = quick ? null : (() => {
      let lo = 0;
      let hi = real.length;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (real[mid] <= xMax) lo = mid + 1;
        else hi = mid;
      }
      return lo;
    })();
    let maxGap = 0;
    for (const x of g) if (x > maxGap) maxGap = x;
    runs.push({
      xMax,
      twinIndex: twinIndex(seq),
      dispersion: dispersion(seq),
      mod6: mod6Shares(seq),
      rho1: autocorr(g).rho1,
      diagBias: digitDiag(seq),
      maxGap,
      nMinusPi: pi === null ? null : n - pi
    });
  }
  const agg = (key, sub) => {
    const values = runs.map((r) => (sub === undefined ? r[key] : r[key][sub]));
    const m = values.reduce((s, v) => s + v, 0) / values.length;
    const sd = Math.sqrt(values.reduce((s2, v) => s2 + (v - m) * (v - m), 0) / values.length);
    return { mean: m, sd };
  };
  perConfig[config.id] = {
    seeds: seeds.length,
    twinIndex: agg('twinIndex'),
    dispersion: agg('dispersion'),
    rho1: agg('rho1'),
    diagBias: agg('diagBias'),
    maxGap: agg('maxGap'),
    nMinusPi: agg('nMinusPi'),
    mod6: {
      m0: agg('mod6', 'm0'),
      m2: agg('mod6', 'm2'),
      m4: agg('mod6', 'm4')
    }
  };
  console.log(`${config.id}: twinIndex ${perConfig[config.id].twinIndex.mean.toFixed(3)}±${perConfig[config.id].twinIndex.sd.toFixed(3)}, rho1 ${perConfig[config.id].rho1.mean.toFixed(4)}±${perConfig[config.id].rho1.sd.toFixed(4)}, maxGap ${perConfig[config.id].maxGap.mean.toFixed(0)}±${perConfig[config.id].maxGap.sd.toFixed(0)}`);
}

const curveModels = {};
for (const config of modelConfigs) {
  const seq = createGenerator({ seed: 1, tolerance: 1e-10, trackProbability: false, ...config.opts }).generate(n).sequence;
  curveModels[config.id] = countCurve(seq, real, seq[seq.length - 1]);
}

const out = {
  generatedAt: new Date().toISOString(),
  quick,
  xBig,
  real: {
    pi: real.length,
    lastPrime: real[real.length - 1],
    champion: realShares.champion,
    championShare: realShares.championShare,
    shares: realShares.shares,
    rho1: realAutocorr.rho1,
    rho2: realAutocorr.rho2,
    meanGap: realAutocorr.mean,
    diagBias: realDiag,
    twinIndex: realTwin,
    dispersion: realDisp,
    mod6: realMod6,
    pairs: realPairs,
    records: realRecords.slice(-8),
    evolution
  },
  models: perConfig,
  modelShares: Object.fromEntries(Object.entries(pairModels).map(([id, v]) => [id, v.shares])),
  pairModels,
  curves: curveModels,
  constants: { twinPrimeConstant: TWIN_PRIME_CONSTANT, sRatio306: singularSeries(30) / singularSeries(6) }
};

const outPath = path.join(resultsDir, 'article-data.json');
writeFileSync(outPath, JSON.stringify(out));
console.log(`data written: ${outPath}`);
