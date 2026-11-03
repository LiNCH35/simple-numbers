import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { primeCountPrefix } from '../src/core/sequence.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const resultsDir = path.join(__dirname, '..', 'results');
const includeSmoke = process.argv.includes('--smoke');

const tolLabel = (t) => t.toExponential(0);

function loadRuns() {
  const runs = [];
  for (const name of readdirSync(resultsDir)) {
    const match = /^run-(.+)\.json$/.exec(name);
    if (!match) continue;
    if (!includeSmoke && match[1].startsWith('smoke')) continue;
    const raw = JSON.parse(readFileSync(path.join(resultsDir, name), 'utf8'));
    const issues = [];
    if (raw.sequence.length !== raw.requestedCount) {
      issues.push(`sequence.length=${raw.sequence.length} != requestedCount=${raw.requestedCount}`);
    }
    for (let i = 1; i < raw.sequence.length; i++) {
      if (raw.sequence[i] <= raw.sequence[i - 1]) {
        issues.push(`sequence not strictly increasing at index ${i}`);
        break;
      }
    }
    const expectedPoints = Math.floor(raw.xMax / raw.xStep);
    if (raw.points.length !== expectedPoints) {
      issues.push(`points.length=${raw.points.length} != expected=${expectedPoints}`);
    }
    runs.push({ file: name, raw, issues });
  }
  return runs;
}

function groupKey(raw) {
  return `${raw.mode}-n${raw.requestedCount}-tol${tolLabel(raw.tolerance)}-xs${raw.xStep}`;
}

function linearSlope(xs, ys) {
  const n = xs.length;
  let sx = 0;
  let sy = 0;
  let sxy = 0;
  let sxx = 0;
  for (let i = 0; i < n; i++) {
    sx += xs[i];
    sy += ys[i];
    sxy += xs[i] * ys[i];
    sxx += xs[i] * xs[i];
  }
  const denom = n * sxx - sx * sx;
  return denom === 0 ? 0 : (n * sxy - sx * sy) / denom;
}

function sampleIndices(n, target) {
  const count = Math.min(n, target);
  const indices = [];
  for (let i = 0; i < count; i++) {
    indices.push(Math.round((i * (n - 1)) / (count - 1 || 1)));
  }
  return [...new Set(indices)];
}

function buildGroup(runs) {
  const raw0 = runs[0].raw;
  const xStep = raw0.xStep;
  const xMaxCommon = Math.min(...runs.map((r) => r.raw.xMax));
  const nPoints = Math.floor(xMaxCommon / xStep);
  const real = primeCountPrefix(xMaxCommon);
  const diffs = runs.map(() => new Float64Array(nPoints));
  for (let r = 0; r < runs.length; r++) {
    const points = runs[r].raw.points;
    for (let k = 0; k < nPoints; k++) diffs[r][k] = points[k].difference;
  }
  const xs = new Array(nPoints);
  const avg = new Array(nPoints);
  const std = new Array(nPoints);
  const minA = new Array(nPoints);
  const maxA = new Array(nPoints);
  const rel = new Array(nPoints);
  for (let k = 0; k < nPoints; k++) {
    const x = (k + 1) * xStep;
    let sum = 0;
    let mn = Infinity;
    let mx = -Infinity;
    for (let r = 0; r < runs.length; r++) {
      const d = diffs[r][k];
      sum += d;
      if (d < mn) mn = d;
      if (d > mx) mx = d;
    }
    const mean = sum / runs.length;
    let variance = 0;
    if (runs.length > 1) {
      for (let r = 0; r < runs.length; r++) {
        const d = diffs[r][k] - mean;
        variance += d * d;
      }
      variance /= runs.length - 1;
    }
    xs[k] = x;
    avg[k] = mean;
    std[k] = runs.length > 1 ? Math.sqrt(variance) : null;
    minA[k] = mn;
    maxA[k] = mx;
    rel[k] = real[x] > 0 ? mean / real[x] : 0;
  }
  const last = nPoints - 1;
  return {
    xStep,
    xMaxCommon,
    nPoints,
    slope: linearSlope(xs, avg),
    final: {
      x: xs[last],
      real: real[xs[last]],
      avgDiff: avg[last],
      std: std[last],
      min: minA[last],
      max: maxA[last],
      relDev: rel[last]
    },
    xs,
    avg,
    std,
    min: minA,
    max: maxA,
    rel
  };
}

function fmt(value, digits = 2) {
  if (value === null || value === undefined) return '-';
  if (!Number.isFinite(value)) return '-';
  return value.toFixed(digits);
}

function runSummaryTable(runs) {
  const lines = [
    '| run | mode | seed | tol | count | dur (s) | xMax | real(xMax) | final diff | probability | combinations | truncated | issues |',
    '|---|---|---|---|---|---|---|---|---|---|---|---|---|'
  ];
  for (const { raw, issues } of runs) {
    const lastDiff = raw.points[raw.points.length - 1].difference;
    lines.push(
      `| ${raw.id} | ${raw.mode} | ${raw.seed} | ${tolLabel(raw.tolerance)} | ${raw.requestedCount} | ` +
        `${fmt(raw.durationMs / 1000, 1)} | ${raw.xMax} | ${raw.realPrimes} | ${lastDiff} | ` +
        `${raw.stats.probability.toExponential(4)} | ${raw.stats.combinations} | ${raw.stats.truncatedAdds} | ` +
        `${issues.length ? issues.join('; ') : 'OK'} |`
    );
  }
  return lines.join('\n');
}

function curveTable(group, rows = 30) {
  const indices = sampleIndices(group.nPoints, rows);
  const lines = [
    '| x | real pi(x) | pseudo-real avg | std | min | max | rel dev % |',
    '|---|---|---|---|---|---|---|'
  ];
  for (const k of indices) {
    lines.push(
      `| ${group.xs[k]} | ${realAt(group, k)} | ` +
        `${fmt(group.avg[k])} | ${fmt(group.std[k])} | ${group.min[k]} | ${group.max[k]} | ${fmt(group.rel[k] * 100, 3)} |`
    );
  }
  return lines.join('\n');
}

let realCache = null;
function realAt(group, k) {
  if (!realCache || realCache.limit < group.xMaxCommon) {
    realCache = { limit: group.xMaxCommon, counts: primeCountPrefix(group.xMaxCommon) };
  }
  return realCache.counts[group.xs[k]];
}

const runs = loadRuns();
if (runs.length === 0) {
  console.error('no run files found in results/');
  process.exit(1);
}

const groups = new Map();
for (const entry of runs) {
  const key = groupKey(entry.raw);
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(entry);
}

const suffix = includeSmoke ? '-smoke' : '';
const built = new Map();
for (const [key, groupRuns] of groups) {
  const issuesAll = groupRuns.flatMap((r) => r.issues.map((i) => `${r.raw.id}: ${i}`));
  built.set(key, { runs: groupRuns, issues: issuesAll, stats: buildGroup(groupRuns) });
}

const analysisOut = {
  generatedAt: new Date().toISOString(),
  totalRuns: runs.length,
  groups: {}
};
for (const [key, g] of built) {
  analysisOut.groups[key] = {
    n: g.runs.length,
    xStep: g.stats.xStep,
    xMaxCommon: g.stats.xMaxCommon,
    nPoints: g.stats.nPoints,
    slope: g.stats.slope,
    final: g.stats.final,
    issues: g.issues,
    runs: g.runs.map(({ raw, issues }) => ({
      id: raw.id,
      seed: raw.seed,
      durationMs: raw.durationMs,
      xMax: raw.xMax,
      realPrimes: raw.realPrimes,
      finalDiff: raw.points[raw.points.length - 1].difference,
      stats: raw.stats,
      issues
    })),
    curveSample: sampleIndices(g.stats.nPoints, 1500).map((k) => ({
      x: g.stats.xs[k],
      real: realAt(g.stats, k),
      avgDiff: g.stats.avg[k],
      std: g.stats.std[k],
      min: g.stats.min[k],
      max: g.stats.max[k],
      relDev: g.stats.rel[k]
    }))
  };
}

const comparisons = [];
const byShape = new Map();
for (const [key, g] of built) {
  const m = /^(\w+)-n(\d+)-tol(.+)-xs(\d+)$/.exec(key);
  if (!m) continue;
  const shape = `n${m[2]}-tol${m[3]}-xs${m[4]}`;
  if (!byShape.has(shape)) byShape.set(shape, []);
  byShape.get(shape).push({ mode: m[1], key, g });
}
for (const [shape, members] of byShape) {
  if (members.length < 2) continue;
  for (let i = 0; i < members.length; i++) {
    for (let j = i + 1; j < members.length; j++) {
      const a = members[i];
      const b = members[j];
      const commonX = Math.min(a.g.stats.xMaxCommon, b.g.stats.xMaxCommon);
      const xStep = a.g.stats.xStep;
      const nPoints = Math.floor(commonX / xStep);
      const real = primeCountPrefix(commonX);
      const xs = new Array(nPoints);
      const delta = new Array(nPoints);
      const relA = new Array(nPoints);
      const relB = new Array(nPoints);
      for (let k = 0; k < nPoints; k++) {
        const x = (k + 1) * xStep;
        xs[k] = x;
        delta[k] = b.g.stats.avg[k] - a.g.stats.avg[k];
        relA[k] = a.g.stats.avg[k] / real[x];
        relB[k] = b.g.stats.avg[k] / real[x];
      }
      const last = nPoints - 1;
      comparisons.push({
        shape,
        a: { mode: a.mode, key: a.key, finalRelDev: relA[last], slope: a.g.stats.slope },
        b: { mode: b.mode, key: b.key, finalRelDev: relB[last], slope: b.g.stats.slope },
        commonX,
        deltaSlope: linearSlope(xs, delta),
        deltaFinal: delta[last],
        sample: sampleIndices(nPoints, 300).map((k) => ({
          x: xs[k],
          real: real[xs[k]],
          avgDiffA: a.g.stats.avg[k],
          avgDiffB: b.g.stats.avg[k],
          delta: delta[k],
          relDevA: relA[k],
          relDevB: relB[k]
        }))
      });
    }
  }
}
analysisOut.comparisons = comparisons.map(({ sample, ...rest }) => rest);
writeFileSync(path.join(resultsDir, `analysis${suffix}.json`), JSON.stringify(analysisOut));

const md = [];
md.push(`# Experiment analysis (${analysisOut.generatedAt})`);
md.push('');
md.push(`Total runs: ${runs.length}; groups: ${built.size}; comparisons: ${comparisons.length}`);
md.push('');
md.push('## Key numbers');
md.push('');
md.push('| group | n | x common | final avg diff | std | rel dev % | slope (diff/x) |');
md.push('|---|---|---|---|---|---|---|');
for (const [key, g] of built) {
  const f = g.stats.final;
  md.push(
    `| ${key} | ${g.runs.length} | ${f.x} | ${fmt(f.avgDiff)} | ${fmt(f.std)} | ${fmt(f.relDev * 100, 3)} | ${g.stats.slope.toExponential(3)} |`
  );
}
md.push('');
for (const c of comparisons) {
  md.push(
    `- ${c.a.key} vs ${c.b.key} on x<=${c.commonX}: final delta ${fmt(c.deltaFinal)} (B-A), delta slope ${c.deltaSlope.toExponential(3)}`
  );
}
md.push('');
md.push('## Groups');
for (const [key, g] of built) {
  md.push('');
  md.push(`### ${key}`);
  md.push('');
  if (g.issues.length) md.push(`**Integrity warnings:** ${g.issues.join('; ')}`);
  else md.push('Integrity: OK');
  md.push('');
  md.push(runSummaryTable(g.runs));
  md.push('');
  md.push('Average difference curve (pseudo-prime count minus real pi(x)):');
  md.push('');
  md.push(curveTable(g.stats));
}
md.push('');
md.push('## Mode comparisons');
for (const c of comparisons) {
  md.push('');
  md.push(`### ${c.a.key} vs ${c.b.key} (x <= ${c.commonX})`);
  md.push('');
  md.push(
    `final relDev A ${fmt(c.a.finalRelDev * 100, 3)}% vs B ${fmt(c.b.finalRelDev * 100, 3)}%; ` +
      `final delta (B-A) ${fmt(c.deltaFinal)}; delta slope ${c.deltaSlope.toExponential(3)}`
  );
  md.push('');
  const rows = sampleIndices(c.sample.length, 30);
  md.push('| x | real | avgDiff A | avgDiff B | delta | relDevA % | relDevB % |');
  md.push('|---|---|---|---|---|---|---|');
  for (const idx of rows) {
    const s = c.sample[idx];
    md.push(
      `| ${s.x} | ${s.real} | ${fmt(s.avgDiffA)} | ${fmt(s.avgDiffB)} | ${fmt(s.delta)} | ${fmt(s.relDevA * 100, 3)} | ${fmt(s.relDevB * 100, 3)} |`
    );
  }
}
writeFileSync(path.join(resultsDir, `analysis${suffix}.md`), md.join('\n'));

console.log(`analysis written: analysis${suffix}.json, analysis${suffix}.md`);
for (const [key, g] of built) {
  const f = g.stats.final;
  console.log(
    `${key}: n=${g.runs.length} x<=${f.x} avgDiff=${fmt(f.avgDiff)} std=${fmt(f.std)} rel=${fmt(f.relDev * 100, 3)}% slope=${g.stats.slope.toExponential(3)}`
  );
}
for (const c of comparisons) {
  console.log(
    `${c.a.key} vs ${c.b.key}: deltaFinal=${fmt(c.deltaFinal)} deltaSlope=${c.deltaSlope.toExponential(3)}`
  );
}
