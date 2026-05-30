module.exports = {
  name: 'create_whatsapp_tables',
  up: async (client) => {
    await client.query(`
      CREATE TABLE IF NOT EXISTS whatsapp_sellers (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        phone VARCHAR(50) NOT NULL UNIQUE,
        role VARCHAR(100) DEFAULT 'Other',
        status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'verified', 'revoked')),
        verification_code VARCHAR(10),
        code_expires_at TIMESTAMPTZ,
        leads_added INTEGER DEFAULT 0,
        last_active_at TIMESTAMPTZ,
        added_by_admin BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS whatsapp_bot_state (
        id SERIAL PRIMARY KEY,
        phone VARCHAR(50) NOT NULL UNIQUE,
        state VARCHAR(100) NOT NULL DEFAULT 'idle',
        payload JSONB,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS whatsapp_sellers_status_idx ON whatsapp_sellers (status)`);
  },
};
