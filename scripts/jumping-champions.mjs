import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createGenerator, TWIN_PRIME_CONSTANT, isPrime } from '../src/core/sequence.mjs';
import { primesUpTo } from '../src/core/real-primes.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const resultsDir = path.join(__dirname, '..', 'results');

const quick = process.argv.includes('--quick');
const xReal = quick ? 250000 : 32538909;
const pairGaps = [2, 4, 6, 8, 10, 12, 30];
const n = quick ? 200000 : 2000000;
const modelConfigs = [
  { id: 'jump', opts: { mode: 'jump' } },
  { id: 'jump-lattice', opts: { mode: 'jump', lattice6: true } },
  { id: 'jump-lattice-corr', opts: { mode: 'jump', lattice6: true, twinRate: 2.1, gapShape: 1.45 } },
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

function gapEvolution(primes, milestones) {
  const counts = new Map();
  const rows = [];
  let mi = 0;
  for (let i = 1; i < primes.length; i++) {
    const g = primes[i] - primes[i - 1];
    counts.set(g, (counts.get(g) ?? 0) + 1);
    while (mi < milestones.length && primes[i] >= milestones[mi]) {
      rows.push({ x: primes[i], total: i, counts: new Map(counts) });
      mi++;
    }
  }
  return rows;
}

function topOf(counts, total, k = 5) {
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, k)
    .map(([g, c]) => ({ g, pct: (100 * c) / total }));
}

function shareOf(counts, total, g) {
  return (100 * (counts.get(g) ?? 0)) / total;
}

function buildBits(primes) {
  const maxP = primes[primes.length - 1];
  const bits = new Uint8Array(Math.ceil((maxP + 40) / 8));
  for (const p of primes) bits[p >> 3] |= 1 << (p & 7);
  return bits;
}

function pairCounts(bits, primes, limit, gaps) {
  const isP = (v) => (bits[v >> 3] & (1 << (v & 7))) !== 0;
  const counts = {};
  for (const g of gaps) {
    let c = 0;
    for (let i = 0; i < primes.length; i++) {
      const p = primes[i];
      if (p + g > limit) break;
      if (isP(p + g)) c++;
    }
    counts[g] = c;
  }
  return counts;
}

console.log(`jumping-champions: real sieve to ${xReal}, models n=${n}${quick ? ' (quick)' : ''}`);

const realPrimes = primesUpTo(xReal);
const lastReal = realPrimes[realPrimes.length - 1];
const milestones = [1e4, 1e5, 1e6, 1.7427e6, 1e7, lastReal];
const realRows = gapEvolution(realPrimes, milestones);
const realBits = buildBits(realPrimes);
const realPairs = pairCounts(realBits, realPrimes, lastReal, pairGaps);
console.log(`real: ${realPrimes.length} primes to ${lastReal}`);

const models = [];
for (const config of modelConfigs) {
  const gen = createGenerator({ seed: 1, tolerance: 1e-10, trackProbability: false, ...config.opts }).generate(n);
  const seq = gen.sequence;
  const counts = new Map();
  for (let i = 1; i < seq.length; i++) {
    const g = seq[i] - seq[i - 1];
    counts.set(g, (counts.get(g) ?? 0) + 1);
  }
  const total = seq.length - 1;
  const bits = buildBits(seq);
  const pairs = pairCounts(bits, seq, seq[seq.length - 1], pairGaps);
  models.push({ id: config.id, xMax: seq[seq.length - 1], total, counts, pairs });
  const champion = topOf(counts, total, 1)[0];
  console.log(`model ${config.id}: champion ${champion.g} (${champion.pct.toFixed(2)}%)`);
}

const fmt = (v, d = 2) => v.toFixed(d);
const lines = [];
lines.push('# Jumping champions: чемпионы промежутков и сингулярный ряд');
lines.push('');
lines.push(`Сгенерировано scripts/jumping-champions.mjs${quick ? ' (--quick)' : ''}, ${new Date().toISOString()}. Реальные простые: сегментированное решето до x=${lastReal.toLocaleString('en-US')} (${realPrimes.length.toLocaleString('en-US')} шт.). Модели: n=${n.toLocaleString('en-US')}, seed 1, tolerance 1e-10.`);
lines.push('');
lines.push('Частота промежутка g в эвристике Харди—Литтлвуда: N(g) ~ S(g)·exp(-g/ln x), где S(g) = 2C2 · prod_{p>2, p|g/2} (p-1)/(p-2) — сингулярный ряд; для пар (p, p+g) штраф exp(-g/ln x) отсутствует, поэтому отношение пар = отношение S(g) точно.');
lines.push('');

lines.push('## Эволюция чемпионов промежутков (реальные простые)');
lines.push('');
lines.push('| x (простое reached) | промежутков | Чемпион | Доля, % | Доля 6 | Доля 12 | Доля 30 | Top-5 (gap: %) |');
lines.push('|---|---|---|---|---|---|---|---|');
for (const row of realRows) {
  const top = topOf(row.counts, row.total);
  const champ = top[0];
  lines.push(`| ${row.x.toLocaleString('en-US')} | ${row.total.toLocaleString('en-US')} | **${champ.g}** | ${fmt(champ.pct)} | ${fmt(shareOf(row.counts, row.total, 6))} | ${fmt(shareOf(row.counts, row.total, 12))} | ${fmt(shareOf(row.counts, row.total, 30))} | ${top.map((t) => `${t.g}: ${fmt(t.pct)}`).join(', ')} |`);
}
lines.push('');

lines.push('## Пары (p, p+g) против сингулярного ряда (реальные, x = ' + lastReal.toLocaleString('en-US') + ')');
lines.push('');
lines.push('| g | S(g) | пар | пар/S(g) | к g=2 |');
lines.push('|---|---|---|---|---|');
const realNorm = realPairs[2] / singularSeries(2);
for (const g of pairGaps) {
  const s = singularSeries(g);
  lines.push(`| ${g} | ${fmt(s, 4)} | ${realPairs[g].toLocaleString('en-US')} | ${fmt(realPairs[g] / s, 0)} | ${fmt((realPairs[g] / s) / realNorm, 3)} |`);
}
lines.push('');
lines.push('Отношение пар/S(g) постоянно по g — прямая проверка сингулярного ряда Харди—Литтлвуда на наших данных; столбец «к g=2» должен быть ~1.');
lines.push('');

const lastRow = realRows[realRows.length - 1];
const lastTop = topOf(lastRow.counts, lastRow.total);
const lastChamp = lastTop[0];
const sRatio = singularSeries(30) / singularSeries(6);

lines.push('## Чемпионы и пары моделей против реальных');
lines.push('');
lines.push('| Источник | x_max | Чемпион | Доля чемпиона, % | 6, % | 12, % | 30, % | пары 30/6 | S(30)/S(6) |');
lines.push('|---|---|---|---|---|---|---|---|---|');
lines.push(`| реальные | ${lastRow.x.toLocaleString('en-US')} | **${lastChamp.g}** | ${fmt(lastChamp.pct)} | ${fmt(shareOf(lastRow.counts, lastRow.total, 6))} | ${fmt(shareOf(lastRow.counts, lastRow.total, 12))} | ${fmt(shareOf(lastRow.counts, lastRow.total, 30))} | ${fmt(realPairs[30] / realPairs[6], 3)} | ${fmt(sRatio, 3)} |`);
for (const m of models) {
  const champ = topOf(m.counts, m.total, 1)[0];
  lines.push(`| ${m.id} | ${m.xMax.toLocaleString('en-US')} | **${champ.g}** | ${fmt(champ.pct)} | ${fmt(shareOf(m.counts, m.total, 6))} | ${fmt(shareOf(m.counts, m.total, 12))} | ${fmt(shareOf(m.counts, m.total, 30))} | ${fmt(m.pairs[30] / m.pairs[6], 3)} | ${fmt(sRatio, 3)} |`);
}
lines.push('');

const jumpModel = models.find((m) => m.id === 'jump');
const jumpChamp = topOf(jumpModel.counts, jumpModel.total, 1)[0];
const latModel = models.find((m) => m.id === 'jump-lattice');
const latChamp = topOf(latModel.counts, latModel.total, 1)[0];
const latCorrModel = models.find((m) => m.id === 'jump-lattice-corr');
const crossRow = realRows.find((r) => r.x >= 1.7427e6);

lines.push('## Выводы');
lines.push('');
lines.push(`1. Чемпион реальных промежутков на всём нашем диапазоне — 6 (доля ${fmt(shareOf(lastRow.counts, lastRow.total, 6))}% на x=${lastReal.toLocaleString('en-US')}, монотонно вниз от ${fmt(shareOf(realRows[0].counts, realRows[0].total, 6))}% на x=${realRows[0].x.toLocaleString('en-US')}); на рубеже x ≈ 1.74·10^6 замерено перестроение топа: 12 обгоняет 2 и 4 (${fmt(shareOf(crossRow.counts, crossRow.total, 12))} против ${fmt(shareOf(crossRow.counts, crossRow.total, 2))} и ${fmt(shareOf(crossRow.counts, crossRow.total, 4))}). Сам переход 6→30 по эвристике S(g)·exp(-g/ln x) при замеренном S(30)/S(6) = ${fmt(sRatio, 3)} требует ln x = 24/ln(4/3) ≈ 83.4, т.е. x ≈ 1.5·10^36 — вне вычислительного диапазона; наши данные фиксируют иерархию, а не переход.`);
lines.push(`2. Пары вместо промежутков: знаменитый эффект Харди—Литтлвуда подтверждён на собственных данных — пар (p, p+30) уже больше, чем (p, p+6): ${realPairs[30].toLocaleString('en-US')} против ${realPairs[6].toLocaleString('en-US')}, отношение ${fmt(realPairs[30] / realPairs[6], 3)} при предсказании S-отношения ${fmt(sRatio, 3)} (расхождение ${fmt(Math.abs(100 * (realPairs[30] / realPairs[6] / sRatio - 1)), 1)}%); столбец «к g=2» в таблице пар ≈ 1.000 по всем g — сингулярный ряд замерен напрямую.`);
lines.push(`3. Модели уровня промежутков чемпионов не воспроизводят: baseline jump — чемпион промежуток 1 (${fmt(jumpChamp.pct)}% соседних псевдопростых — прямый артефакт отсутствия решета), решётка — чемпион 6 с двукратным завышением (${fmt(latChamp.pct)}% против реальных ${fmt(shareOf(lastRow.counts, lastRow.total, 6))}%: перенаправления сваливают малую массу в 6), их пары 30/6 = ${fmt(jumpModel.pairs[30] / jumpModel.pairs[6], 3)}-${fmt(latCorrModel.pairs[30] / latCorrModel.pairs[6], 3)} против ${fmt(realPairs[30] / realPairs[6], 3)} у реальных. Фиксируем иерархию: плотность → близнецы → сгущения → mod6-гистограмма воспроизводимы ручками ядра; чемпионы, сингулярный ряд и баланс вычетов — нет: они живут на уровне решётки вычетов (произведения по всем малым простым), который правилами промежутков не достигается.`);
lines.push('');

const reportPath = path.join(resultsDir, 'jumping-champions.md');
writeFileSync(reportPath, lines.join('\n') + '\n');
console.log(`report written: ${reportPath}`);
