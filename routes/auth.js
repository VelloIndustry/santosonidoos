/**
 * Auth routes.
 * Owns: /login (GET + POST), /logout (POST)
 */
const express = require('express');
const router = express.Router();
const { login, logout } = require('../middleware/auth');

// GET /login — show login page
router.get('/login', (req, res) => {
  const next = req.query.next || '/budget';
  // If already logged in, redirect
  const { getSession } = require('../middleware/auth');
  const session = getSession(req.cookies?.session);
  if (session) return res.redirect(next);

  res.send(loginPage(next, null));
});

// POST /login — handle login
router.post('/login', (req, res) => {
  const { email, password, next } = req.body;
  const redirectTo = next || '/budget';

  if (!email || !password) {
    return res.send(loginPage(redirectTo, 'Please enter your email and password.'));
  }

  const result = login(email.trim(), password);
  if (!result) {
    return res.send(loginPage(redirectTo, 'Incorrect email or password.'));
  }

  res.cookie('session', result.token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    expires: result.expires,
  });

  res.redirect(redirectTo);
});

// POST /logout
router.post('/logout', (req, res) => {
  const token = req.cookies?.session;
  if (token) logout(token);
  res.clearCookie('session');
  res.redirect('/login');
});

function loginPage(next, error) {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Login — Santo Sonido OS</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: #0d0d0d; color: #e0e0e0; font-family: 'Helvetica Neue', Arial, sans-serif; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 20px; }
    .card { background: #1a1a1a; border: 1px solid #2a2a2a; border-radius: 12px; width: 100%; max-width: 380px; padding: 40px 36px; }
    .logo { color: #d4a847; font-size: 22px; font-weight: 700; letter-spacing: 1px; margin-bottom: 4px; text-align: center; }
    .subtitle { color: #555; font-size: 13px; text-align: center; margin-bottom: 36px; }
    .error-msg { background: #2a1a1a; border: 1px solid #c0392b44; color: #e57373; padding: 10px 14px; border-radius: 6px; font-size: 13px; margin-bottom: 16px; }
    label { display: block; color: #888; font-size: 12px; margin-bottom: 5px; }
    input { width: 100%; background: #111; border: 1px solid #2a2a2a; color: #e0e0e0; padding: 11px 14px; border-radius: 6px; font-size: 14px; margin-bottom: 16px; outline: none; transition: border-color 0.2s; }
    input:focus { border-color: #d4a847; }
    button { width: 100%; background: #d4a847; color: #000; border: none; padding: 12px; border-radius: 6px; font-size: 15px; font-weight: 700; cursor: pointer; margin-top: 4px; }
    button:hover { background: #e6bc5a; }
    .error { background: #2a1a1a; border: 1px solid #c0392b44; color: #e57373; padding: 10px 14px; border-radius: 6px; font-size: 13px; margin-bottom: 16px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">🎵 Santo Sonido OS</div>
    <div class="subtitle">Admin — internal access</div>
    ${error ? `<div class="error">${error}</div>` : ''}
    <form method="POST" action="/login">
      <input type="hidden" name="next" value="${next}" />
      <label>Email</label>
      <input type="email" name="email" placeholder="you@email.com" required autofocus />
      <label>Password</label>
      <input type="password" name="password" placeholder="••••••••" required />
      <button type="submit">Sign In</button>
    </form>
  </div>
</body>
</html>`;
}

module.exports = router;
