import express from 'express';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { issueToken, requireToken, verifyPassword } from './auth.js';
import { summarizeFactors } from './statistics.js';

export const app = express();
const isProduction = process.env.NODE_ENV === 'production';
const developmentPasswordHash = 'scrypt:c0a2a77c737a14931e9c2c9cae831645:aa61e28b35532cac98d7d88cf8c08db8fafda1242b35147efe5e4eecb4c60ec651130e07591d98f0650956afc38598d84ea6aedf68c7e36b874d5326d8e19bc1';
const jwtSecret = process.env.JWT_SECRET || (isProduction ? '' : 'local-dev-secret-change-me');
const demoUsername = process.env.AUTH_USERNAME || (isProduction ? '' : 'demo');
const demoPasswordHash = process.env.AUTH_PASSWORD_HASH || (isProduction ? '' : developmentPasswordHash);
const frontendOrigin = process.env.FRONTEND_ORIGIN || (isProduction ? '' : 'http://localhost:5173');
const cookieSecure = process.env.COOKIE_SECURE === 'true';
const cookieOptions = { httpOnly: true, secure: cookieSecure, sameSite: 'strict', maxAge: 60 * 60 * 1000, path: '/' };

// En producción, fallar al arrancar si faltan credenciales/secretos o HTTPS seguro.
if (isProduction && (Buffer.byteLength(jwtSecret) < 32 || !demoUsername || demoUsername === 'demo'
  || !/^scrypt:[a-f\d]{32}:[a-f\d]{128}$/i.test(demoPasswordHash)
  || demoPasswordHash === developmentPasswordHash
  || !frontendOrigin.startsWith('https://') || !cookieSecure)) {
  throw new Error('Configuración insegura: define JWT_SECRET (32+ bytes), usuario/hash scrypt, FRONTEND_ORIGIN HTTPS y COOKIE_SECURE=true.');
}

// Cabeceras seguras; CORS solo permite el origen configurado y solicitudes con cookie.
app.use(helmet());
app.use((request, response, next) => {
  response.setHeader('Access-Control-Allow-Origin', frontendOrigin);
  response.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  response.setHeader('Access-Control-Allow-Credentials', 'true');
  if (request.method === 'OPTIONS') return response.sendStatus(204);
  return next();
});
app.use(express.json({ limit: '4mb' }));

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'demasiados intentos; espera antes de volver a iniciar sesión' },
});

app.get('/health', (_request, response) => {
  response.json({ status: 'ok', service: 'node-api' });
});

app.post('/api/auth/token', loginLimiter, (request, response) => {
  const { username, password } = request.body ?? {};
  const userMatches = typeof username === 'string' && username === demoUsername;
  const passwordMatches = verifyPassword(password, demoPasswordHash);
  if (!userMatches || !passwordMatches) {
    return response.status(401).json({ error: 'usuario o contraseña inválidos' });
  }
  // El JWT nunca se devuelve a JavaScript: el navegador solo puede enviarlo automáticamente en esta cookie.
  return response.cookie('matrixlab_token', issueToken(username, jwtSecret), cookieOptions)
    .json({ authenticated: true, expiresIn: 3600 });
});

app.post('/api/auth/logout', (_request, response) => {
  return response.clearCookie('matrixlab_token', { httpOnly: true, secure: cookieSecure, sameSite: 'strict', path: '/' })
    .json({ authenticated: false });
});

app.post('/api/statistics', requireToken(jwtSecret), (request, response, next) => {
  try {
    const result = summarizeFactors(request.body ?? {});
    response.json(result);
  } catch (error) {
    if (error instanceof TypeError) {
      return response.status(400).json({ error: error.message });
    }
    return next(error);
  }
});

app.use((error, _request, response, _next) => {
  if (error instanceof SyntaxError && 'body' in error) {
    return response.status(400).json({ error: 'cuerpo de solicitud JSON inválido' });
  }
  console.error(error);
  return response.status(500).json({ error: 'internal server error' });
});
