import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const resultsDir = path.join(__dirname, '..', 'results');
const figuresDir = path.join(__dirname, '..', 'article', 'figures');
mkdirSync(figuresDir, { recursive: true });

const data = JSON.parse(readFileSync(path.join(resultsDir, 'article-data.json'), 'utf8'));

const W = 900;
const Hh = 420;
const M = { l: 66, r: 24, t: 30, b: 52 };
const plotW = W - M.l - M.r;
const plotH = Hh - M.t - M.b;
const colors = {
  real: '#1c1c1a',
  jump: '#a3543f',
  'jump-corr': '#4f7d4f',
  'jump-lattice6-corr': '#8a6aa0',
  'jump-lattice30-corr': '#34557d',
  band: '#b9b9b2'
};
const modelLabel = {
  jump: 'jump (Крамер, round)',
  'jump-corr': 'jump-corr (κ=0.8, k=1.5)',
  'jump-lattice6-corr': 'lattice6-corr',
  'jump-lattice30-corr': 'lattice30-corr'
};

function niceTicks(min, max, target) {
  const raw = (max - min) / target;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * mag;
  const ticks = [];
  for (let v = Math.ceil(min / step) * step; v <= max + step * 1e-9; v += step) ticks.push(v);
  return { step, ticks };
}

function svgHeader(title) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${Hh}" viewBox="0 0 ${W} ${Hh}" font-family="system-ui, sans-serif">`
    + `<rect width="${W}" height="${Hh}" fill="#ffffff"/>`
    + `<text x="${W / 2}" y="18" text-anchor="middle" font-size="14" fill="#333">${title}</text>`;
}

function axes(xTicks, yTicks, xMap, yMap, xFmt = (v) => v.toString(), yFmt = (v) => v.toString(), xLabel = 'x', yLabel = '') {
  let s = '';
  for (const t of xTicks) {
    const x = xMap(t);
    s += `<line x1="${x}" y1="${M.t}" x2="${x}" y2="${M.t + plotH}" stroke="#ececea"/>`
      + `<text x="${x}" y="${M.t + plotH + 18}" text-anchor="middle" font-size="10" fill="#8a8a84">${xFmt(t)}</text>`;
  }
  for (const t of yTicks) {
    const y = yMap(t);
    s += `<line x1="${M.l}" y1="${y}" x2="${M.l + plotW}" y2="${y}" stroke="#ececea"/>`
      + `<text x="${M.l - 8}" y="${y + 3}" text-anchor="end" font-size="10" fill="#8a8a84">${yFmt(t)}</text>`;
  }
  s += `<rect x="${M.l}" y="${M.t}" width="${plotW}" height="${plotH}" fill="none" stroke="#1c1c1a"/>`;
  s += `<text x="${M.l + plotW / 2}" y="${Hh - 8}" text-anchor="middle" font-size="11" fill="#6f6f6a">${xLabel}</text>`;
  if (yLabel) s += `<text x="16" y="${M.t + plotH / 2}" text-anchor="middle" font-size="11" fill="#6f6f6a" transform="rotate(-90 16 ${M.t + plotH / 2})">${yLabel}</text>`;
  return s;
}

function polyline(xs, ys, xMap, yMap, color, width = 1.6, dash = '') {
  let d = '';
  for (let i = 0; i < xs.length; i++) {
    d += `${i === 0 ? 'M' : 'L'}${xMap(xs[i]).toFixed(1)},${yMap(ys[i]).toFixed(1)}`;
  }
  return `<path d="${d}" fill="none" stroke="${color}" stroke-width="${width}"${dash ? ` stroke-dasharray="${dash}"` : ''}/>`;
}

function legend(entries, index = 0) {
  let s = '';
  entries.forEach((e, i) => {
    const y = M.t + 10 + (index + i) * 17;
    s += `<rect x="${M.l + 10}" y="${y}" width="14" height="11" fill="${e.color}"/><text x="${M.l + 30}" y="${y + 10}" font-size="11" fill="#333">${e.label}</text>`;
  });
  return s;
}

const fmtK = (v) => (v >= 1e6 ? `${(v / 1e6).toFixed(v >= 1e7 ? 0 : 1)}M` : v >= 1e3 ? `${Math.round(v / 1e3)}k` : `${v}`);

// --- fig1: model - real count difference
{
  const xs = data.curves.jump.xs;
  const curveFrom = xs[0];
  const maxAbs = Math.max(
    ...xs.flatMap((_, i) => [
      Math.abs(data.curves.jump.model[i] - data.curves.jump.real[i]),
      Math.abs(data.curves['jump-corr'].model[i] - data.curves['jump-corr'].real[i]),
      Math.abs(data.curves['jump-lattice30-corr'].model[i] - data.curves['jump-lattice30-corr'].real[i])
    ])
  );
  const yMax = Math.max(maxAbs, 600) * 1.15;
  const xMax = xs[xs.length - 1];
  const xTicks = niceTicks(curveFrom, xMax, 8).ticks;
  const yTicks = niceTicks(-yMax, yMax, 8).ticks;
  const xMap = (v) => M.l + ((v - curveFrom) / (xMax - curveFrom)) * plotW;
  const yMap = (v) => M.t + plotH / 2 - (v / yMax) * (plotH / 2);
  let s = svgHeader('Отклонение счёта модели от реальных простых: Δ(x) = π_model(x) − π(x)');
  for (let i = 0; i < xs.length; i++) {
    const x = xMap(xs[i]);
    s += `<line x1="${x}" y1="${yMap(Math.sqrt(xs[i]))}" x2="${x}" y2="${yMap(-Math.sqrt(xs[i]))}" stroke="${colors.band}" stroke-width="1" opacity="0.5"/>`;
  }
  const spread = data.curveSpread && data.curveSpread['jump-corr'];
  if (spread) {
    for (let m = 1; m < spread.models.length; m++) {
      s += polyline(xs, spread.models[m].map((v, i) => v - data.curves['jump-corr'].real[i]), xMap, yMap, colors['jump-corr'], 0.8, '').replace('/>', ` opacity="0.22"/>`);
    }
  }
  s += axes(xTicks, yTicks, xMap, yMap, fmtK, (v) => v.toString(), 'x', 'Δ(x), чисел');
  s += polyline(xs, data.curves.jump.model.map((v, i) => v - data.curves.jump.real[i]), xMap, yMap, colors.jump);
  s += polyline(xs, data.curves['jump-corr'].model.map((v, i) => v - data.curves['jump-corr'].real[i]), xMap, yMap, colors['jump-corr']);
  s += polyline(xs, data.curves['jump-lattice30-corr'].model.map((v, i) => v - data.curves['jump-lattice30-corr'].real[i]), xMap, yMap, colors['jump-lattice30-corr']);
  s += polyline([curveFrom, xMax], [0, 0], xMap, yMap, '#1c1c1a', 1, '4,4');
  s += legend([
    { color: colors.jump, label: modelLabel.jump },
    { color: colors['jump-corr'], label: modelLabel['jump-corr'] + (spread ? ' + 9 сидов (прозр.)' : '') },
    { color: colors['jump-lattice30-corr'], label: modelLabel['jump-lattice30-corr'] },
    { color: colors.band, label: '±√π(x)' }
  ], 1);
  s += '</svg>';
  writeFileSync(path.join(figuresDir, 'fig1-count-difference.svg'), s);
}

// --- fig2: gap shares 2..40
{
  const gaps = [];
  for (let g = 2; g <= 40; g += 2) gaps.push(g);
  const real = data.real.shares;
  const jumpShares = data.modelShares.jump;
  const latShares = data.modelShares['jump-lattice30-corr'];
  const stepMax = Math.max(...gaps.map((g) => Math.max(real[g], jumpShares[g] ?? 0, latShares[g] ?? 0))) * 1.2;
  const xMap = (g) => M.l + ((g - 2) / 38) * plotW;
  const yMap = (v) => M.t + plotH - (v / stepMax) * plotH;
  const xTicks = gaps.filter((g) => g % 4 === 0 || g === 2);
  const yTicks = niceTicks(0, stepMax, 6).ticks;
  let s = svgHeader('Доли промежутков g (%, реальные простые до 10⁸ против моделей)');
  s += axes(xTicks, yTicks, xMap, yMap, (v) => v.toString(), (v) => v.toFixed(0), 'промежуток g', 'доля, %');
  s += polyline(gaps, gaps.map((g) => real[g]), xMap, yMap, colors.real, 2);
  s += polyline(gaps, gaps.map((g) => jumpShares[g] ?? 0), xMap, yMap, colors.jump, 1.4, '5,3');
  s += polyline(gaps, gaps.map((g) => latShares[g] ?? 0), xMap, yMap, colors['jump-lattice30-corr'], 1.4, '5,3');
  s += legend([
    { color: colors.real, label: 'реальные простые' },
    { color: colors.jump, label: modelLabel.jump + ' (пунктир)' },
    { color: colors['jump-lattice30-corr'], label: modelLabel['jump-lattice30-corr'] + ' (пунктир)' }
  ], 1);
  s += '</svg>';
  writeFileSync(path.join(figuresDir, 'fig2-gap-histogram.svg'), s);
}

// --- fig3: champion evolution
{
  const evo = data.real.evolution;
  const xs = evo.map((r) => r.x);
  const yMax = Math.max(...evo.flatMap((r) => [r.s6, r.s12, r.s2, r.s4, r.s30])) * 1.25;
  const xMap = (v) => M.l + ((v - xs[0]) / (xs[xs.length - 1] - xs[0])) * plotW;
  const yMap = (v) => M.t + plotH - (v / yMax) * plotH;
  const xTicks = xs;
  const yTicks = niceTicks(0, yMax, 6).ticks;
  let s = svgHeader('Эволюция долей ключевых промежутков с ростом x (реальные простые)');
  s += axes(xTicks, yTicks, xMap, yMap, fmtK, (v) => v.toFixed(0), 'x', 'доля, %');
  const series = [
    { key: 's6', color: '#34557d', label: 'g=6 (чемпион)' },
    { key: 's2', color: '#a3543f', label: 'g=2' },
    { key: 's4', color: '#4f7d4f', label: 'g=4' },
    { key: 's12', color: '#8a6aa0', label: 'g=12' },
    { key: 's30', color: '#b08a3e', label: 'g=30' }
  ];
  for (const ser of series) {
    s += polyline(xs, evo.map((r) => r[ser.key]), xMap, yMap, ser.color, 1.8);
    evo.forEach((r, i) => {
      s += `<circle cx="${xMap(r.x).toFixed(1)}" cy="${yMap(r[ser.key]).toFixed(1)}" r="2.5" fill="${ser.color}"/>`;
    });
  }
  s += legend(series.map((ser) => ({ color: ser.color, label: ser.label })), 1);
  s += '</svg>';
  writeFileSync(path.join(figuresDir, 'fig3-champions.svg'), s);
}

// --- fig4: pairs 30/6 by source (common interval [2, 3e7])
{
  const X3 = 30000000;
  const sRatio = data.constants.sRatio306;
  const entries = [
    { label: 'реальные', ratio: data.real.pairsByX[X3].ratio, sd: 0, color: '#1c1c1a' },
    { label: 'jump', ratio: data.pairModels.jump.ratios[X3].mean, sd: data.pairModels.jump.ratios[X3].sd, color: colors.jump },
    { label: 'jump-corr', ratio: data.pairModels['jump-corr'].ratios[X3].mean, sd: data.pairModels['jump-corr'].ratios[X3].sd, color: colors['jump-corr'] },
    { label: 'lattice30-corr', ratio: data.pairModels['jump-lattice30-corr'].ratios[X3].mean, sd: data.pairModels['jump-lattice30-corr'].ratios[X3].sd, color: colors['jump-lattice30-corr'] }
  ];
  const yMax = Math.max(...entries.map((e) => e.ratio + e.sd), sRatio) * 1.2;
  const slot = plotW / entries.length;
  const yMap = (v) => M.t + plotH - (v / yMax) * plotH;
  const yTicks = niceTicks(0, yMax, 6).ticks;
  let s = svgHeader('Отношение пар (p, p+30) / (p, p+6) на общем интервале [2, 3·10⁷]: реальность, модели (mean ± sd, 10 сидов), 𝔖');
  s += axes([], yTicks, (v) => v, yMap, () => '', (v) => v.toFixed(2), '', 'пары 30 / пары 6');
  entries.forEach((e, i) => {
    const x0 = M.l + i * slot + slot * 0.14;
    const bw = slot * 0.72;
    const bh = plotH - (yMap(e.ratio) - M.t);
    s += `<rect x="${x0}" y="${yMap(e.ratio)}" width="${bw}" height="${bh}" fill="${e.color}"/>`;
    if (e.sd > 0) {
      const cx = x0 + bw / 2;
      const yLo = yMap(e.ratio - e.sd);
      const yHi = yMap(e.ratio + e.sd);
      s += `<line x1="${cx}" y1="${yHi}" x2="${cx}" y2="${yLo}" stroke="#1c1c1a" stroke-width="1.2"/>`
        + `<line x1="${cx - 8}" y1="${yHi}" x2="${cx + 8}" y2="${yHi}" stroke="#1c1c1a" stroke-width="1.2"/>`
        + `<line x1="${cx - 8}" y1="${yLo}" x2="${cx + 8}" y2="${yLo}" stroke="#1c1c1a" stroke-width="1.2"/>`;
    }
    s += `<text x="${x0 + bw / 2}" y="${yMap(e.ratio + e.sd) - 6}" text-anchor="middle" font-size="11" fill="#333">${e.ratio.toFixed(3)}${e.sd > 0 ? ` ± ${e.sd.toFixed(3)}` : ''}</text>`;
    s += `<text x="${x0 + bw / 2}" y="${M.t + plotH + 18}" text-anchor="middle" font-size="11" fill="#6f6f6a">${e.label}</text>`;
  });
  s += `<line x1="${M.l}" y1="${yMap(sRatio)}" x2="${M.l + plotW}" y2="${yMap(sRatio)}" stroke="#4f7d4f" stroke-dasharray="6,4"/>`;
  s += `<text x="${M.l + plotW - 6}" y="${yMap(sRatio) - 6}" text-anchor="end" font-size="11" fill="#4f7d4f">𝔖(30)/𝔖(6) = ${sRatio.toFixed(3)}</text>`;
  s += '</svg>';
  writeFileSync(path.join(figuresDir, 'fig4-pairs.svg'), s);
}

// --- fig5: record gaps staircase (real, to 1e8)
{
  const recs = data.real.records;
  const xs = recs.map((r) => r.p);
  const yMax = Math.max(...recs.map((r) => r.cg)) * 1.3;
  const xMap = (v) => M.l + ((Math.log(v) - Math.log(xs[0])) / (Math.log(xs[xs.length - 1]) - Math.log(xs[0]) || 1)) * plotW;
  const yMap = (v) => M.t + plotH - (v / yMax) * plotH;
  const yTicks = niceTicks(0, yMax, 6).ticks;
  const decades = [];
  for (let d = Math.ceil(Math.log10(xs[0])); d <= Math.floor(Math.log10(xs[xs.length - 1])); d++) decades.push(Math.pow(10, d));
  let s = svgHeader('Рекордные промежутки реальных простых: C_g = g / ln²p (до 10⁸)');
  s += axes(decades, yTicks, xMap, yMap, (v) => fmtK(v), (v) => v.toFixed(1), 'p', 'C_g');
  let d = '';
  recs.forEach((r, i) => {
    d += `${i === 0 ? 'M' : 'L'}${xMap(r.p).toFixed(1)},${yMap(r.cg).toFixed(1)}H`;
  });
  d += `${xMap(xs[xs.length - 1]).toFixed(1)}`;
  s += `<path d="${d}" fill="none" stroke="#34557d" stroke-width="2"/>`;
  recs.forEach((r) => {
    s += `<circle cx="${xMap(r.p).toFixed(1)}" cy="${yMap(r.cg).toFixed(1)}" r="3" fill="#34557d"/><text x="${xMap(r.p) + 5}" y="${yMap(r.cg) - 5}" font-size="10" fill="#333">${r.g}</text>`;
  });
  const jumpBand = data.models.jump.maxGap;
  s += '</svg>';
  writeFileSync(path.join(figuresDir, 'fig5-records.svg'), s);
}

console.log(`figures written to ${figuresDir}`);
