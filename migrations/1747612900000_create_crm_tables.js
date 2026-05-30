module.exports = {
  name: 'create_crm_tables',
  up: async (client) => {
    await client.query(`
      CREATE TABLE IF NOT EXISTS crm_clients (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255),
        phone VARCHAR(50),
        city VARCHAR(100),
        source VARCHAR(100),
        notes TEXT,
        stage VARCHAR(50) DEFAULT 'contact',
        added_by_phone VARCHAR(50),
        added_by_role VARCHAR(100),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS crm_deals (
        id SERIAL PRIMARY KEY,
        client_id INTEGER REFERENCES crm_clients(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        track VARCHAR(50) DEFAULT 'Studio',
        stage VARCHAR(50) DEFAULT 'contact',
        value_cop NUMERIC(15,2),
        value_usd NUMERIC(10,2),
        notes TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS crm_activity (
        id SERIAL PRIMARY KEY,
        client_id INTEGER REFERENCES crm_clients(id) ON DELETE CASCADE,
        deal_id INTEGER REFERENCES crm_deals(id) ON DELETE SET NULL,
        type VARCHAR(50) NOT NULL,
        content TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS crm_clients_stage_idx ON crm_clients (stage)`);
    await client.query(`CREATE INDEX IF NOT EXISTS crm_deals_client_idx ON crm_deals (client_id)`);
  },
};
