const crypto = require('crypto');
const pool = require('./index');

function tokenHash(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

async function isRevoked(token) {
  const result = await pool.query(
    'SELECT 1 FROM revoked_admin_sessions WHERE token_hash = $1 AND expires_at > NOW()',
    [tokenHash(token)]
  );
  return result.rowCount > 0;
}

async function revoke(token, expires) {
  await pool.query(
    `INSERT INTO revoked_admin_sessions (token_hash, expires_at) VALUES ($1, $2)
     ON CONFLICT (token_hash) DO NOTHING`,
    [tokenHash(token), expires]
  );
  // Only expired revocations can be removed; their signed tokens no longer work.
  await pool.query('DELETE FROM revoked_admin_sessions WHERE expires_at <= NOW()');
}

module.exports = { isRevoked, revoke };
