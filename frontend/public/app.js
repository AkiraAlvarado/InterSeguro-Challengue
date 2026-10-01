// Las llamadas pasan por el servidor del frontend para mantener API y cookie en el mismo origen.
const nodeApiURL = '/api/node';
const goApiURL = '/api/go';
const example = [[12, -51, 4], [6, 167, -68], [-4, 24, -41]];
const elements = Object.fromEntries(['app-shell', 'matrix-input', 'matrix-error', 'matrix-shape', 'reset-button', 'analyze-button', 'logout-button', 'result-badge', 'empty-state', 'results', 'rotated-matrix', 'q-matrix', 'r-matrix', 'q-dims', 'r-dims', 'stats-cards', 'diagonal-status', 'login-dialog', 'login-form', 'login-error', 'username', 'password'].map((id) => [id, document.getElementById(id)]));
let authenticated = false;
let pendingMatrix = null;

// Limpia el JWT de la versión anterior; la sesión nueva vive únicamente en cookie HttpOnly.
try {
  sessionStorage.removeItem('matrixlab-token');
} catch {
  // Web Storage puede estar deshabilitado; no es necesario para autenticar.
}

function formatNumber(value) {
  if (Object.is(value, -0) || Math.abs(value) < 0.0000005) return '0';
  return Number(value.toPrecision(5)).toString();
}

function readMatrix() {
  try {
    const matrix = JSON.parse(elements['matrix-input'].value);
    if (!Array.isArray(matrix) || matrix.length === 0 || !Array.isArray(matrix[0]) || matrix[0].length === 0) throw new Error('Usa una matriz JSON con filas no vacías.');
    const columns = matrix[0].length;
    if (matrix.some((row) => !Array.isArray(row) || row.length !== columns || row.some((value) => typeof value !== 'number' || !Number.isFinite(value)))) throw new Error('La matriz debe ser rectangular y contener solo números finitos.');
    if (matrix.length < columns) throw new Error('Para esta factorización QR usa una matriz con filas ≥ columnas.');
    return matrix;
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error('Cada valor debe ser un número (ej. -3.5); revisa también comas y corchetes.');
    throw error;
  }
}

function matrixMarkup(matrix) {
  const width = matrix[0].length;
  const cells = matrix.flatMap((row) => row.map((value) => `<span class="matrix-cell">${formatNumber(value)}</span>`)).join('');
  return `<div class="matrix-bracket" style="--columns:${width}"><div class="matrix-cells">${cells}</div></div>`;
}

function showStats(statistics) {
  const combined = statistics.combined;
  const cards = [
    ['MÁXIMO', combined.maximum, '↗', 'stat-max'],
    ['MÍNIMO', combined.minimum, '↘', 'stat-min'],
    ['PROMEDIO', combined.average, 'μ', 'stat-average'],
    ['SUMA TOTAL', combined.sum, 'Σ', 'stat-sum'],
  ];
  elements['stats-cards'].innerHTML = cards.map(([label, value, icon, className]) => `<article class="stat-card panel ${className}"><span class="stat-icon">${icon}</span><span class="stat-label">${label}</span><strong>${formatNumber(value)}</strong><span class="stat-foot">${combined.valueCount} VALORES · Q + R</span></article>`).join('');
  const diagonalNames = statistics.diagonalMatrices;
  elements['diagonal-status'].innerHTML = `<span class="diagonal-mark">⌗</span><span><b>Matriz diagonal</b><small>${diagonalNames.length ? `${diagonalNames.map((name) => name.toUpperCase()).join(' y ')} ${diagonalNames.length === 1 ? 'es diagonal' : 'son diagonales'}` : 'Ninguna matriz es diagonal'}</small></span><span class="diagonal-pill ${diagonalNames.length ? 'is-yes' : ''}">${diagonalNames.length ? 'DETECTADA' : 'NO DETECTADA'}</span>`;
}

function showResults(data) {
  elements['rotated-matrix'].innerHTML = matrixMarkup(data.rotated);
  elements['q-matrix'].innerHTML = matrixMarkup(data.q);
  elements['r-matrix'].innerHTML = matrixMarkup(data.r);
  elements['q-dims'].textContent = `${data.q.length} × ${data.q[0].length}`;
  elements['r-dims'].textContent = `${data.r.length} × ${data.r[0].length}`;
  showStats(data.statistics);
  elements['empty-state'].classList.add('hidden');
  elements.results.classList.remove('hidden');
  elements['result-badge'].textContent = 'ANÁLISIS COMPLETADO';
  elements['result-badge'].classList.add('is-ready');
}

async function login() {
  // La API escribe el JWT en una cookie HttpOnly; JavaScript nunca recibe ni persiste el token.
  const response = await fetch(`${nodeApiURL}/api/auth/token`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: elements.username.value.trim(), password: elements.password.value }),
    credentials: 'include',
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error ?? 'No se pudo iniciar sesión.');
  setAuthenticated(true);
}

async function analyze(matrix) {
  if (!authenticated) {
    pendingMatrix = matrix;
    elements['login-error'].textContent = '';
    if (!elements['login-dialog'].open) elements['login-dialog'].showModal();
    return;
  }
  elements['matrix-error'].textContent = '';
  elements['analyze-button'].disabled = true;
  elements['analyze-button'].classList.add('is-loading');
  elements['analyze-button'].querySelector('span').textContent = 'Calculando QR + estadísticas…';
  elements['result-badge'].textContent = 'PROCESANDO';
  try {
    const response = await fetch(`${goApiURL}/api/qr`, {
      // El navegador envía la cookie automáticamente; no se lee el JWT desde el cliente.
      method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
      body: JSON.stringify({ matrix }),
    });
    const body = await response.json();
    if (response.status === 401) {
      setAuthenticated(false, 'Sesión vencida');
      return analyze(matrix);
    }
    if (!response.ok) throw new Error(body.details ?? body.error ?? 'No se pudo procesar la matriz.');
    showResults(body);
  } catch (error) {
    elements['matrix-error'].textContent = error.message.includes('fetch') ? 'No se pudo conectar con los servicios. Comprueba que Docker siga activo.' : error.message;
    elements['result-badge'].textContent = 'ERROR DE ANÁLISIS';
  } finally {
    elements['analyze-button'].disabled = false;
    elements['analyze-button'].classList.remove('is-loading');
    elements['analyze-button'].querySelector('span').textContent = 'Analizar matriz';
  }
}

function setAuthenticated(value) {
  authenticated = value;
  elements['app-shell'].classList.toggle('hidden', !value);
  elements['logout-button'].classList.toggle('hidden', !value);
  if (value && elements['login-dialog'].open) elements['login-dialog'].close();
  if (!value && !elements['login-dialog'].open) elements['login-dialog'].showModal();
}

async function restoreSession() {
  try {
    const response = await fetch(`${goApiURL}/api/session`, { credentials: 'same-origin' });
    if (response.ok) setAuthenticated(true);
    else if (!authenticated) setAuthenticated(false);
  } catch {
    if (!authenticated) setAuthenticated(false);
  }
}

async function logout() {
  try {
    await fetch(`${nodeApiURL}/api/auth/logout`, { method: 'POST', credentials: 'same-origin' });
  } finally {
    elements.results.classList.add('hidden');
    elements['empty-state'].classList.remove('hidden');
    elements['result-badge'].textContent = 'ESPERANDO MATRIZ';
    elements['result-badge'].classList.remove('is-ready');
    setAuthenticated(false);
  }
}

function updateMatrixShape() {
  try {
    const matrix = readMatrix();
    elements['matrix-shape'].textContent = `${matrix.length} × ${matrix[0].length}`;
    elements['matrix-error'].textContent = '';
    return matrix;
  } catch (error) {
    elements['matrix-shape'].textContent = 'JSON INVÁLIDO';
    elements['matrix-error'].textContent = error.message;
    return null;
  }
}

elements['matrix-input'].addEventListener('input', updateMatrixShape);
elements['reset-button'].addEventListener('click', () => {
  elements['matrix-input'].value = JSON.stringify(example);
  updateMatrixShape();
});
elements['analyze-button'].addEventListener('click', () => {
  const matrix = updateMatrixShape();
  if (matrix) void analyze(matrix);
});
elements['logout-button'].addEventListener('click', () => void logout());
elements['login-dialog'].addEventListener('cancel', (event) => {
  // No se permite cerrar el acceso con Escape antes de autenticarse.
  if (!authenticated) event.preventDefault();
});
elements['login-form'].addEventListener('submit', async (event) => {
  event.preventDefault();
  elements['login-error'].textContent = '';
  const submitButton = elements['login-form'].querySelector('button[type="submit"]');
  submitButton.disabled = true;
  try {
    await login();
    if (pendingMatrix) {
      const matrix = pendingMatrix;
      pendingMatrix = null;
      await analyze(matrix);
    }
  } catch (error) {
    elements['login-error'].textContent = error.message;
  } finally {
    submitButton.disabled = false;
  }
});

updateMatrixShape();
setAuthenticated(false);
void restoreSession();
