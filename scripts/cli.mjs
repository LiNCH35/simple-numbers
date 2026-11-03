import {
  createGenerator,
  calculateSequenceDifferences,
  countPrimesUpTo
} from '../src/core/sequence.mjs';
import { probabilityFor, ProbabilityCalculator } from '../src/core/probability.mjs';

const USAGE = `simple-numbers CLI

Usage:
  npm run cli -- <command> [options]
  node scripts/cli.mjs <command> [options]

Commands:
  generate       Generate a pseudo-prime sequence
  probability    Compute the inclusion-exclusion probability for a set of numbers
  diff           Compare sequence element counts against real prime counts per x-step
  bench          Measure generation and probability-sum performance

Options:
  --count <n>               Target sequence length (default 20)
  --tolerance <f>           Drop combinations whose contribution is below f, e.g. 1e-9 (default 1e-9).
                            This is the main accuracy/speed control: smaller = more terms, slower
  --sensitivity <n>         Optional cap on the inclusion-exclusion subset size (default unlimited)
  --seed <n>                PRNG seed, output is reproducible per seed (default 42)
  --initial <a,b,...>       Initial primes, must be integers >= 2 (default "2,3")
  --mode <jump|step>        jump = exponential gaps with mean ln(x), step = accept each integer with 1/ln(x) (default jump)
  --jump-gap <round|floor>  jump mode gap discretization, floor = 1 + floor(Exp(ln(x) - 1/2))
  --twin-bias               step mode Hardy-Littlewood twins, P(n+2) boosted by 2C2 with density compensation
  --no-track-probability    Do not feed generated numbers into the probability sum (faster)
  --numbers <a,b,...>       probability command only: explicit number set (skips generation)
  --step <n>                diff command only: x-step for the difference table (default 5)
  --format <text|json|csv>  Output format (default text)
  --max-combinations <n>    Safety fuse: abort if combinations exceed n (default 5e8)
  -h, --help                Show this help

Examples:
  npm run cli -- generate --count 20 --seed 42
  npm run cli -- generate --count 50 --tolerance 1e-9 --mode step --format csv
  npm run cli -- probability --numbers 2,3,5,7,11
  npm run cli -- probability --numbers 2,3,5,7,11 --sensitivity 3 --format json
  npm run cli -- diff --count 100 --seed 1 --step 5
  npm run cli -- generate --count 200 --mode step --seed 7
  npm run cli -- bench --count 500 --seed 7
`;

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token === '-h' || token === '--help') {
      args.help = true;
    } else if (token.startsWith('--')) {
      const key = token.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) {
        args[key] = true;
      } else {
        args[key] = next;
        i++;
      }
    } else {
      args._.push(token);
    }
  }
  return args;
}

function toInt(value, name, min) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min) {
    throw new Error(`${name} must be an integer >= ${min}, got: ${value}`);
  }
  return parsed;
}

function toPositiveFloat(value, name) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive finite number, got: ${value}`);
  }
  return parsed;
}

function toNumberList(value, name) {
  const list = String(value)
    .split(',')
    .map(part => Number(part.trim()))
    .filter(part => part !== '' && !Number.isNaN(part));
  if (list.length === 0 || list.some(v => !Number.isInteger(v) || v < 2)) {
    throw new Error(`${name} must be comma-separated integers >= 2`);
  }
  return list;
}

function readGeneratorOptions(args) {
  return {
    seed: args.seed !== undefined ? toInt(args.seed, '--seed', 0) : 42,
    tolerance:
      args.tolerance !== undefined ? toPositiveFloat(args.tolerance, '--tolerance') : 1e-9,
    sensitivity:
      args.sensitivity !== undefined ? toInt(args.sensitivity, '--sensitivity', 0) : Infinity,
    maxCombinations:
      args['max-combinations'] !== undefined
        ? toPositiveFloat(args['max-combinations'], '--max-combinations')
        : 5e8,
    initial: args.initial !== undefined ? toNumberList(args.initial, '--initial') : [2, 3],
    mode: args.mode !== undefined ? String(args.mode) : 'jump',
    jumpGap: args['jump-gap'] !== undefined ? String(args['jump-gap']) : 'round',
    twinBias: args['twin-bias'] !== undefined,
    trackProbability: args['no-track-probability'] === undefined,
    count: args.count !== undefined ? toInt(args.count, '--count', 1) : 20
  };
}

function readFormat(args) {
  if (args.format === undefined) return 'text';
  const format = String(args.format);
  if (format !== 'text' && format !== 'json' && format !== 'csv') {
    throw new Error(`--format must be text, json or csv, got: ${format}`);
  }
  return format;
}

function emit(format, payload, printers) {
  if (format === 'json') {
    console.log(JSON.stringify(payload, null, 2));
  } else if (format === 'csv') {
    printers.csv();
  } else {
    printers.text();
  }
}

function round(value, digits = 2) {
  const factor = Math.pow(10, digits);
  return Math.round(value * factor) / factor;
}

function formatSensitivity(sensitivity) {
  return sensitivity === Infinity ? 'unlimited' : sensitivity;
}

function printTable(headers, rows) {
  const widths = headers.map((header, column) =>
    Math.max(header.length, ...rows.map(row => String(row[column]).length))
  );
  const line = cells =>
    cells.map((cell, column) => String(cell).padStart(widths[column])).join('  ');
  console.log(line(headers));
  for (const row of rows) console.log(line(row));
}

function nowMs() {
  return Number(process.hrtime.bigint() / 1000n) / 1000;
}

function commandGenerate(args) {
  const options = readGeneratorOptions(args);
  const format = readFormat(args);
  const started = nowMs();
  const result = createGenerator(options).generate(options.count);
  const elapsedMs = nowMs() - started;

  const payload = {
    count: options.count,
    tolerance: options.tolerance,
    sensitivity: options.sensitivity === Infinity ? null : options.sensitivity,
    seed: options.seed,
    mode: options.mode,
    jumpGap: options.jumpGap,
    twinBias: options.twinBias,
    initial: options.initial,
    probability: result.probability,
    probabilitySum: result.probabilitySum,
    combinations: result.combinations,
    skippedCombinations: result.skippedCombinations,
    truncatedAdds: result.truncatedAdds,
    maxNumber: result.currentNumber,
    elapsedMs: round(elapsedMs),
    sequence: result.sequence
  };

  emit(format, payload, {
    text() {
      console.log(
        `generate  count=${options.count}  tolerance=${options.tolerance}  ` +
          `sensitivity=${formatSensitivity(options.sensitivity)}  ` +
          `seed=${options.seed}  mode=${options.mode}  initial=[${options.initial.join(',')}]` +
          (options.jumpGap !== 'round' ? `  jump-gap=${options.jumpGap}` : '') +
          (options.twinBias ? '  twin-bias' : '')
      );
      console.log(
        `probability=${result.probability.toPrecision(6)}  ` +
          `combinations=${result.combinations}  skipped=${result.skippedCombinations}  ` +
          `truncated=${result.truncatedAdds}  ` +
          `max=${result.currentNumber}  time=${round(elapsedMs)} ms`
      );
      console.log('');
      printTable(
        ['#', 'number'],
        result.sequence.map((value, index) => [index, value])
      );
    },
    csv() {
      console.log('index,number');
      result.sequence.forEach((value, index) => console.log(`${index},${value}`));
    }
  });
}

function commandProbability(args) {
  const options = readGeneratorOptions(args);
  const format = readFormat(args);

  let numbers;
  if (args.numbers !== undefined) {
    numbers = toNumberList(args.numbers, '--numbers');
  } else {
    numbers = createGenerator(options).generate(options.count).sequence;
  }

  const started = nowMs();
  const calculator = new ProbabilityCalculator(
    options.sensitivity,
    options.tolerance,
    options.maxCombinations
  );
  let truncatedAdds = 0;
  for (const number of numbers) {
    calculator.addPrime(number);
    if (calculator.lastAddTruncated) truncatedAdds++;
  }
  const elapsedMs = nowMs() - started;

  const payload = {
    numbers,
    tolerance: options.tolerance,
    sensitivity: options.sensitivity === Infinity ? null : options.sensitivity,
    combinations: calculator.combinations,
    skippedCombinations: calculator.skipped,
    truncatedAdds,
    probabilitySum: calculator.sum,
    probability: calculator.probability,
    elapsedMs: round(elapsedMs)
  };

  emit(format, payload, {
    text() {
      console.log(
        `probability  numbers=${numbers.length}  tolerance=${options.tolerance}  ` +
          `sensitivity=${formatSensitivity(options.sensitivity)}`
      );
      console.log(
        `sum=${calculator.sum.toPrecision(6)}  ` +
          `probability=${calculator.probability.toPrecision(6)}  ` +
          `combinations=${calculator.combinations}  skipped=${calculator.skipped}  ` +
          `truncated=${truncatedAdds}  time=${round(elapsedMs)} ms`
      );
    },
    csv() {
      console.log('numbers,tolerance,sensitivity,combinations,skippedCombinations,truncatedAdds,probabilitySum,probability,elapsedMs');
      console.log(
        `"${numbers.join(' ')}",${options.tolerance},${formatSensitivity(options.sensitivity)},` +
          `${calculator.combinations},${calculator.skipped},${truncatedAdds},${calculator.sum},` +
          `${calculator.probability},${round(elapsedMs)}`
      );
    }
  });
}

function commandDiff(args) {
  const options = readGeneratorOptions(args);
  const format = readFormat(args);
  const step = args.step !== undefined ? toInt(args.step, '--step', 1) : 5;

  const { sequence } = createGenerator(options).generate(options.count);
  const maxNumber = sequence[sequence.length - 1];
  const points = calculateSequenceDifferences(sequence, maxNumber, step);
  const realPrimes = countPrimesUpTo(maxNumber);

  const payload = {
    count: options.count,
    tolerance: options.tolerance,
    seed: options.seed,
    mode: options.mode,
    step,
    maxNumber,
    realPrimesUpToMax: realPrimes,
    points
  };

  emit(format, payload, {
    text() {
      console.log(
        `diff  count=${options.count}  tolerance=${options.tolerance}  ` +
          `seed=${options.seed}  step=${step}  max=${maxNumber}  realPrimes<=max=${realPrimes}`
      );
      console.log('');
      printTable(
        ['x', 'difference'],
        points.map(point => [point.x, point.difference])
      );
    },
    csv() {
      console.log('x,difference');
      points.forEach(point => console.log(`${point.x},${point.difference}`));
    }
  });
}

function commandBench(args) {
  const options = readGeneratorOptions(args);
  const format = readFormat(args);

  const generated = createGenerator(options).generate(options.count);
  const generatorTruncated = generated.truncatedAdds;

  const probabilityStarted = nowMs();
  const calculator = new ProbabilityCalculator(
    options.sensitivity,
    options.tolerance,
    options.maxCombinations
  );
  let truncatedAdds = 0;
  for (const number of generated.sequence) {
    calculator.addPrime(number);
    if (calculator.lastAddTruncated) truncatedAdds++;
  }
  const probabilityMs = nowMs() - probabilityStarted;

  const generationStarted = nowMs();
  createGenerator(options).generate(options.count);
  const generationMs = nowMs() - generationStarted;

  const payload = {
    count: options.count,
    tolerance: options.tolerance,
    sensitivity: options.sensitivity === Infinity ? null : options.sensitivity,
    seed: options.seed,
    mode: options.mode,
    combinations: calculator.combinations,
    skippedCombinations: calculator.skipped,
    truncatedAdds,
    generatorTruncatedAdds: generatorTruncated,
    probability: calculator.probability,
    probabilityMs: round(probabilityMs),
    generationMs: round(generationMs),
    primesPerSecond: round(generationMs > 0 ? (options.count / generationMs) * 1000 : 0)
  };

  emit(format, payload, {
    text() {
      console.log(
        `bench  count=${options.count}  tolerance=${options.tolerance}  ` +
          `sensitivity=${formatSensitivity(options.sensitivity)}  ` +
          `seed=${options.seed}  mode=${options.mode}`
      );
      console.log(
        `generation: ${round(generationMs)} ms  ` +
          `(${round((options.count / Math.max(generationMs, Number.EPSILON)) * 1000)} numbers/s, ` +
          `truncated=${generatorTruncated})`
      );
      console.log(
        `probability sum replay: ${round(probabilityMs)} ms  ` +
          `(${calculator.combinations} combinations, ${calculator.skipped} skipped, ` +
          `truncated=${truncatedAdds}, P=${calculator.probability.toPrecision(6)})`
      );
    },
    csv() {
      console.log('count,tolerance,sensitivity,seed,mode,combinations,skippedCombinations,probability,probabilityMs,generationMs,primesPerSecond');
      console.log(
        `${options.count},${options.tolerance},${formatSensitivity(options.sensitivity)},` +
          `${options.seed},${options.mode},${calculator.combinations},${calculator.skipped},` +
          `${calculator.probability},${round(probabilityMs)},${round(generationMs)},` +
          `${round(generationMs > 0 ? (options.count / generationMs) * 1000 : 0)}`
      );
    }
  });
}

function printUsage() {
  console.log(USAGE);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || args._.length === 0) {
    printUsage();
    process.exit(args.help || args._.length === 1 && args._[0] === 'help' ? 0 : 1);
  }
  const command = args._[0];
  if (command === 'generate') return commandGenerate(args);
  if (command === 'probability') return commandProbability(args);
  if (command === 'diff') return commandDiff(args);
  if (command === 'bench') return commandBench(args);
  throw new Error(`unknown command: ${command}`);
}

try {
  main();
} catch (error) {
  console.error(`error: ${error.message}`);
  process.exit(1);
}
