import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { app } from '../src/app.js';
import { issueToken, verifyPassword, verifyToken } from '../src/auth.js';
import { getMatrixStatistics, summarizeFactors } from '../src/statistics.js';

let server;
let baseURL;

before(async () => {
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  baseURL = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});

test('computes matrix statistics and detects a diagonal matrix', () => {
  assert.deepEqual(getMatrixStatistics([[1, 0], [0, 3]]), {
    rows: 2, columns: 2, minimum: 0, maximum: 3, sum: 4, average: 1, isDiagonal: true,
  });
});

test('uses compensated summation and rejects overflow or oversized matrices', () => {
  const stable = getMatrixStatistics([[1e16, 1, -1e16]]);
  assert.equal(stable.sum, 1);
  assert.throws(() => getMatrixStatistics([[1e308, 1e308]]), /fuera del rango/);
  assert.throws(() => getMatrixStatistics(Array.from({ length: 257 }, () => [1])), /256/);
});

test('summarizes both QR factors', () => {
  const result = summarizeFactors({ q: [[1, 0], [0, 1]], r: [[2, 3], [0, 4]] });
  assert.equal(result.combined.minimum, 0);
  assert.equal(result.combined.maximum, 4);
  assert.equal(result.combined.sum, 11);
  assert.equal(result.combined.average, 11 / 8);
  assert.deepEqual(result.diagonalMatrices, ['q']);
});

test('issues valid JWTs and rejects expired or tampered tokens', () => {
  const token = issueToken('demo', 'unit-test-secret', 1_800_000_000);
  assert.equal(verifyToken(token, 'unit-test-secret', 1_800_000_100)?.sub, 'demo');
  assert.equal(verifyToken(token, 'unit-test-secret', 1_800_003_601), null);
  assert.equal(verifyToken(`${token.slice(0, -1)}x`, 'unit-test-secret', 1_800_000_100), null);
});

test('verifies the demo password against its scrypt hash', () => {
  const hash = 'scrypt:c0a2a77c737a14931e9c2c9cae831645:aa61e28b35532cac98d7d88cf8c08db8fafda1242b35147efe5e4eecb4c60ec651130e07591d98f0650956afc38598d84ea6aedf68c7e36b874d5326d8e19bc1';
  assert.equal(verifyPassword('demo-password', hash), true);
  assert.equal(verifyPassword('wrong-password', hash), false);
  assert.equal(verifyPassword('x'.repeat(1025), hash), false);
});

test('HTTP endpoint returns statistics and rejects invalid matrices', async () => {
  const unauthorized = await fetch(`${baseURL}/api/statistics`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ q: [[1]], r: [[1]] }),
  });
  assert.equal(unauthorized.status, 401);

  const login = await fetch(`${baseURL}/api/auth/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'demo', password: 'demo-password' }),
  });
  assert.equal(login.status, 200);
  const loginBody = await login.json();
  const setCookie = login.headers.get('set-cookie') ?? '';
  assert.equal(loginBody.authenticated, true);
  assert.equal('token' in loginBody, false, 'JWT must not be exposed in the response body');
  assert.match(setCookie, /HttpOnly/i);
  assert.match(setCookie, /SameSite=Strict/i);

  const rejectedLogin = await fetch(`${baseURL}/api/auth/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'demo', password: 'incorrect' }),
  });
  assert.equal(rejectedLogin.status, 401);

  const logout = await fetch(`${baseURL}/api/auth/logout`, { method: 'POST' });
  assert.equal(logout.status, 200);
  assert.match(logout.headers.get('set-cookie') ?? '', /matrixlab_token=/);

  const secret = process.env.JWT_SECRET ?? 'local-dev-secret-change-me';
  const token = issueToken('demo', secret);

  const valid = await fetch(`${baseURL}/api/statistics`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ q: [[1, 0], [0, 1]], r: [[2, 0], [0, 3]] }),
  });
  assert.equal(valid.status, 200);
  const body = await valid.json();
  assert.equal(body.combined.sum, 7);
  assert.deepEqual(body.diagonalMatrices, ['q', 'r']);

  const invalid = await fetch(`${baseURL}/api/statistics`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ q: [[1], [2, 3]], r: [[1]] }),
  });
  assert.equal(invalid.status, 400);
});
