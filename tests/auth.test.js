const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
process.env.ADMIN_RYAN_EMAIL = 'smoke@example.invalid';
process.env.ADMIN_RYAN_PASSWORD = 'test-password';
process.env.SESSION_SECRET = 'test-only-secret';
const revoked = new Set();
let unavailable = false;
require.cache[require.resolve('../db/auth')] = { exports: {
  async isRevoked(token) { if (unavailable) throw new Error('database unavailable'); return revoked.has(token); },
  async revoke(token) { if (unavailable) throw new Error('database unavailable'); revoked.add(token); },
} };
const loadAuth = () => { delete require.cache[require.resolve('../middleware/auth')]; return require('../middleware/auth'); };
const auth = loadAuth();
const login = () => auth.login(process.env.ADMIN_RYAN_EMAIL, process.env.ADMIN_RYAN_PASSWORD);

test('logout invalidates a session across application instances without invalidating another login', async () => {
  const first = login(), second = login();
  assert.notEqual(first.token, second.token);
  assert.ok(await auth.getSession(first.token));
  await auth.logout(first.token);
  await auth.logout(first.token);
  assert.equal(await auth.getSession(first.token), null);
  const restarted = loadAuth();
  assert.equal(await restarted.getSession(first.token), null);
  assert.ok(await restarted.getSession(second.token));
});

test('legacy signed sessions can also be revoked', async () => {
  const payload = Buffer.from(JSON.stringify({email:process.env.ADMIN_RYAN_EMAIL,name:'Ryan',expires:new Date(Date.now()+60000).toISOString()})).toString('base64url');
  const token = payload+'.'+crypto.createHmac('sha256',process.env.SESSION_SECRET).update(payload).digest('base64url');
  assert.ok(await auth.getSession(token));
  await auth.logout(token);
  assert.equal(await loadAuth().getSession(token), null);
});

test('malformed and tampered sessions are rejected', async () => {
  const {token} = login();
  for (const value of [undefined, 'invalid', token+'.extra', 'x'+token]) assert.equal(await auth.getSession(value),null);
  assert.equal(auth.login(process.env.ADMIN_RYAN_EMAIL,'wrong'),null);
});

test('expired signed sessions are rejected', async () => {
  const payload = Buffer.from(JSON.stringify({email:'smoke@example.invalid',expires:'2000-01-01'})).toString('base64url');
  const signature = crypto.createHmac('sha256',process.env.SESSION_SECRET).update(payload).digest('base64url');
  assert.equal(await auth.getSession(payload+'.'+signature),null);
});

test('database failure denies access and reaches Express error handling', async () => {
  const {token} = login();
  unavailable = true;
  try {
    await assert.rejects(auth.getSession(token),/database unavailable/);
    await assert.rejects(auth.logout(token),/database unavailable/);
    let forwarded;
    await auth.requireAuth({cookies:{session:token}}, {}, error => {forwarded=error;});
    assert.match(forwarded.message,/database unavailable/);
  } finally { unavailable=false; }
});
