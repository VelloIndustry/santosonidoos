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

  const token = crypto.randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
  sessions.set(token, { email: user.email, name: user.name, expires });
  return { token, expires, name: user.name };
}

function getSession(token) {
  if (!token) return null;
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

module.exports = { login, logout, getSession, requireAuth, requireAuthApi };
