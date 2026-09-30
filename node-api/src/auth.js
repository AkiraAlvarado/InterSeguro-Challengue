import { createHmac, scryptSync, timingSafeEqual } from 'node:crypto';

const TOKEN_TTL_SECONDS = 60 * 60;

function encode(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

/** Genera un JWT HS256 de una hora, compartido por las APIs Go y Node. */
export function issueToken(subject, secret, nowSeconds = Math.floor(Date.now() / 1000)) {
  const header = encode({ alg: 'HS256', typ: 'JWT' });
  const payload = encode({ sub: subject, iat: nowSeconds, exp: nowSeconds + TOKEN_TTL_SECONDS });
  const input = `${header}.${payload}`;
  const signature = createHmac('sha256', secret).update(input).digest('base64url');
  return `${input}.${signature}`;
}

/** Verifica estructura, algoritmo, firma HMAC y vencimiento del JWT. */
export function verifyToken(token, secret, nowSeconds = Math.floor(Date.now() / 1000)) {
  if (typeof token !== 'string' || !secret) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  try {
    const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    if (header.alg !== 'HS256' || typeof payload.sub !== 'string' || !payload.sub
      || !Number.isInteger(payload.exp) || payload.exp <= nowSeconds) return null;

    const expected = createHmac('sha256', secret).update(`${parts[0]}.${parts[1]}`).digest();
    const actual = Buffer.from(parts[2], 'base64url');
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
    return payload;
  } catch {
    return null;
  }
}

/** Compara la contraseña con el formato `scrypt:sal:hash` usando tiempo constante. */
export function verifyPassword(password, encodedHash) {
  if (typeof password !== 'string' || Buffer.byteLength(password) > 1024 || typeof encodedHash !== 'string') return false;
  const [algorithm, salt, expectedHex, ...extra] = encodedHash.split(':');
  if (algorithm !== 'scrypt' || !salt || !/^[a-f\d]{128}$/i.test(expectedHex ?? '') || extra.length > 0) return false;

  const expected = Buffer.from(expectedHex, 'hex');
  const actual = scryptSync(password, salt, expected.length);
  return timingSafeEqual(actual, expected);
}

/** Protege rutas internas que reciben el JWT por cabecera Bearer. */
export function requireToken(secret) {
  return (request, response, next) => {
    const authorization = request.get('authorization') ?? '';
    const match = /^Bearer\s+(.+)$/i.exec(authorization);
    const claims = match ? verifyToken(match[1], secret) : null;
    if (!claims) return response.status(401).json({ error: 'se requiere un JWT Bearer válido' });
    request.auth = claims;
    return next();
  };
}
