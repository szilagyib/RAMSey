// ---------------------------------------------------------------------------
// Minimal dependency-free linear algebra for the solvers.
// ---------------------------------------------------------------------------

export type Matrix = number[][];

export function identity(n: number): Matrix {
  const m: Matrix = [];
  for (let i = 0; i < n; i++) {
    m.push(new Array(n).fill(0));
    m[i][i] = 1;
  }
  return m;
}

export function multiply(a: Matrix, b: Matrix): Matrix {
  const n = a.length;
  const m = b[0].length;
  const inner = b.length;
  const out: Matrix = Array.from({ length: n }, () => new Array(m).fill(0));
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < inner; k++) {
      const aik = a[i][k];
      if (aik === 0) continue;
      for (let j = 0; j < m; j++) out[i][j] += aik * b[k][j];
    }
  }
  return out;
}

export function matvec(a: Matrix, x: number[]): number[] {
  return a.map((row) => row.reduce((s, v, j) => s + v * x[j], 0));
}

/**
 * Solve A·x = b via Gaussian elimination with partial pivoting.
 * Throws if the matrix is singular.
 */
export function solveLinear(A: Matrix, b: number[]): number[] {
  const n = A.length;
  // Augmented copy.
  const M = A.map((row, i) => [...row, b[i]]);

  for (let col = 0; col < n; col++) {
    // Partial pivot: largest magnitude in this column.
    let pivot = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(M[r][col]) > Math.abs(M[pivot][col])) pivot = r;
    }
    if (Math.abs(M[pivot][col]) < 1e-15) {
      throw new Error('Singular matrix in solveLinear');
    }
    [M[col], M[pivot]] = [M[pivot], M[col]];

    // Eliminate below.
    for (let r = col + 1; r < n; r++) {
      const factor = M[r][col] / M[col][col];
      if (factor === 0) continue;
      for (let c = col; c <= n; c++) M[r][c] -= factor * M[col][c];
    }
  }

  // Back-substitution.
  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let sum = M[i][n];
    for (let j = i + 1; j < n; j++) sum -= M[i][j] * x[j];
    x[i] = sum / M[i][i];
  }
  return x;
}

/** Invert a square matrix via solving A·x = eⱼ for each column. */
export function invert(A: Matrix): Matrix {
  const n = A.length;
  const cols: number[][] = [];
  for (let j = 0; j < n; j++) {
    const e = new Array(n).fill(0);
    e[j] = 1;
    cols.push(solveLinear(A, e));
  }
  // cols[j] is column j of the inverse; transpose into row-major.
  const inv: Matrix = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) inv[i][j] = cols[j][i];
  return inv;
}

/**
 * Largest Λ·t the Poisson series is evaluated at directly.
 *
 * The series is seeded with e^{−Λt}, so Λt is bounded by what float64 can
 * represent: the seed is denormal past ~709 and exactly 0 past 745, at which
 * point every term contributes nothing and the series returns a zero matrix.
 * 100 keeps the seed at ~3.7e−44 — far from either cliff — while keeping the
 * series short, since its length grows with Λt.
 */
const MAX_DIRECT_LT = 100;

/**
 * Matrix exponential of a CTMC generator: exp(Q·t), computed by uniformization
 * (Jensen's method). Q must have non-positive diagonals and zero row sums.
 *
 * Returns the transition probability matrix P(t), for any finite Λt ≥ 0. Large
 * Λt is handled by scaling and squaring — exp(Q·t) = exp(Q·t/2^k)^(2^k) — which
 * keeps the series inside the range float64 can seed (see MAX_DIRECT_LT) and is
 * also much cheaper than the long series it replaces, since squaring reaches t
 * in k multiplications rather than Λt terms.
 *
 * `tol` bounds the Poisson tail truncation in the *returned* matrix, so rows sum
 * to 1 within `tol` whatever k turns out to be. Throws RangeError on a negative
 * or non-finite t.
 */
export function matExp(Q: Matrix, t: number, tol = 1e-12): Matrix {
  const n = Q.length;
  if (n === 0) return [];
  // Neither of these has an answer to compute, and both used to fail quietly:
  // a NaN term count meant the series never ran and the zeroed accumulator was
  // returned as if it were a result, while an infinite t made the squaring
  // count infinite and the loop below never ended.
  if (!Number.isFinite(t) || t < 0) {
    throw new RangeError(`matExp needs a finite, non-negative t (got ${t})`);
  }
  if (t === 0) return identity(n);

  // Uniformization rate: the largest total exit rate.
  let lambda = 0;
  for (let i = 0; i < n; i++) lambda = Math.max(lambda, -Q[i][i]);
  if (lambda <= 0) return identity(n); // no transitions

  // Λ·t, not t, is what sizes the work, and it can overflow while t is an
  // ordinary finite number — a mission time of 1e308 against any rate above
  // ~1.8. The squaring count then becomes Infinity and the loop below never
  // ends, in a worker with no timeout.
  if (!Number.isFinite(lambda * t)) {
    throw new RangeError(`matExp: Λ·t overflows (Λ=${lambda}, t=${t})`);
  }

  // Split t into 2^k sub-steps small enough to evaluate the series on, then
  // recombine by repeated squaring. k = 0 for the common small-Λt case, which
  // leaves the direct series below untouched.
  const squarings = Math.max(0, Math.ceil(Math.log2((lambda * t) / MAX_DIRECT_LT)));
  const step = t / 2 ** squarings;

  // Uniformized stochastic matrix P = I + Q/lambda.
  const P = identity(n);
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) P[i][j] += Q[i][j] / lambda;

  const lt = lambda * step;
  // The series stops with the Poisson tail still worth `stepTol`, leaving rows
  // summing to 1 − stepTol — and each squaring below doubles that deficit. So
  // the sub-step has to be 2^squarings tighter for the *final* matrix to hold
  // the tolerance this function documents. Left unscaled, a one-year mission
  // came out sub-stochastic by ~2e−11: invisible in a printed number, but a
  // caller scaling a chart axis to its own data plots it as a trend.
  // ...but not below what float64 can resolve near 1. `1 - cumulative` bottoms
  // out around machine epsilon, so a smaller target can never be met: the break
  // never fires, the series burns every one of its maxTerms, and the error it
  // was meant to bound runs free.
  const stepTol = Math.max(tol / 2 ** squarings, 4 * Number.EPSILON);
  let result: Matrix = Array.from({ length: n }, () => new Array(n).fill(0));
  let Pk = identity(n); // P^0
  let weight = Math.exp(-lt); // Poisson(lt) pmf at k=0
  let cumulative = 0;
  const maxTerms = Math.max(1000, Math.ceil(lt * 4) + 50);

  for (let k = 0; k <= maxTerms; k++) {
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) result[i][j] += weight * Pk[i][j];
    cumulative += weight;
    if (k >= lt && 1 - cumulative < stepTol) break;
    Pk = multiply(Pk, P);
    weight *= lt / (k + 1);
  }

  // exp(Q·step)^(2^squarings) = exp(Q·t).
  for (let s = 0; s < squarings; s++) result = multiply(result, result);

  // Each squaring squares whatever the series left behind, so at a high Λ·t the
  // rows drift off 1 by orders of magnitude more than `tol` — in either
  // direction, and a row summing above 1 means individual probabilities can
  // read above 1. exp(Q·t) is exactly stochastic for a generator matrix, so
  // that invariant is not an approximation to be hoped for: restore it, and the
  // drift is corrected proportionally across the row.
  for (const row of result) {
    let sum = 0;
    for (const p of row) sum += p;
    if (sum > 0 && Number.isFinite(sum)) {
      for (let j = 0; j < n; j++) row[j] /= sum;
    }
  }
  return result;
}
