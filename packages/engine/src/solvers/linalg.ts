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
 * Matrix exponential of a CTMC generator: exp(Q·t), computed by uniformization
 * (Jensen's method). Q must have non-positive diagonals and zero row sums.
 *
 * Returns the transition probability matrix P(t). Accurate for small/moderate
 * Λt; for very large Λt (Poisson left tail underflows) accuracy degrades — the
 * caller should warn. `tol` controls the Poisson tail truncation.
 */
export function matExp(Q: Matrix, t: number, tol = 1e-12): Matrix {
  const n = Q.length;
  if (n === 0) return [];
  if (t === 0) return identity(n);

  // Uniformization rate: the largest total exit rate.
  let lambda = 0;
  for (let i = 0; i < n; i++) lambda = Math.max(lambda, -Q[i][i]);
  if (lambda <= 0) return identity(n); // no transitions

  // Uniformized stochastic matrix P = I + Q/lambda.
  const P = identity(n);
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) P[i][j] += Q[i][j] / lambda;

  const lt = lambda * t;
  const result: Matrix = Array.from({ length: n }, () => new Array(n).fill(0));
  let Pk = identity(n); // P^0
  let weight = Math.exp(-lt); // Poisson(lt) pmf at k=0
  let cumulative = 0;
  const maxTerms = Math.max(1000, Math.ceil(lt * 4) + 50);

  for (let k = 0; k <= maxTerms; k++) {
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) result[i][j] += weight * Pk[i][j];
    cumulative += weight;
    if (k >= lt && 1 - cumulative < tol) break;
    Pk = multiply(Pk, P);
    weight *= lt / (k + 1);
  }
  return result;
}
