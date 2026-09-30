import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const apiDirectory = fileURLToPath(new URL('../', import.meta.url));
const loadApplication = "import('./src/app.js')";

function loadWithProductionEnvironment(overrides = {}) {
  return spawnSync(process.execPath, ['--input-type=module', '-e', loadApplication], {
    cwd: apiDirectory,
    encoding: 'utf8',
    env: {
      ...process.env,
      NODE_ENV: 'production',
      JWT_SECRET: '',
      AUTH_USERNAME: '',
      AUTH_PASSWORD_HASH: '',
      FRONTEND_ORIGIN: '',
      COOKIE_SECURE: 'false',
      ...overrides,
    },
  });
}

test('production refuses missing credentials, secret, HTTPS origin, or secure cookie', () => {
  const result = loadWithProductionEnvironment();
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Configuración insegura/);
});

test('production starts when all required security settings are provided', () => {
  const result = loadWithProductionEnvironment({
    JWT_SECRET: 'a'.repeat(40),
    AUTH_USERNAME: 'review-user',
    AUTH_PASSWORD_HASH: `scrypt:${'a'.repeat(32)}:${'b'.repeat(128)}`,
    FRONTEND_ORIGIN: 'https://matrix.example',
    COOKIE_SECURE: 'true',
  });
  assert.equal(result.status, 0, result.stderr);
});
