import { mkdirSync, existsSync, writeFileSync, appendFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  createGenerator,
  calculateSequenceDifferences,
  countPrimesUpTo
} from '../src/core/sequence.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const resultsDir = path.join(__dirname, '..', 'results');
const logFile = path.join(resultsDir, 'experiment.log');

function log(message) {
  appendFileSync(logFile, `[${new Date().toISOString()}] ${message}\n`);
}

const quick = process.argv.includes('--quick');

const matrix = quick
  ? [
      { id: 'smoke-jump', mode: 'jump', seed: 42, tolerance: 1e-9, count: 2000, maxCombinations: 1e9, xStep: 5 },
      { id: 'smoke-step', mode: 'step', seed: 42, tolerance: 1e-9, count: 2000, maxCombinations: 1e9, xStep: 5 }
    ]
  : [
      { id: 'anchor-jump-s42-1e-10-100k', mode: 'jump', seed: 42, tolerance: 1e-10, count: 100000, maxCombinations: 5e10, xStep: 5 },
      { id: 'jump-s1-1e-10-300k', mode: 'jump', seed: 1, tolerance: 1e-10, count: 300000, maxCombinations: 5e10, xStep: 10 },
      { id: 'jump-s2-1e-10-300k', mode: 'jump', seed: 2, tolerance: 1e-10, count: 300000, maxCombinations: 5e10, xStep: 10 },
      { id: 'jump-s3-1e-10-300k', mode: 'jump', seed: 3, tolerance: 1e-10, count: 300000, maxCombinations: 5e10, xStep: 10 },
      { id: 'jump-s4-1e-10-300k', mode: 'jump', seed: 4, tolerance: 1e-10, count: 300000, maxCombinations: 5e10, xStep: 10 },
      { id: 'step-s1-1e-10-300k', mode: 'step', seed: 1, tolerance: 1e-10, count: 300000, maxCombinations: 5e10, xStep: 10 },
      { id: 'step-s2-1e-10-300k', mode: 'step', seed: 2, tolerance: 1e-10, count: 300000, maxCombinations: 5e10, xStep: 10 },
      { id: 'step-s3-1e-10-300k', mode: 'step', seed: 3, tolerance: 1e-10, count: 300000, maxCombinations: 5e10, xStep: 10 },
      { id: 'step-s4-1e-10-300k', mode: 'step', seed: 4, tolerance: 1e-10, count: 300000, maxCombinations: 5e10, xStep: 10 },
      { id: 'premium-jump-s1-1e-11-50k', mode: 'jump', seed: 1, tolerance: 1e-11, count: 50000, maxCombinations: 2e11, xStep: 5, premium: true },
      { id: 'premium-step-s2-1e-11-50k', mode: 'step', seed: 2, tolerance: 1e-11, count: 50000, maxCombinations: 2e11, xStep: 5, premium: true }
    ];

const PREMIUM_SKIP_MS = 15 * 60 * 1000;
const CHUNK = quick ? 500 : 50000;

mkdirSync(resultsDir, { recursive: true });

log(quick ? '=== QUICK SMOKE RUN ===' : '=== EXPERIMENT START ===');
log(`planned runs: ${matrix.length}`);

let premiumElapsed = 0;
let completed = 0;

try {
for (const run of matrix) {
  const outFile = path.join(resultsDir, `run-${run.id}.json`);
  if (existsSync(outFile)) {
    log(`SKIP ${run.id}: already exists`);
    completed++;
    continue;
  }
  if (run.premium && premiumElapsed > PREMIUM_SKIP_MS) {
    log(`SKIP ${run.id}: premium budget exceeded (${Math.round(premiumElapsed / 1000)}s spent on previous premium runs)`);
    continue;
  }
  log(
    `START ${run.id}: mode=${run.mode} seed=${run.seed} tolerance=${run.tolerance} ` +
      `count=${run.count} maxCombinations=${run.maxCombinations}`
  );
  const startedAt = Date.now();
  try {
    const generator = createGenerator({
      seed: run.seed,
      tolerance: run.tolerance,
      maxCombinations: run.maxCombinations,
      mode: run.mode
    });
    let truncatedAdds = 0;
    let stats = null;
    let generated = 0;
    while (generated < run.count) {
      const target = Math.min(generated + CHUNK, run.count);
      stats = generator.generate(target);
      truncatedAdds += stats.truncatedAdds;
      generated = target;
      if (generated < run.count) {
        log(`PROGRESS ${run.id}: ${generated}/${run.count} (${Math.round((Date.now() - startedAt) / 1000)}s)`);
      }
    }
    const durationMs = Date.now() - startedAt;
    const sequence = stats.sequence;
    const xMax = sequence[sequence.length - 1];
    const points = calculateSequenceDifferences(sequence, xMax, run.xStep);
    const realPrimes = countPrimesUpTo(xMax);
    const payload = {
      id: run.id,
      mode: run.mode,
      seed: run.seed,
      tolerance: run.tolerance,
      maxCombinations: run.maxCombinations,
      requestedCount: run.count,
      xStep: run.xStep,
      xMax,
      realPrimes,
      stats: {
        probability: stats.probability,
        probabilitySum: stats.probabilitySum,
        combinations: stats.combinations,
        skippedCombinations: stats.skippedCombinations,
        truncatedAdds,
        currentNumber: stats.currentNumber
      },
      durationMs,
      points,
      sequence
    };
    writeFileSync(outFile, JSON.stringify(payload));
    log(
      `DONE ${run.id}: ${durationMs}ms, xMax=${xMax}, realPrimes=${realPrimes}, ` +
        `probability=${stats.probability.toExponential(6)}, combinations=${stats.combinations}, ` +
        `skipped=${stats.skippedCombinations}, truncatedAdds=${truncatedAdds}`
    );
    if (run.premium) premiumElapsed += durationMs;
    completed++;
  } catch (error) {
    log(`ERROR ${run.id}: ${error.message}`);
  }
}
} catch (error) {
  log(`FATAL: ${error.stack || error.message}`);
}

log(`=== EXPERIMENT END: ${completed}/${matrix.length} runs available ===`);
