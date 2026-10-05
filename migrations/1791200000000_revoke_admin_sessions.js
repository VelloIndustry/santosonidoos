module.exports = {
  name: 'revoke_admin_sessions',
  up: async (client) => {
    await client.query(`
      CREATE TABLE IF NOT EXISTS revoked_admin_sessions (
        token_hash CHAR(64) PRIMARY KEY,
        expires_at TIMESTAMPTZ NOT NULL
      )
    `);
    await client.query('CREATE INDEX IF NOT EXISTS revoked_admin_sessions_expiry_idx ON revoked_admin_sessions (expires_at)');
  },
};
