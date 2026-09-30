const DEFAULT_EPSILON = 1e-10;
const MAX_MATRIX_DIMENSION = 256;

/** Valida que una matriz numérica sea rectangular, finita y no esté vacía. */
export function validateMatrix(matrix, name = 'matrix') {
  if (!Array.isArray(matrix) || matrix.length === 0) {
    throw new TypeError(`${name} debe ser un arreglo no vacío de filas`);
  }
  if (!Array.isArray(matrix[0]) || matrix[0].length === 0) {
    throw new TypeError(`las filas de ${name} no pueden estar vacías`);
  }

  const columns = matrix[0].length;
  if (matrix.length > MAX_MATRIX_DIMENSION || columns > MAX_MATRIX_DIMENSION) {
    throw new TypeError(`${name} no puede superar ${MAX_MATRIX_DIMENSION} filas o columnas`);
  }
  matrix.forEach((row, rowIndex) => {
    if (!Array.isArray(row) || row.length !== columns) {
      throw new TypeError(`${name} debe ser rectangular (fila inválida ${rowIndex})`);
    }
    row.forEach((value, columnIndex) => {
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw new TypeError(`${name}[${rowIndex}][${columnIndex}] debe ser un número finito`);
      }
    });
  });
  return { rows: matrix.length, columns };
}

/** Calcula mínimo, máximo, suma y promedio en una pasada; usa tolerancia para diagonalidad. */
export function getMatrixStatistics(matrix, name = 'matrix', epsilon = DEFAULT_EPSILON) {
  const { rows, columns } = validateMatrix(matrix, name);
  let minimum = Infinity;
  let maximum = -Infinity;
  let sum = 0;
  let compensation = 0;
  let count = 0;
  let isDiagonal = rows === columns;

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const value = matrix[row][column];
      minimum = Math.min(minimum, value);
      maximum = Math.max(maximum, value);
      // Suma de Neumaier: reduce el error acumulado al sumar magnitudes distintas.
      const nextSum = sum + value;
      compensation += Math.abs(sum) >= Math.abs(value)
        ? (sum - nextSum) + value
        : (value - nextSum) + sum;
      sum = nextSum;
      count += 1;
      if (row !== column && Math.abs(value) > epsilon) isDiagonal = false;
    }
  }

  sum += compensation;
  if (!Number.isFinite(sum)) throw new TypeError(`${name} produce una suma fuera del rango numérico`);

  return {
    rows,
    columns,
    minimum,
    maximum,
    sum,
    average: sum / count,
    isDiagonal,
  };
}

/** Resume por separado Q y R, además de las estadísticas combinadas. */
export function summarizeFactors({ q, r }) {
  const matrices = {
    q: getMatrixStatistics(q, 'q'),
    r: getMatrixStatistics(r, 'r'),
  };
  const qCount = matrices.q.rows * matrices.q.columns;
  const rCount = matrices.r.rows * matrices.r.columns;
  const count = qCount + rCount;
  const sum = matrices.q.sum + matrices.r.sum;
  if (!Number.isFinite(sum)) throw new TypeError('la suma combinada excede el rango numérico');

  return {
    matrices,
    combined: {
      minimum: Math.min(matrices.q.minimum, matrices.r.minimum),
      maximum: Math.max(matrices.q.maximum, matrices.r.maximum),
      sum,
      average: sum / count,
      valueCount: count,
    },
    diagonalMatrices: Object.entries(matrices)
      .filter(([, statistics]) => statistics.isDiagonal)
      .map(([name]) => name),
  };
}
