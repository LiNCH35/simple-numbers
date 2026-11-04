import { describe, it, expect } from 'vitest';
import { createGenerator, splitmix32, isPrime, TWIN_PRIME_CONSTANT, countPrimesUpTo } from '../src/core/sequence.mjs';
import { primesUpTo } from '../src/core/real-primes.mjs';
import { analyzeGaps } from '../src/composables/useGapAnalysis';

const itH = (name, fn) => it(name, fn, 60000);

function gapsOf(seq) {
  const g = [];
  for (let i = 1; i < seq.length; i++) g.push(seq[i] - seq[i - 1]);
  return g;
}

function twinIndex(seq) {
  const g = gapsOf(seq);
  const n = g.length;
  const mean = g.reduce((a, b) => a + b, 0) / n;
  const twin = g.filter((x) => x === 2).length;
  return (twin / n) * mean;
}

function dispersion(seq) {
  const g = gapsOf(seq);
  const n = g.length;
  const mean = g.reduce((a, b) => a + b, 0) / n;
  const variance = g.reduce((a, b) => a + b * b, 0) / n - mean * mean;
  return variance / (mean * mean);
}

function generate(opts, count, tolerance = 1e-10, seed = 1) {
  return createGenerator({ seed, tolerance, trackProbability: false, ...opts }).generate(count).sequence;
}

describe('PRNG и мелочи ядра', () => {
  it('splitmix32 детерминирован', () => {
    const a = splitmix32(42);
    const b = splitmix32(42);
    const seqA = [a(), a(), a(), a(), a()];
    const seqB = [b(), b(), b(), b(), b()];
    expect(seqA).toEqual(seqB);
    expect(seqA).not.toEqual([b(), b(), b(), b(), b()]);
  });

  it('isPrime', () => {
    expect(isPrime(2)).toBe(true);
    expect(isPrime(3)).toBe(true);
    expect(isPrime(7919)).toBe(true);
    expect(isPrime(4)).toBe(false);
    expect(isPrime(9)).toBe(false);
    expect(isPrime(7917)).toBe(false);
  });

  it('TWIN_PRIME_CONSTANT = 2C2', () => {
    expect(TWIN_PRIME_CONSTANT).toBeCloseTo(1.3203236316937392, 15);
  });
});

describe('Сегментированное решето', () => {
  it('известные значения pi(x)', () => {
    expect(primesUpTo(10000).length).toBe(1229);
    expect(primesUpTo(1000000).length).toBe(78498);
  });

  it('кросс-чек с ядром', () => {
    expect(primesUpTo(999983).length).toBe(countPrimesUpTo(999983));
  });

  it('первые простые', () => {
    expect(Array.from(primesUpTo(30))).toEqual([2, 3, 5, 7, 11, 13, 17, 19, 23, 29]);
  });

  itH('реальная база 32.5M: pi и максимальный промежуток 210', () => {
    const primes = primesUpTo(32538909);
    expect(primes.length).toBe(2005014);
    expect(primes[primes.length - 1]).toBe(32538893);
    let maxGap = 0;
    let maxP = 0;
    for (let i = 1; i < primes.length; i++) {
      const g = primes[i] - primes[i - 1];
      if (g > maxGap) {
        maxGap = g;
        maxP = primes[i];
      }
    }
    expect(maxGap).toBe(210);
    expect(maxP).toBe(20831533);
  });

  itH('пары 30/6 против сингулярного ряда: 1.336 при предсказанных 1.333', () => {
    const primes = primesUpTo(32538909);
    const bits = new Uint8Array(Math.ceil((32538909 + 40) / 8));
    for (const p of primes) bits[p >> 3] |= 1 << (p & 7);
    const isP = (v) => (bits[v >> 3] & (1 << (v & 7))) !== 0;
    let c6 = 0;
    let c30 = 0;
    for (let i = 0; i < primes.length; i++) {
      const p = primes[i];
      if (p + 30 > 32538909) break;
      if (isP(p + 6)) c6++;
      if (isP(p + 30)) c30++;
    }
    const ratio = c30 / c6;
    expect(ratio).toBeGreaterThan(1.30);
    expect(ratio).toBeLessThan(1.37);
  });
});

describe('Валидация опций генератора', () => {
  const bad = [
    [{ mode: 'step', twinRate: 1 }, 'twinRate requires jump'],
    [{ mode: 'step', gapShape: 1.4 }, 'gapShape requires jump'],
    [{ mode: 'step', lattice6: true }, 'lattice6 requires jump'],
    [{ mode: 'step', lattice30: true }, 'lattice30 requires jump'],
    [{ mode: 'jump', gapShape: 0.5 }, 'gapShape must be a finite number >= 1'],
    [{ mode: 'jump', twinRate: -1 }, 'twinRate must be a non-negative finite number'],
    [{ mode: 'jump', lattice6: true, lattice30: true }, 'mutually exclusive'],
    [{ mode: 'jump', twinBias: true }, 'twinBias requires step mode']
  ];
  for (const [opts, message] of bad) {
    it(`отвергает ${JSON.stringify(opts)}`, () => {
      expect(() => createGenerator({ ...opts, seed: 1 })).toThrowError(new RegExp(message.split(' ').slice(-3).join('.*')));
    });
  }
});

describe('Дефолтная детерминированность (regression)', () => {
  it('префикс jump round seed 42', () => {
    const seq = generate({ mode: 'jump' }, 25, 1e-9, 42);
    expect(seq.slice(0, 8)).toEqual([2, 3, 5, 6, 7, 9, 10, 12]);
  });

  itH('x_max эталонных режимов на n=20000 seed 42', () => {
    const jump = createGenerator({ mode: 'jump', seed: 42, tolerance: 1e-9, trackProbability: false }).generate(20000);
    const step = createGenerator({ mode: 'step', seed: 42, tolerance: 1e-9, trackProbability: false }).generate(20000);
    const stepTwin = createGenerator({ mode: 'step', seed: 42, tolerance: 1e-9, trackProbability: false, twinBias: true }).generate(20000);
    expect(jump.currentNumber).toBe(223926);
    expect(step.sequence[step.sequence.length - 1]).toBe(225135);
    expect(stepTwin.sequence[stepTwin.sequence.length - 1]).toBe(225249);
  });
});

describe('Измеренные мишени (2M, seed 1, tolerance 1e-10)', () => {
  itH('jump: twinIndex 0.891, дисперсия 1.00', () => {
    const seq = generate({ mode: 'jump' }, 2000000);
    expect(twinIndex(seq)).toBeGreaterThan(0.85);
    expect(twinIndex(seq)).toBeLessThan(0.93);
    expect(dispersion(seq)).toBeGreaterThan(0.96);
    expect(dispersion(seq)).toBeLessThan(1.04);
  });

  itH('jump-corr (twinRate 0.8, gapShape 1.5): twinIndex 1.348, disp 0.738, плотность', () => {
    const seq = generate({ mode: 'jump', twinRate: 0.8, gapShape: 1.5 }, 2000000);
    expect(twinIndex(seq)).toBeGreaterThan(1.30);
    expect(twinIndex(seq)).toBeLessThan(1.40);
    expect(dispersion(seq)).toBeGreaterThan(0.71);
    expect(dispersion(seq)).toBeLessThan(0.77);
    const xMax = seq[seq.length - 1];
    const pi = primesUpTo(xMax).length;
    expect(Math.abs(2000000 - pi)).toBeLessThan(5000);
  });

  itH('lattice6-corr (twinRate 2.1, gapShape 1.45): мишени + инвариант mod 3', () => {
    const seq = generate({ mode: 'jump', lattice6: true, twinRate: 2.1, gapShape: 1.45 }, 2000000);
    expect(twinIndex(seq)).toBeGreaterThan(1.30);
    expect(twinIndex(seq)).toBeLessThan(1.41);
    expect(dispersion(seq)).toBeGreaterThan(0.68);
    expect(dispersion(seq)).toBeLessThan(0.74);
    for (const p of seq) {
      if (p > 3) expect(p % 3).not.toBe(0);
    }
    const gs = gapsOf(seq);
    expect(gs[0]).toBe(1);
    for (let i = 1; i < gs.length; i++) {
      expect(gs[i] % 2).toBe(0);
    }
  });

  itH('lattice30-corr (twinRate 3.4, gapShape 1.4): mod6 43.6/28.2/28.2, инвариант mod 30', () => {
    const seq = generate({ mode: 'jump', lattice30: true, twinRate: 3.4, gapShape: 1.4 }, 2000000);
    const analysis = analyzeGaps(seq);
    expect(analysis).not.toBeNull();
    expect(analysis.mod6.m0).toBeGreaterThan(42.5);
    expect(analysis.mod6.m0).toBeLessThan(44.7);
    expect(Math.abs(analysis.mod6.m2 - analysis.mod6.m4)).toBeLessThan(1.5);
    for (const p of seq) {
      if (p > 5) {
        expect(p % 3).not.toBe(0);
        expect(p % 5).not.toBe(0);
      }
    }
    expect(twinIndex(seq)).toBeGreaterThan(1.38);
    expect(twinIndex(seq)).toBeLessThan(1.60);
    expect(dispersion(seq)).toBeGreaterThan(0.68);
    expect(dispersion(seq)).toBeLessThan(0.74);
  });

  itH('analyzeGaps: Int32Array эквивалентен number[]', () => {
    const primes = primesUpTo(100000);
    const a = analyzeGaps(primes);
    const b = analyzeGaps(Array.from(primes));
    expect(a).toEqual(b);
  });
});
