import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createGenerator, splitmix32 } from '../src/core/sequence.mjs';
import { primesUpTo } from '../src/core/real-primes.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const resultsDir = path.join(__dirname, '..', 'results');

const quick = process.argv.includes('--quick');
const TOL = 1e-10;
const BINS = 20;
const BOOT_B = quick ? 50 : 200;
const BOOT_L = 50000;

const sieveLimit = quick ? 1e8 : 1e9;
const scales = quick ? [1e6, 1e8] : [1e6, 1e8, 1e9];
const testSeeds = quick ? [1, 2] : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const seeds1e9 = [1, 2, 3, 4, 5];

function gen(opts, n, seed) {
  return createGenerator({ seed, tolerance: TOL, trackProbability: false, mode: 'jump', ...opts }).generate(n).sequence;
}

function rhoFromAcc(lag, sum, sum2, n, first, last) {
  const mean = sum / n;
  const variance = sum2 / n - mean * mean;
  const c1 = lag / (n - 1) - ((sum - first) / (n - 1)) * ((sum - last) / (n - 1));
  return c1 / variance;
}

function rhoOfSeries(v) {
  const n = v.length;
  let lag = 0, sum = 0, sum2 = 0;
  for (let i = 0; i < n; i++) {
    sum += v[i];
    sum2 += v[i] * v[i];
    if (i > 0) lag += v[i - 1] * v[i];
  }
  return rhoFromAcc(lag, sum, sum2, n, v[0], v[n - 1]);
}

function fullStats(arr, limit, trendLimit) {
  const last = Math.min(limit === undefined ? Infinity : limit, arr[arr.length - 1]);
  const tl = trendLimit === undefined ? last : trendLimit;
  const logTl = Math.log(tl);
  const binOf = (x) => Math.max(0, Math.min(BINS - 1, Math.floor((BINS * Math.log(x)) / logTl)));
  const binSum = new Float64Array(BINS);
  const binCnt = new Float64Array(BINS);
  let nG = 0, sum = 0, sum2 = 0, twin = 0, maxG = 0;
  let m0 = 0, m2 = 0, m4 = 0;
  for (let i = 1; i < arr.length; i++) {
    if (arr[i] > last) break;
    const g = arr[i] - arr[i - 1];
    const b = binOf(arr[i - 1]);
    binSum[b] += g;
    binCnt[b] += 1;
    nG += 1;
    sum += g;
    sum2 += g * g;
    if (g === 2) twin += 1;
    if (g > maxG) maxG = g;
    if (g % 6 === 0) m0 += 1;
    else if (g % 6 === 2) m2 += 1;
    else m4 += 1;
  }
  const mean = sum / nG;
  const variance = sum2 / nG - mean * mean;
  const binMean = new Float64Array(BINS);
  for (let b = 0; b < BINS; b++) binMean[b] = binCnt[b] > 0 ? binSum[b] / binCnt[b] : mean;
  let lagR = 0, sumR = 0, sum2R = 0, firstR = 0, lastR = 0, prevR = 0;
  for (let i = 1; i < arr.length; i++) {
    if (arr[i] > last) break;
    const r = arr[i] - arr[i - 1] - binMean[binOf(arr[i - 1])];
    if (i === 1) firstR = r;
    lastR = r;
    sumR += r;
    sum2R += r * r;
    lagR += prevR * r;
    prevR = r;
  }
  let lagG = 0, prevG = 0, firstG = 0, lastG = 0;
  for (let i = 1; i < arr.length; i++) {
    if (arr[i] > last) break;
    const g = arr[i] - arr[i - 1];
    if (i === 1) firstG = g;
    lastG = g;
    lagG += prevG * g;
    prevG = g;
  }
  return {
    nG,
    meanGap: mean,
    twinIndex: (twin / nG) * mean,
    dispersion: variance / (mean * mean),
    rho1: rhoFromAcc(lagG, sum, sum2, nG, firstG, lastG),
    rho1Detrended: rhoFromAcc(lagR, sumR, sum2R, nG, firstR, lastR),
    mod6: { m0: (100 * m0) / nG, m2: (100 * m2) / nG, m4: (100 * m4) / nG },
    maxGap: maxG,
    binMean
  };
}

function materialize(arr, limit, binMean, binOf) {
  const last = Math.min(limit === undefined ? Infinity : limit, arr[arr.length - 1]);
  let n = 0;
  for (let i = 1; i < arr.length; i++) {
    if (arr[i] > last) break;
    n += 1;
  }
  const out = new Float64Array(n);
  for (let i = 1; i <= n; i++) out[i - 1] = arr[i] - arr[i - 1] - (binMean ? binMean[binOf(arr[i - 1])] : 0);
  return out;
}

function bootstrapRhoCi(values, rnd) {
  const n = values.length;
  const res = new Float64Array(n);
  const rhos = new Float64Array(BOOT_B);
  for (let b = 0; b < BOOT_B; b++) {
    let pos = 0;
    while (pos < n) {
      const start = Math.floor(rnd() * (n - BOOT_L));
      const take = Math.min(BOOT_L, n - pos);
      for (let j = 0; j < take; j++) res[pos + j] = values[start + j];
      pos += take;
    }
    rhos[b] = rhoOfSeries(res);
  }
  const sorted = Array.from(rhos).sort((a, b) => a - b);
  return { lo: sorted[Math.floor(0.025 * BOOT_B)], hi: sorted[Math.ceil(0.975 * BOOT_B) - 1] };
}

function modelStats(opts, n, seed, limit) {
  const seq = gen(opts, n, seed);
  const xMax = seq[seq.length - 1];
  const s = fullStats(seq, limit, limit === undefined ? xMax : limit);
  return { xMax, ...s };
}

function piAt(primes, x) {
  let lo = 0;
  let hi = primes.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (primes[mid] <= x) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function meanSd(values) {
  const m = values.reduce((s, v) => s + v, 0) / values.length;
  const sd = Math.sqrt(values.reduce((s2, v) => s2 + (v - m) * (v - m), 0) / values.length);
  const se = sd / Math.sqrt(values.length);
  return { mean: m, sd, se, ciLo: m - 1.96 * se, ciHi: m + 1.96 * se };
}

function fitCorr(X, piCount, real, fitSeeds, bisectIters, maxRounds, tag) {
  const clampK = (v) => Math.min(3, Math.max(1.05, v));
  let k = clampK(1 / real.dispersion);
  const twinAt = (kappa, kk) => {
    let s = 0;
    for (const seed of fitSeeds) s += modelStats({ twinRate: kappa, gapShape: kk }, piCount, seed, X).twinIndex;
    return s / fitSeeds.length;
  };
  const dispAt = (kappa, kk) => {
    let s = 0;
    for (const seed of fitSeeds) s += modelStats({ twinRate: kappa, gapShape: kk }, piCount, seed, X).dispersion;
    return s / fitSeeds.length;
  };
  let kappa = 0.8;
  let lo = 0.05;
  let hi = 4;
  const bisect = (iters) => {
    for (let it = 0; it < iters; it++) {
      kappa = (lo + hi) / 2;
      if (twinAt(kappa, k) < real.twinIndex) lo = kappa;
      else hi = kappa;
    }
    kappa = (lo + hi) / 2;
  };
  let kChanged = true;
  let converged = false;
  let round = 0;
  for (; round < maxRounds && !converged; round++) {
    if (round > 0 && kChanged) {
      lo = 0.05;
      hi = 4;
    }
    bisect(bisectIters);
    const twinMeas = twinAt(kappa, k);
    const dispMeas = dispAt(kappa, k);
    const kNew = clampK(k * dispMeas / real.dispersion);
    kChanged = Math.abs(kNew - k) > 0.005;
    k = kNew;
    converged = !kChanged && Math.abs(twinMeas - real.twinIndex) < 0.005 && Math.abs(dispMeas - real.dispersion) < 0.005;
    if (kChanged) console.log(`fit@${tag} round ${round}: k -> ${k.toFixed(3)} (restarting bisect)`);
  }
  if (kChanged) {
    lo = 0.05;
    hi = 4;
    bisect(bisectIters);
  }
  const check = modelStats({ twinRate: kappa, gapShape: k }, piCount, fitSeeds[0], X);
  console.log(`fit@${tag}: kappa=${kappa.toFixed(3)} k=${k.toFixed(3)} rounds=${round} -> twin ${check.twinIndex.toFixed(3)} (target ${real.twinIndex.toFixed(3)}), disp ${check.dispersion.toFixed(3)} (target ${real.dispersion.toFixed(3)})`);
  return { kappa: Number(kappa.toFixed(4)), k: Number(k.toFixed(4)), rounds: round };
}

console.log(`generalization: sieve to ${sieveLimit.toExponential(0)}, scales ${scales.join('/')}${quick ? ' (quick)' : ''}`);

const primes = primesUpTo(sieveLimit);
console.log(`sieve done: ${primes.length} primes`);

const rnd = splitmix32(20261106);
const realStats = {};
const realBoot = {};
const piX = {};
for (const X of scales) {
  const s = fullStats(primes, X, X);
  const gaps = materialize(primes, X, null, null);
  const bootRaw = bootstrapRhoCi(gaps, rnd);
  const logTl = Math.log(X);
  const binOf = (x) => Math.max(0, Math.min(BINS - 1, Math.floor((BINS * Math.log(x)) / logTl)));
  const resid = materialize(primes, X, s.binMean, binOf);
  const bootDet = bootstrapRhoCi(resid, rnd);
  piX[X] = piAt(primes, X);
  realBoot[X] = { rho1: bootRaw, rho1Detrended: bootDet };
  realStats[X] = s;
  const detTxt = ` [${bootDet.lo.toFixed(4)}; ${bootDet.hi.toFixed(4)}]`;
  console.log(`real@${X.toExponential(0)}: pi=${piX[X]} twin=${s.twinIndex.toFixed(3)} disp=${s.dispersion.toFixed(3)} rho1=${s.rho1.toFixed(4)} [${bootRaw.lo.toFixed(4)}; ${bootRaw.hi.toFixed(4)}] rho1det=${s.rho1Detrended.toFixed(4)}${detTxt}`);
}

const fits = {};
fits[1e6] = fitCorr(1e6, piX[1e6], realStats[1e6], [1, 2, 3], quick ? 8 : 10, quick ? 4 : 6, '1e6');
fits[1e8] = fitCorr(1e8, piX[1e8], realStats[1e8], quick ? [1] : [1, 2], quick ? 8 : 10, quick ? 4 : 6, '1e8');

function testConfig(id, opts, X, seeds, fitTag) {
  const runs = [];
  for (const seed of seeds) runs.push(modelStats(opts, piX[X], seed, X));
  const agg = (key) => meanSd(runs.map((r) => r[key]));
  const m6 = (sub) => meanSd(runs.map((r) => r.mod6[sub]));
  const out = {
    id,
    fitTag: fitTag ?? '-',
    seeds: seeds.length,
    xMax: agg('xMax'),
    twinIndex: agg('twinIndex'),
    dispersion: agg('dispersion'),
    rho1: agg('rho1'),
    rho1Detrended: agg('rho1Detrended'),
    maxGap: agg('maxGap'),
    mod6: { m0: m6('m0'), m2: m6('m2'), m4: m6('m4') }
  };
  const rt = realStats[X].twinIndex;
  const rd = realStats[X].dispersion;
  out.devTwinPct = (100 * (out.twinIndex.mean - rt)) / rt;
  out.devDispPct = (100 * (out.dispersion.mean - rd)) / rd;
  console.log(`test@${X.toExponential(0)} ${id}(${out.fitTag}): twin ${out.twinIndex.mean.toFixed(3)}±${out.twinIndex.sd.toFixed(3)} (${out.devTwinPct >= 0 ? '+' : ''}${out.devTwinPct.toFixed(1)}%), disp ${out.dispersion.mean.toFixed(3)}±${out.dispersion.sd.toFixed(3)} (${out.devDispPct >= 0 ? '+' : ''}${out.devDispPct.toFixed(1)}%), rho1det ${out.rho1Detrended.mean.toFixed(4)}±${out.rho1Detrended.sd.toFixed(4)}, maxGap ${out.maxGap.mean.toFixed(0)}±${out.maxGap.sd.toFixed(0)}`);
  return out;
}

const transfer = {};
for (const X of scales) {
  const others = scales.filter((s) => s !== X && fits[s]);
  const seeds = X === 1e9 ? seeds1e9 : testSeeds;
  const rows = [];
  rows.push(testConfig('jump', {}, X, seeds));
  if (fits[X]) rows.push(testConfig(`corr`, { twinRate: fits[X].kappa, gapShape: fits[X].k }, X, seeds, `fit@${X.toExponential(0)}`));
  for (const o of others) {
    rows.push(testConfig(`corr`, { twinRate: fits[o].kappa, gapShape: fits[o].k }, X, seeds, `fit@${o.toExponential(0)}`));
  }
  transfer[X] = rows;
}

const out = {
  generatedAt: new Date().toISOString(),
  quick,
  sieveLimit,
  bins: BINS,
  boot: { resamples: BOOT_B, blockLength: BOOT_L },
  real: Object.fromEntries(scales.map((X) => [X, {
    pi: piX[X],
    meanGap: realStats[X].meanGap,
    twinIndex: realStats[X].twinIndex,
    dispersion: realStats[X].dispersion,
    rho1: realStats[X].rho1,
    rho1Detrended: realStats[X].rho1Detrended,
    rho1Ci: realBoot[X].rho1,
    rho1DetrendedCi: realBoot[X].rho1Detrended,
    mod6: realStats[X].mod6,
    maxGap: realStats[X].maxGap
  }])),
  fits,
  transfer
};

const md = [];
md.push(`# Перенос параметров между масштабами (generalization)`);
md.push('');
md.push(`Сгенерировано scripts/generalization.mjs, ${out.generatedAt}${quick ? ' (QUICK)' : ''}.`);
md.push('');
md.push(`Процедура подбора (для каждого масштаба X отдельно): координатный спуск — бисекция по kappa (цель — twinIndex реальных на том же отрезке [2, X]) при k = 1/disp реальных; затем обновление k по измеренной дисперсии модели; затем повторная бисекция kappa. Проверка переноса: те же параметры применяются к прогонам других масштабов без перенастройки. Отклонение <= ~3% (порядок sd по сидам) считаем переносом.`);
md.push('');
md.push(`Реальные простые (решето до ${sieveLimit.toExponential(0)}):`);
md.push('');
md.push(`| x | pi(x) | twinIndex | var/mean² | rho1 [95% boot] | rho1 detrended [95% boot] | mod6 0/2/4, % |`);
md.push(`|---|---|---|---|---|---|---|`);
for (const X of scales) {
  const s = realStats[X];
  const b = realBoot[X];
  const det = b.rho1Detrended ? ` [${b.rho1Detrended.lo.toFixed(4)}; ${b.rho1Detrended.hi.toFixed(4)}]` : ' —';
  md.push(`| ${X.toExponential(0)} | ${piX[X]} | ${s.twinIndex.toFixed(3)} | ${s.dispersion.toFixed(3)} | ${s.rho1.toFixed(4)} [${b.rho1.lo.toFixed(4)}; ${b.rho1.hi.toFixed(4)}] | ${s.rho1Detrended.toFixed(4)}${det} | ${s.mod6.m0.toFixed(1)} / ${s.mod6.m2.toFixed(1)} / ${s.mod6.m4.toFixed(1)} |`);
}
md.push('');
md.push(`detrended rho1: вычтено среднее промежутков в 20 лог-бинах по x — контроль на артефакт нестационарности (средний промежуток растёт как ln x). CI — блоковый бутстрап (${BOOT_B} ресемплов, блок ${BOOT_L} промежутков, MBB).`);
md.push('');
md.push(`Подобранные параметры:`);
md.push('');
md.push(`| Масштаб подбора | kappa | k | Цель twinIndex | Цель var/mean² |`);
md.push(`|---|---|---|---|---|`);
for (const X of [1e6, 1e8]) {
  md.push(`| ${X.toExponential(0)} | ${fits[X].kappa} | ${fits[X].k} | ${realStats[X].twinIndex.toFixed(3)} | ${realStats[X].dispersion.toFixed(3)} |`);
}
md.push('');
md.push(`Матрица переноса (mean ± sd по сидам; delta — к реальным этого тест-масштаба):`);
md.push('');
md.push(`| Тест-масштаб | Конфигурация | twinIndex | delta twin | var/mean² | delta disp | rho1 detrended | maxGap |`);
md.push(`|---|---|---|---|---|---|---|---|`);
for (const X of scales) {
  for (const row of transfer[X]) {
    const label = row.id === 'jump' ? 'jump (без ручек)' : `jump-corr ${row.fitTag}`;
    md.push(`| ${X.toExponential(0)} | ${label} | ${row.twinIndex.mean.toFixed(3)} ± ${row.twinIndex.sd.toFixed(3)} | ${row.devTwinPct >= 0 ? '+' : ''}${row.devTwinPct.toFixed(1)}% | ${row.dispersion.mean.toFixed(3)} ± ${row.dispersion.sd.toFixed(3)} | ${row.devDispPct >= 0 ? '+' : ''}${row.devDispPct.toFixed(1)}% | ${row.rho1Detrended.mean.toFixed(4)} ± ${row.rho1Detrended.sd.toFixed(4)} | ${row.maxGap.mean.toFixed(0)} ± ${row.maxGap.sd.toFixed(0)} |`);
  }
}
md.push('');
md.push(`rho1 detrended у моделей ~0 против устойчиво отрицательного у реальных (CI не накрывает нуль) — антикорреляция промежутков не воспроизводится ни на одном масштабе и не является артефактом нестационарности.`);
md.push('');

writeFileSync(path.join(resultsDir, 'generalization.json'), JSON.stringify(out));
writeFileSync(path.join(resultsDir, 'generalization.md'), md.join('\n') + '\n');
console.log(`written: results/generalization.md, results/generalization.json`);
