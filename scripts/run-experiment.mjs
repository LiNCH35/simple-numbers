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

const smokeMatrix = [
  { id: 'smoke-jump', mode: 'jump', seed: 42, tolerance: 1e-9, count: 2000, maxCombinations: 1e9, xStep: 5 },
  { id: 'smoke-step', mode: 'step', seed: 42, tolerance: 1e-9, count: 2000, maxCombinations: 1e9, xStep: 5 }
];

const longMatrix = [
  { id: 'jump-s1-1e-10-2M', mode: 'jump', seed: 1, tolerance: 1e-10, count: 2000000, maxCombinations: 5e10, xStep: 200 },
  { id: 'jump-s2-1e-10-2M', mode: 'jump', seed: 2, tolerance: 1e-10, count: 2000000, maxCombinations: 5e10, xStep: 200 },
  { id: 'jump-s3-1e-10-2M', mode: 'jump', seed: 3, tolerance: 1e-10, count: 2000000, maxCombinations: 5e10, xStep: 200 },
  { id: 'jump-s4-1e-10-2M', mode: 'jump', seed: 4, tolerance: 1e-10, count: 2000000, maxCombinations: 5e10, xStep: 200 },
  { id: 'jump-s5-1e-10-2M', mode: 'jump', seed: 5, tolerance: 1e-10, count: 2000000, maxCombinations: 5e10, xStep: 200 },
  { id: 'jump-floor-s1-1e-10-2M', mode: 'jump', seed: 1, tolerance: 1e-10, count: 2000000, maxCombinations: 5e10, xStep: 200, jumpGap: 'floor' },
  { id: 'jump-floor-s2-1e-10-2M', mode: 'jump', seed: 2, tolerance: 1e-10, count: 2000000, maxCombinations: 5e10, xStep: 200, jumpGap: 'floor' },
  { id: 'jump-floor-s3-1e-10-2M', mode: 'jump', seed: 3, tolerance: 1e-10, count: 2000000, maxCombinations: 5e10, xStep: 200, jumpGap: 'floor' },
  { id: 'jump-floor-s4-1e-10-2M', mode: 'jump', seed: 4, tolerance: 1e-10, count: 2000000, maxCombinations: 5e10, xStep: 200, jumpGap: 'floor' },
  { id: 'jump-floor-s5-1e-10-2M', mode: 'jump', seed: 5, tolerance: 1e-10, count: 2000000, maxCombinations: 5e10, xStep: 200, jumpGap: 'floor' },
  { id: 'step-s1-1e-10-2M', mode: 'step', seed: 1, tolerance: 1e-10, count: 2000000, maxCombinations: 5e10, xStep: 200 },
  { id: 'step-s2-1e-10-2M', mode: 'step', seed: 2, tolerance: 1e-10, count: 2000000, maxCombinations: 5e10, xStep: 200 },
  { id: 'step-s3-1e-10-2M', mode: 'step', seed: 3, tolerance: 1e-10, count: 2000000, maxCombinations: 5e10, xStep: 200 },
  { id: 'step-s4-1e-10-2M', mode: 'step', seed: 4, tolerance: 1e-10, count: 2000000, maxCombinations: 5e10, xStep: 200 },
  { id: 'step-s5-1e-10-2M', mode: 'step', seed: 5, tolerance: 1e-10, count: 2000000, maxCombinations: 5e10, xStep: 200 },
  { id: 'step-twin-s1-1e-10-2M', mode: 'step', seed: 1, tolerance: 1e-10, count: 2000000, maxCombinations: 5e10, xStep: 200, twinBias: true },
  { id: 'step-twin-s2-1e-10-2M', mode: 'step', seed: 2, tolerance: 1e-10, count: 2000000, maxCombinations: 5e10, xStep: 200, twinBias: true },
  { id: 'step-twin-s3-1e-10-2M', mode: 'step', seed: 3, tolerance: 1e-10, count: 2000000, maxCombinations: 5e10, xStep: 200, twinBias: true },
  { id: 'step-twin-s4-1e-10-2M', mode: 'step', seed: 4, tolerance: 1e-10, count: 2000000, maxCombinations: 5e10, xStep: 200, twinBias: true },
  { id: 'step-twin-s5-1e-10-2M', mode: 'step', seed: 5, tolerance: 1e-10, count: 2000000, maxCombinations: 5e10, xStep: 200, twinBias: true }
];

const matrix = quick ? smokeMatrix : longMatrix;

const CHUNK = quick ? 500 : 50000;

mkdirSync(resultsDir, { recursive: true });

log(quick ? '=== QUICK SMOKE RUN ===' : '=== EXPERIMENT START ===');
log(`planned runs: ${matrix.length}`);

let completed = 0;

try {
for (const run of matrix) {
  const outFile = path.join(resultsDir, `run-${run.id}.json`);
  if (existsSync(outFile)) {
    log(`SKIP ${run.id}: already exists`);
    completed++;
    continue;
  }
  log(
    `START ${run.id}: mode=${run.mode} seed=${run.seed} tolerance=${run.tolerance} ` +
      `count=${run.count} maxCombinations=${run.maxCombinations} ` +
      `jumpGap=${run.jumpGap} twinBias=${run.twinBias === true}`
  );
  const startedAt = Date.now();
  try {
    const generator = createGenerator({
      seed: run.seed,
      tolerance: run.tolerance,
      maxCombinations: run.maxCombinations,
      mode: run.mode,
      trackProbability: false,
      jumpGap: run.jumpGap,
      twinBias: run.twinBias === true
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
      mode: `${run.mode}${run.jumpGap === 'floor' ? '-floor' : ''}${run.twinBias ? '-twin' : ''}`,
      jumpGap: run.jumpGap,
      twinBias: run.twinBias === true,
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
    completed++;
  } catch (error) {
    log(`ERROR ${run.id}: ${error.message}`);
  }
}
} catch (error) {
  log(`FATAL: ${error.stack || error.message}`);
}

log(`=== EXPERIMENT END: ${completed}/${matrix.length} runs available ===`);
