/**
 * Auth middleware.
 * Session-based login using signed cookies.
 * Users are defined via env vars — no DB signup needed.
 *
 * Env vars:
 *   ADMIN_RYAN_EMAIL    e.g. ryan@example.com
 *   ADMIN_RYAN_PASSWORD e.g. mypassword
 *   ADMIN_JAVIER_EMAIL  e.g. javier@example.com
 *   ADMIN_JAVIER_PASSWORD
 *   SESSION_SECRET      random string for signing cookies
 */
const crypto = require('crypto');

// Active sessions: token -> { email, name, expires }
const sessions = new Map();
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function base64UrlEncode(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function base64UrlDecode(value) {
  return JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
}

function getSessionSecret() {
  return process.env.SESSION_SECRET || process.env.BUDGET_SECRET || null;
}

function signPayload(payload, secret) {
  return crypto.createHmac('sha256', secret).update(payload).digest('base64url');
}

function createSignedSession(user, expires) {
  const secret = getSessionSecret();
  if (!secret) return null;

  const payload = base64UrlEncode({
    email: user.email,
    name: user.name,
    expires: expires.toISOString(),
  });
  const signature = signPayload(payload, secret);
  return `${payload}.${signature}`;
}

function getSignedSession(token) {
  const secret = getSessionSecret();
  if (!secret || !token || !token.includes('.')) return null;

  const [payload, signature] = token.split('.');
  if (!payload || !signature) return null;

  const expected = signPayload(payload, secret);
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(actualBuffer, expectedBuffer)) {
    return null;
  }

  try {
    const session = base64UrlDecode(payload);
    const expires = new Date(session.expires);
    if (Number.isNaN(expires.getTime()) || expires < new Date()) return null;
    return { email: session.email, name: session.name, expires };
  } catch {
    return null;
  }
}

function getUsers() {
  const users = [];
  if (process.env.ADMIN_RYAN_EMAIL && process.env.ADMIN_RYAN_PASSWORD) {
    users.push({ email: process.env.ADMIN_RYAN_EMAIL.toLowerCase(), password: process.env.ADMIN_RYAN_PASSWORD, name: 'Ryan' });
  }
  if (process.env.ADMIN_JAVIER_EMAIL && process.env.ADMIN_JAVIER_PASSWORD) {
    users.push({ email: process.env.ADMIN_JAVIER_EMAIL.toLowerCase(), password: process.env.ADMIN_JAVIER_PASSWORD, name: 'Javier' });
  }
  return users;
}

function login(email, password) {
  const users = getUsers();
  const user = users.find(u => u.email === email.toLowerCase() && u.password === password);
  if (!user) return null;

  const expires = new Date(Date.now() + SESSION_TTL_MS);
  const token = createSignedSession(user, expires) || crypto.randomBytes(32).toString('hex');
  sessions.set(token, { email: user.email, name: user.name, expires });
  return { token, expires, name: user.name };
}

function getSession(token) {
  if (!token) return null;
  const signedSession = getSignedSession(token);
  if (signedSession) return signedSession;

  const session = sessions.get(token);
  if (!session) return null;
  if (session.expires < new Date()) { sessions.delete(token); return null; }
  return session;
}

function logout(token) {
  sessions.delete(token);
}

// Middleware: redirect to /login if not authenticated
function requireAuth(req, res, next) {
  const token = req.cookies?.session;
  const session = getSession(token);
  if (!session) {
    return res.redirect('/login?next=' + encodeURIComponent(req.originalUrl));
  }
  req.user = session;
  next();
}

// Middleware: redirect to /login if not authenticated (for API routes — return 401 instead)
function requireAuthApi(req, res, next) {
  const token = req.cookies?.session;
  const session = getSession(token);
  if (!session) return res.status(401).json({ error: 'Not authenticated' });
  req.user = session;
  next();
}

// Internal APIs may be called from the logged-in admin UI, or by trusted
// integrations that know BUDGET_SECRET. If neither credential is present,
// keep the endpoint closed.
function requireInternalAccess(req, res, next) {
  const session = getSession(req.cookies?.session);
  if (session) {
    req.user = session;
    return next();
  }

  const secret = process.env.BUDGET_SECRET;
  const provided = req.headers['x-budget-secret'] || req.query._secret;
  if (secret && provided === secret) return next();

  return res.status(401).json({ error: 'Unauthorized' });
}

module.exports = { login, logout, getSession, requireAuth, requireAuthApi, requireInternalAccess };
