export function primesUpTo(limit) {
  if (!Number.isInteger(limit) || limit < 2) {
    throw new Error('limit must be an integer >= 2');
  }
  const primes = [2];
  if (limit === 2) return Int32Array.from(primes);

  const sqrtLimit = Math.floor(Math.sqrt(limit));
  const basePrimes = [];
  if (sqrtLimit >= 2) {
    const baseSieve = new Uint8Array(sqrtLimit + 1);
    for (let n = 3; n <= sqrtLimit; n += 2) {
      if (baseSieve[n] === 0) {
        basePrimes.push(n);
        for (let m = n * n; m <= sqrtLimit; m += 2 * n) baseSieve[m] = 1;
      }
    }
  }

  const SEGMENT_ODDS = 1 << 18;
  let low = 3;
  while (low <= limit) {
    const high = Math.min(limit, low + 2 * SEGMENT_ODDS - 2);
    const oddsCount = ((high - low) >> 1) + 1;
    const segment = new Uint8Array(oddsCount);
    for (let bi = 0; bi < basePrimes.length; bi++) {
      const p = basePrimes[bi];
      let start = Math.ceil(low / p) * p;
      if (start < p * p) start = p * p;
      if (start % 2 === 0) start += p;
      if (start > high) continue;
      for (let m = start; m <= high; m += 2 * p) {
        segment[(m - low) >> 1] = 1;
      }
    }
    for (let i = 0; i < oddsCount; i++) {
      if (segment[i] === 0) primes.push(low + 2 * i);
    }
    low = high + 2;
  }
  return Int32Array.from(primes);
}
