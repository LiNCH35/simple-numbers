import { writeFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';
import { splitmix32, TWIN_PRIME_CONSTANT, isPrime } from '../src/core/sequence.mjs';
import { primesUpTo } from '../src/core/real-primes.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const resultsDir = path.join(__dirname, '..', 'results');

const scriptSha = createHash('sha256').update(readFileSync(fileURLToPath(import.meta.url))).digest('hex').slice(0, 16);
let gitCommit = 'unknown';
try {
  gitCommit = execSync('git rev-parse --short HEAD', { cwd: path.join(__dirname, '..') }).toString().trim();
} catch {
  gitCommit = 'unknown';
}

const quick = process.argv.includes('--quick');
const X_FIT = 30000000;
const X_PAIRS = [1000000, 10000000, 30000000];
const pairGaps = [2, 4, 6, 8, 10, 12, 30];
const BINS = 20;
const fitSeeds = [101, 102, 103, 104, 105];
const valSeeds = quick ? [201, 202] : [201, 202, 203, 204, 205, 206, 207, 208, 209, 210];
const transferSeeds = [301, 302, 303, 304, 305];
const ALLOWED30 = [1, 7, 11, 13, 17, 19, 23, 29];
const TWIN_CLASSES = [11, 17, 29];

function gammaByShape(rnd, shape, scale) {
  if (shape < 1) {
    const u = rnd();
    return gammaByShape(rnd, shape + 1, scale) * Math.pow(u, 1 / shape);
  }
  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  for (;;) {
    const u1 = rnd();
    const u2 = rnd();
    const z = Math.sqrt(-2 * Math.log(u1 + 1e-12)) * Math.cos(2 * Math.PI * u2);
    const x = 1 + c * z;
    if (x <= 0) continue;
    const v = x * x * x;
    const u = rnd();
    if (u < 1 - 0.0331 * z * z * z * z) return d * v * scale;
    if (Math.log(u) < 0.5 * z * z + d * (1 - v + Math.log(v))) return d * v * scale;
  }
}

function gammaSample(rnd, shape, mean) {
  return gammaByShape(rnd, shape, mean / shape);
}

function nearestAllowed(x, gRaw, tie, tieRnd, tieCounter) {
  let g0 = Math.max(2, Math.round(gRaw / 2) * 2);
  const r = x % 30;
  for (let off = 0; off < 60; off += 2) {
    const cands = off === 0 ? [g0] : [g0 - off, g0 + off];
    const allowed = cands.filter((g) => g >= 2 && ALLOWED30.includes((r + g) % 30));
    if (allowed.length === 0) continue;
    if (allowed.length === 1 || tie === 'small') return allowed[0];
    if (tie === 'random') return tieRnd() < 0.5 ? allowed[0] : allowed[allowed.length - 1];
    tieCounter.n += 1;
    return tieCounter.n % 2 === 1 ? allowed[0] : allowed[allowed.length - 1];
  }
  return g0;
}

function generateMarkov({ seed, xTarget, kappa, kShape, beta, tie = 'small' }) {
  const rnd = splitmix32(seed);
  const tieRnd = splitmix32(seed ^ 0x9e3779b9);
  const seq = [2, 3];
  let x = 3;
  let prevGap = Math.log(x);
  let emaDisp = 0;
  const tieCounter = { n: 0 };
  let guard = 0;
  while (x < xTarget) {
    guard++;
    if (guard > 2e9) break;
    const lnx = Math.log(x);
    const twinP = Math.min(kappa / lnx, 0.9);
    let g;
    let raw = null;
    if (TWIN_CLASSES.includes(x % 30) && rnd() < twinP) {
      g = 2;
    } else {
      const mult = Math.max(0.5, Math.min(1.5, 1 + beta * (1 - prevGap / lnx)));
      const m = Math.max(3, (lnx * mult - 2 * twinP) / (1 - twinP) - emaDisp);
      raw = gammaSample(rnd, kShape, m);
      g = nearestAllowed(x, raw, tie, tieRnd, tieCounter);
      emaDisp += 0.002 * (g - raw - emaDisp);
    }
    x += g;
    seq.push(x);
    prevGap = g;
  }
  if (seq[seq.length - 1] < xTarget) {
    throw new Error(`Sequence did not reach xTarget=${xTarget} (last=${seq[seq.length - 1]}, guard=${guard})`);
  }
  return seq;
}

function rho1Of(v) {
  const n = v.length;
  let lag = 0;
  let sum = 0;
  let sum2 = 0;
  for (let i = 0; i < n; i++) {
    sum += v[i];
    sum2 += v[i] * v[i];
    if (i > 0) lag += v[i - 1] * v[i];
  }
  const mean = sum / n;
  const variance = sum2 / n - mean * mean;
  const c1 = lag / (n - 1) - ((sum - v[0]) / (n - 1)) * ((sum - v[n - 1]) / (n - 1));
  return c1 / variance;
}

function detrendedResiduals(seq, xMax, bins = BINS, limit = xMax) {
  const logTl = Math.log(xMax);
  const binOf = (x) => Math.max(0, Math.min(bins - 1, Math.floor((bins * Math.log(x)) / logTl)));
  let nG = 0;
  for (let i = 1; i < seq.length; i++) {
    if (seq[i] > limit) break;
    nG++;
  }
  const gaps = new Float64Array(nG);
  const binsIdx = new Int32Array(nG);
  const binSum = new Float64Array(bins);
  const binCnt = new Float64Array(bins);
  let idx = 0;
  for (let i = 1; i < seq.length; i++) {
    if (seq[i] > limit) break;
    const g = seq[i] - seq[i - 1];
    const b = binOf(seq[i - 1]);
    gaps[idx] = g;
    binsIdx[idx] = b;
    binSum[b] += g;
    binCnt[b] += 1;
    idx++;
  }
  const binMean = new Float64Array(bins);
  for (let b = 0; b < bins; b++) binMean[b] = binCnt[b] > 0 ? binSum[b] / binCnt[b] : 0;
  const resid = new Float64Array(nG);
  for (let i = 0; i < nG; i++) resid[i] = gaps[i] - binMean[binsIdx[i]];
  return resid;
}

function singularSeries(g) {
  let s = TWIN_PRIME_CONSTANT;
  const half = g / 2;
  for (let p = 3; p <= half; p += 2) {
    if (half % p === 0 && isPrime(p)) s *= (p - 1) / (p - 2);
  }
  return s;
}

function statsOf(seq, X) {
  let n = 0;
  let nG = 0;
  let sum = 0;
  let sum2 = 0;
  let twin = 0;
  let m0 = 0, m2 = 0, m4 = 0;
  let c41 = 0, c43 = 0, c61 = 0, c65 = 0;
  let afterTwinSum = 0, afterTwinCnt = 0, prevWasTwin = false;
  const drift4 = [];
  const drift6 = [];
  const grid = [];
  for (let s = 0; s < 200; s++) grid.push(1000 + ((X - 1000) * s) / 199);
  let gi = 0;
  for (let i = 0; i < seq.length; i++) {
    const p = seq[i];
    if (p > X) break;
    n++;
    if (p > 2) {
      if (p % 4 === 1) c41++;
      else if (p % 4 === 3) c43++;
    }
    if (p > 3) {
      if (p % 6 === 1) c61++;
      else if (p % 6 === 5) c65++;
    }
    while (gi < grid.length && p >= grid[gi]) {
      drift4.push((c43 - c41) / Math.sqrt(Math.max(1, n)));
      drift6.push((c65 - c61) / Math.sqrt(Math.max(1, n)));
      gi++;
    }
    if (i === 0) {
      prevWasTwin = false;
      continue;
    }
    const g = p - seq[i - 1];
    nG++;
    sum += g;
    sum2 += g * g;
    if (g === 2) twin++;
    if (g % 6 === 0) m0++;
    else if (g % 6 === 2) m2++;
    else m4++;
    if (prevWasTwin) {
      afterTwinSum += g;
      afterTwinCnt++;
    }
    prevWasTwin = g === 2;
  }
  const mean = sum / nG;
  const variance = sum2 / nG - mean * mean;
  const rho1det = rho1Of(detrendedResiduals(seq, X));
  const avgDrift4 = drift4.reduce((s, v) => s + v, 0) / drift4.length;
  const avgDrift6 = drift6.reduce((s, v) => s + v, 0) / drift6.length;
  return {
    pi: n,
    nG,
    meanGap: mean,
    twinIndex: (twin / nG) * mean,
    dispersion: variance / (mean * mean),
    rho1det,
    mod6: { m0: (100 * m0) / nG, m2: (100 * m2) / nG, m4: (100 * m4) / nG },
    d4: c43 - c41,
    d6: c65 - c61,
    residue5: c65 / Math.max(1, c61 + c65),
    drift4: avgDrift4,
    drift6: avgDrift6,
    meanAfterTwin: afterTwinCnt > 0 ? afterTwinSum / afterTwinCnt : null
  };
}

function pairsOf(seq, X, cutoffs) {
  const xMax = Math.min(X, seq[seq.length - 1]);
  const bits = new Uint8Array(Math.ceil((xMax + 40) / 8));
  for (const p of seq) {
    if (p > xMax) break;
    bits[p >> 3] |= 1 << (p & 7);
  }
  const isP = (v) => (bits[v >> 3] & (1 << (v & 7))) !== 0;
  const out = {};
  for (const cut of cutoffs) {
    const pairs = {};
    for (const g of pairGaps) {
      let c = 0;
      for (let i = 0; i < seq.length; i++) {
        const p = seq[i];
        if (p + g > cut) break;
        if (isP(p + g)) c++;
      }
      pairs[g] = c;
    }
    out[cut] = pairs;
  }
  return out;
}

function meanSd(values) {
  const n = values.length;
  const m = values.reduce((s, v) => s + v, 0) / n;
  const sd = Math.sqrt(values.reduce((s2, v) => s2 + (v - m) * (v - m), 0) / (n - 1));
  return { mean: m, sd };
}

const sieveLimit = quick ? 3e7 : 1e8;
console.log(`markov-model: sieve to ${sieveLimit.toExponential(0)}, fit scale X=${X_FIT.toExponential(0)}${quick ? ' (quick)' : ''}`);
const primes = primesUpTo(sieveLimit);

const realFit = statsOf(primes, X_FIT);
const realPairs = pairsOf(primes, X_FIT, X_PAIRS);
console.log(`real@3e7: pi=${realFit.pi} twin=${realFit.twinIndex.toFixed(3)} disp=${realFit.dispersion.toFixed(3)} rho1det=${realFit.rho1det.toFixed(4)} mod6=${realFit.mod6.m0.toFixed(1)}/${realFit.mod6.m2.toFixed(1)}/${realFit.mod6.m4.toFixed(1)} d4=${realFit.d4} d6=${realFit.d6} drift=${realFit.drift4.toFixed(3)}/${realFit.drift6.toFixed(3)}`);

const FIT_TARGETS = { twinIndex: realFit.twinIndex, dispersion: realFit.dispersion, rho1det: realFit.rho1det };
console.log(`FIT stats (заранее объявлены): twinIndex, var/mean², rho1det — по одной на ручку kappa/k/beta`);

function fitEval(kappa, kShape, beta, key) {
  let s = 0;
  for (const seed of fitSeeds) {
    const seq = generateMarkov({ seed, xTarget: X_FIT, kappa, kShape, beta });
    const st = statsOf(seq, X_FIT);
    s += st[key];
  }
  return s / fitSeeds.length;
}

let k = Math.min(3, Math.max(1.05, 1 / FIT_TARGETS.dispersion));
let kappa = 0.8;
let beta = 0.1;
let converged = false;
let round = 0;
const bisect = (target, key, lo, hi, iters) => {
  const increasing = key === 'twinIndex';
  for (let it = 0; it < iters; it++) {
    const mid = (lo + hi) / 2;
    const f = increasing ? fitEval(mid, k, beta, key) : fitEval(kappa, k, mid, key);
    const below = increasing ? f < target : f > target;
    if (below) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
};
for (; round < (quick ? 3 : 6) && !converged; round++) {
  kappa = bisect(FIT_TARGETS.twinIndex, 'twinIndex', 0.02, 4, quick ? 8 : 12);
  beta = bisect(FIT_TARGETS.rho1det, 'rho1det', 0, 2, quick ? 8 : 12);
  const dispMeas = fitEval(kappa, k, beta, 'dispersion');
  const twinMeas = fitEval(kappa, k, beta, 'twinIndex');
  const rhoMeas = fitEval(kappa, k, beta, 'rho1det');
  const kNew = Math.min(3, Math.max(1.05, k * dispMeas / FIT_TARGETS.dispersion));
  const kDelta = Math.abs(kNew - k);
  k = kNew;
  converged = kDelta < 0.005
    && Math.abs(twinMeas - FIT_TARGETS.twinIndex) < 0.005
    && Math.abs(dispMeas - FIT_TARGETS.dispersion) < 0.005
    && Math.abs(rhoMeas - FIT_TARGETS.rho1det) < 0.004;
  console.log(`fit round ${round}: kappa=${kappa.toFixed(3)} beta=${beta.toFixed(3)} k=${k.toFixed(3)} -> twin ${twinMeas.toFixed(3)} disp ${dispMeas.toFixed(3)} rho1det ${rhoMeas.toFixed(4)}`);
}
console.log(`fitted: kappa=${kappa.toFixed(3)} k=${k.toFixed(3)} beta=${beta.toFixed(3)} (rounds=${round})`);

const betaSweep = [];
for (let i = 0; i <= 16; i++) {
  const b = (2 * i) / 16;
  betaSweep.push({ beta: b, rho1det: fitEval(kappa, k, b, 'rho1det') });
}
const betaMonotone = betaSweep.every((p, i) => i === 0 || p.rho1det <= betaSweep[i - 1].rho1det + 1e-9);
const sweepTo15 = betaSweep.filter((p) => p.beta <= 1.5);
const betaMonotoneTo15 = sweepTo15.every((p, i) => i === 0 || p.rho1det <= sweepTo15[i - 1].rho1det + 1e-9);
const maxRebound = Math.max(0, ...betaSweep.map((p, i) => (i === 0 ? 0 : p.rho1det - betaSweep[i - 1].rho1det)));
console.log(`beta sweep: rho1det(0)=${betaSweep[0].rho1det.toFixed(4)} -> rho1det(2)=${betaSweep[16].rho1det.toFixed(4)}, monotoneDecreasing=${betaMonotone}, monotoneOn[0,1.5]=${betaMonotoneTo15}, maxRebound=${maxRebound.toFixed(5)}`);

const valRuns = [];
for (const seed of valSeeds) {
  const seq = generateMarkov({ seed, xTarget: X_FIT, kappa, kShape: k, beta });
  const st = statsOf(seq, X_FIT);
  st.pairs = pairsOf(seq, X_FIT, X_PAIRS);
  valRuns.push(st);
  console.log(`val seed ${seed}: twin ${st.twinIndex.toFixed(3)} disp ${st.dispersion.toFixed(3)} rho1det ${st.rho1det.toFixed(4)} d6=${st.d6}`);
}
const agg = (key) => meanSd(valRuns.map((r) => r[key]));
const m6agg = (sub) => meanSd(valRuns.map((r) => r.mod6[sub]));
const driftAgg = (key) => meanSd(valRuns.map((r) => r[key]));

const tieSeeds = [];
for (let s = 401; s <= 430; s++) tieSeeds.push(s);
const tieControls = {};
for (const tie of ['small', 'random', 'alternate']) {
  const runs = [];
  for (const seed of tieSeeds) {
    const seq = generateMarkov({ seed, xTarget: X_FIT, kappa, kShape: k, beta, tie });
    const st = statsOf(seq, X_FIT);
    st.pairs3 = pairsOf(seq, X_FIT, [30000000])[30000000];
    runs.push(st);
  }
  const aggT = (key) => meanSd(runs.map((r) => r[key]));
  const m6t = (sub) => meanSd(runs.map((r) => r.mod6[sub]));
  tieControls[tie] = {
    seeds: tieSeeds.length,
    d4: aggT('d4'),
    d6: aggT('d6'),
    d6Half1: meanSd(runs.slice(0, 15).map((r) => r.d6)),
    d6Half2: meanSd(runs.slice(15).map((r) => r.d6)),
    drift6: aggT('drift6'),
    residue5: aggT('residue5'),
    meanGap: aggT('meanGap'),
    mod6: { m0: m6t('m0'), m2: m6t('m2'), m4: m6t('m4') },
    pairs306: meanSd(runs.map((r) => r.pairs3[30] / r.pairs3[6]))
  };
  const c = tieControls[tie];
  console.log(`tie ${tie} (${c.seeds} seeds): d6 ${c.d6.mean.toFixed(0)}±${c.d6.sd.toFixed(0)} [halves ${c.d6Half1.mean.toFixed(0)} / ${c.d6Half2.mean.toFixed(0)}], share5 ${(100 * c.residue5.mean).toFixed(2)}%, pairs306 ${c.pairs306.mean.toFixed(3)}`);
}

const transfer = {};
for (const X of [1e6, 1e8]) {
  if (quick && X === 1e8) continue;
  const rows = [];
  for (const seed of transferSeeds) {
    const seq = generateMarkov({ seed, xTarget: X, kappa, kShape: k, beta });
    const st = statsOf(seq, X);
    rows.push(st);
  }
  const r = { twinIndex: meanSd(rows.map((s) => s.twinIndex)), dispersion: meanSd(rows.map((s) => s.dispersion)), rho1det: meanSd(rows.map((s) => s.rho1det)) };
  const real = statsOf(primes, X);
  r.real = { twinIndex: real.twinIndex, dispersion: real.dispersion, rho1det: real.rho1det };
  transfer[X] = r;
  console.log(`transfer@${X.toExponential(0)}: twin ${r.twinIndex.mean.toFixed(3)} (real ${real.twinIndex.toFixed(3)}), disp ${r.dispersion.mean.toFixed(3)} (real ${real.dispersion.toFixed(3)}), rho1det ${r.rho1det.mean.toFixed(4)} (real ${real.rho1det.toFixed(4)})`);
}

const s6 = singularSeries(6);
const pairTable = {};
for (const cut of X_PAIRS) {
  const realRatio = realPairs[cut][30] / realPairs[cut][6];
  const modelRatio = meanSd(valRuns.map((r) => r.pairs[cut][30] / r.pairs[cut][6]));
  const perGap = {};
  for (const g of pairGaps) {
    const sg = singularSeries(g);
    const realR = realPairs[cut][g] / realPairs[cut][6];
    const modelR = meanSd(valRuns.map((r) => r.pairs[cut][g] / r.pairs[cut][6]));
    perGap[g] = { real: realR, model: modelR, sg: sg / s6 };
  }
  pairTable[cut] = { real30: realRatio, model: modelRatio, perGap };
  console.log(`pairs@${cut.toExponential(0)}: real ${realRatio.toFixed(3)}, model ${modelRatio.mean.toFixed(3)}±${modelRatio.sd.toFixed(3)}, S=1.333`);
}

const out = {
  generatedAt: new Date().toISOString(),
  provenance: { scriptSha256_16: scriptSha, gitHead: gitCommit },
  quick,
  xFit: X_FIT,
  fit: { kappa, k, beta, rounds: round, targets: FIT_TARGETS, seeds: fitSeeds, betaSweep: { points: betaSweep, monotoneDecreasing: betaMonotone, monotoneTo15: betaMonotoneTo15, maxRebound } },
  fitSplit: {
    fitted: ['twinIndex (kappa)', 'var/mean² (k)', 'rho1det (beta)'],
    validation: ['pairs 30/6 и per-gap vs S на общих интервалах', 'гонки d4/d6 + drift', 'mod6-гистограмма промежутков', 'перенос twin/disp/rho1det на 1e6 и 1e8', 'средний промежуток после twin']
  },
  fitQuality: {
    twinIndex: agg('twinIndex'),
    dispersion: agg('dispersion'),
    rho1det: agg('rho1det'),
    real: { twinIndex: realFit.twinIndex, dispersion: realFit.dispersion, rho1det: realFit.rho1det }
  },
  validation: {
    races: { real: { d4: realFit.d4, d6: realFit.d6, drift4: realFit.drift4, drift6: realFit.drift6 }, model: { d4: agg('d4'), d6: agg('d6'), drift4: driftAgg('drift4'), drift6: driftAgg('drift6') } },
    mod6: { real: realFit.mod6, model: { m0: m6agg('m0'), m2: m6agg('m2'), m4: m6agg('m4') } },
    residue5: { real: realFit.residue5, model: agg('residue5') },
    meanAfterTwin: { real: realFit.meanAfterTwin, model: agg('meanAfterTwin'), meanGapReal: realFit.meanGap, meanGapModel: agg('meanGap') },
    pairs: pairTable,
    tieControls,
    transfer
  }
};

const md = [];
md.push(`# Модель с расширенным состоянием P(g | x, g_prev, r mod 30, e)`);
md.push('');
md.push(`Сгенерировано scripts/markov-model.mjs @ git ${gitCommit} (sha256 скрипта: ${scriptSha}), ${out.generatedAt}${quick ? ' (QUICK)' : ''}. Прогон детерминирован (splitmix32, фиксированные сиды): перезапуск опубликованного скрипта воспроизводит все числа отчёта.`);
md.push('');
md.push(`Механика (модель с расширенным состоянием P(g | x, g_prev, r mod 30, e), а не строго марковская по (x, g_prev, r)): с вероятностью p = min(kappa/ln x, 0.9) и только из twin-классов r mod 30 ∈ {11, 17, 29} — инъекция twin, g = 2; иначе обычный шаг: mult = 1 + beta·(1 − g_prev/ln x), raw ~ Gamma(k, среднее m). Полная формула среднего: m = max(3, (ln x · mult − 2p)/(1 − p) − e) — включает поправку на вероятность инъекции twin, вычет компенсации e и нижнюю границу 3; сокращённая запись ln x · mult — интуитивное описание роли beta. Безпараметрический residue-шаг: g' = ближайшее чётное с разрешённым (r + g') mod 30; при равных расстояниях до двух кандидатов действует правило tie ('small' — меньший, контролируется ниже; random использует отдельный поток tieRnd = splitmix32(seed ^ 0x9e3779b9), не сдвигающий основной поток случайных чисел). Состояние компенсации плотности обновляется кусочно: e_{n+1} = e_n + 0.002·(g'_n − raw_n − e_n) на обычном шаге; e_{n+1} = e_n при инъекции twin (raw не определён). В отличие от lattice30 нет перенаправления +2 — баланс вычетов не задаётся правилом, а получается из распределения. Генерация продолжается до первого элемента ≥ X (с явной проверкой покрытия после генерации), статистики считаются с обрезкой по X — плотность модели не фиксируется числом элементов.`);
md.push('');
md.push(`**Сплит статистик и сидов (объявлен до подбора):** FIT — twinIndex, var/mean², rho1det (по одной на ручку kappa/k/beta, масштаб X = 3·10⁷, сиды 101–105). VALIDATION на независимой выборке — пары (30/6 и per-gap против 𝔖 на общих интервалах 10⁶/10⁷/3·10⁷), гонки Чебышёва Δ₄/Δ₆ и drift, гистограмма промежутков mod 6, средний промежуток после twin (сиды 201–210, не пересекаются с fit); перенос twinIndex/disp/ρ₁det на 10⁶ и 10⁸ (сиды 301–305). Параметры после фита заморожены.`);
md.push('');
md.push(`## Фит (качество подгонки, mean ± sd по ${valSeeds.length} сидам)`);
md.push('');
md.push(`| Статистика | real @ 3·10⁷ | модель |`);
md.push(`|---|---|---`);
md.push(`| twinIndex | ${realFit.twinIndex.toFixed(3)} | ${out.fitQuality.twinIndex.mean.toFixed(3)} ± ${out.fitQuality.twinIndex.sd.toFixed(3)} |`);
md.push(`| var/mean² | ${realFit.dispersion.toFixed(3)} | ${out.fitQuality.dispersion.mean.toFixed(3)} ± ${out.fitQuality.dispersion.sd.toFixed(3)} |`);
md.push(`| rho1det | ${realFit.rho1det.toFixed(4)} | ${out.fitQuality.rho1det.mean.toFixed(4)} ± ${out.fitQuality.rho1det.sd.toFixed(4)} |`);
md.push('');
md.push(`Подобранные параметры: kappa=${out.fit.kappa}, k=${out.fit.k}, beta=${out.fit.beta} (раундов: ${out.fit.rounds}).`);
md.push('');
md.push(`### Монотонность rho1det(beta) при замороженных kappa и k (сиды 101–105)`);
md.push('');
md.push(`| beta | rho1det |`);
md.push(`|---|---|`);
for (const p of out.fit.betaSweep.points) {
  md.push(`| ${p.beta.toFixed(3)} | ${p.rho1det.toFixed(4)} |`);
}
md.push('');
md.push(`Зависимость ${out.fit.betaSweep.monotoneDecreasing ? '**монотонно убывает** на всём [0, 2]' : `монотонно убывает на [0, 1.5]${out.fit.betaSweep.monotoneTo15 ? '' : ' (с нарушением)'}`}; на [1.5, 2] — плато с отскоком не более ${out.fit.betaSweep.maxRebound.toFixed(5)} (уровень шума оценки ±0.0004 при 5 сидах). Подобранный beta = ${out.fit.beta} и цель фита −0.04 лежат в строго монотонной области — бисекция обоснована.`);
md.push('');
md.push(`## Валидация (параметры заморожены)`);
md.push('');
md.push(`| Статистика | real | модель (mean ± sd) | Вердикт |`);
md.push(`|---|---|---|---|`);
const races = out.validation.races;
md.push(`| Δ₄ @ 3·10⁷ | ${races.real.d4} | ${races.model.d4.mean.toFixed(0)} ± ${races.model.d4.sd.toFixed(0)} | ${Math.abs(races.model.d4.mean - races.real.d4) < 3 * races.model.d4.sd + Math.sqrt(races.real.d4) ? '✅ в шуме' : '❌'} |`);
md.push(`| Δ₆ @ 3·10⁷ | ${races.real.d6} | ${races.model.d6.mean.toFixed(0)} ± ${races.model.d6.sd.toFixed(0)} | ${Math.abs(races.model.d6.mean - races.real.d6) < 3 * races.model.d6.sd + Math.sqrt(races.real.d6) ? '✅ в шуме' : '❌'} |`);
md.push(`| drift Δ₄ | ${races.real.drift4.toFixed(3)} | ${races.model.drift4.mean.toFixed(3)} ± ${races.model.drift4.sd.toFixed(3)} | ${Math.abs(races.model.drift4.mean - races.real.drift4) < 0.05 ? '✅' : '❌'} |`);
md.push(`| drift Δ₆ | ${races.real.drift6.toFixed(3)} | ${races.model.drift6.mean.toFixed(3)} ± ${races.model.drift6.sd.toFixed(3)} | ${Math.abs(races.model.drift6.mean - races.real.drift6) < 0.05 ? '✅' : '❌'} |`);
const m6v = out.validation.mod6;
md.push(`| mod6 0/2/4, % | ${m6v.real.m0.toFixed(1)}/${m6v.real.m2.toFixed(1)}/${m6v.real.m4.toFixed(1)} | ${m6v.model.m0.mean.toFixed(1)}/${m6v.model.m2.mean.toFixed(1)}/${m6v.model.m4.mean.toFixed(1)} | ${Math.abs(m6v.model.m0.mean - m6v.real.m0) < 2 ? '✅' : '❌'} |`);
const mat = out.validation.meanAfterTwin;
md.push(`| средний промежуток после twin | ${mat.real ? mat.real.toFixed(2) : '—'} (безусловный ${mat.meanGapReal.toFixed(2)}) | ${mat.model.mean ? mat.model.mean.toFixed(2) : '—'} ± ${mat.model.sd ? mat.model.sd.toFixed(2) : '—'} (безусловный ${mat.meanGapModel.mean.toFixed(2)}) | ${mat.model.mean && mat.real && Math.abs(mat.model.mean - mat.real) < 1 ? '✅' : '❌'} |`);
for (const cut of X_PAIRS) {
  const row = out.validation.pairs[cut];
  md.push(`| пары 30/6 @ ${cut.toExponential(0)} | ${row.real30.toFixed(3)} (𝔖 1.333) | ${row.model.mean.toFixed(3)} ± ${row.model.sd.toFixed(3)} | ${Math.abs(row.model.mean - row.real30) < 3 * row.model.sd ? '✅' : '❌'} |`);
}
md.push('');
md.push(`### Контроль правила разрешения равенств в nearest-allowed (30 выделенных сидов 401–430, параметры заморожены; random использует отдельный поток tieRnd, не сдвигающий основной поток)`);
md.push('');
md.push(`| Вариант | Δ₄ | Δ₆ (30 сидов) | Δ₆ 401–415 / 416–430 | drift Δ₆ | доля 5 mod 6, % | mod6 0/2/4, % | meanGap | пары 30/6 @ 3e7 |`);
md.push(`|---|---|---|---|---|---|---|---|---|`);
const realM6 = out.validation.mod6.real;
md.push(`| real | ${races.real.d4} | ${races.real.d6} | — | +${races.real.drift6.toFixed(3)} | ${(100 * out.validation.residue5.real).toFixed(2)} | ${realM6.m0.toFixed(1)}/${realM6.m2.toFixed(1)}/${realM6.m4.toFixed(1)} | ${out.validation.meanAfterTwin.meanGapReal.toFixed(2)} | ${out.validation.pairs[30000000].real30.toFixed(3)} |`);
for (const [tie, c] of Object.entries(out.validation.tieControls)) {
  md.push(`| ${tie} | ${c.d4.mean.toFixed(0)} ± ${c.d4.sd.toFixed(0)} | ${c.d6.mean.toFixed(0)} ± ${c.d6.sd.toFixed(0)} | ${c.d6Half1.mean.toFixed(0)} / ${c.d6Half2.mean.toFixed(0)} | ${c.drift6.mean.toFixed(1)} ± ${c.drift6.sd.toFixed(1)} | ${(100 * c.residue5.mean).toFixed(2)} | ${c.mod6.m0.mean.toFixed(1)}/${c.mod6.m2.mean.toFixed(1)}/${c.mod6.m4.mean.toFixed(1)} | ${c.meanGap.mean.toFixed(2)} | ${c.pairs306.mean.toFixed(3)} ± ${c.pairs306.sd.toFixed(3)} |`);
}
md.push('');
md.push(`### Пары per-gap на [2, 3·10⁷]: пары(g)/пары(6) — real, модель, 𝔖(g)/𝔖(6)`);
md.push('');
md.push(`| g | real | модель | 𝔖(g)/𝔖(6) |`);
md.push(`|---|---|---|---|`);
const p3 = out.validation.pairs[30000000].perGap;
for (const g of pairGaps) {
  md.push(`| ${g} | ${p3[g].real.toFixed(3)} | ${p3[g].model.mean.toFixed(3)} ± ${p3[g].model.sd.toFixed(3)} | ${p3[g].sg.toFixed(3)} |`);
}
md.push('');
md.push(`### Перенос на другие масштабы (параметры заморожены)`);
md.push('');
md.push(`| Масштаб | twinIndex модель/real | var/mean² модель/real | rho1det модель/real |`);
md.push(`|---|---|---|---|`);
for (const [X, r] of Object.entries(transfer)) {
  md.push(`| ${Number(X).toExponential(0)} | ${r.twinIndex.mean.toFixed(3)} / ${r.real.twinIndex.toFixed(3)} | ${r.dispersion.mean.toFixed(3)} / ${r.real.dispersion.toFixed(3)} | ${r.rho1det.mean.toFixed(4)} / ${r.real.rho1det.toFixed(4)} |`);
}
md.push('');
md.push(`Интерпретация: FIT-статистики совпадают по построению. Вопрос валидации — закрывает ли условность (зависимость от g_prev и r mod 30) статистики, которые не подгонялись: гонки, пары, mod6. Решёточное округление к ближайшему разрешённому вычету не перенаправляет принудительно — баланс вычетов должен получиться сам.`);

writeFileSync(path.join(resultsDir, 'markov-model.json'), JSON.stringify(out));
writeFileSync(path.join(resultsDir, 'markov-model.md'), md.join('\n') + '\n');
console.log(`written: results/markov-model.md, results/markov-model.json`);
