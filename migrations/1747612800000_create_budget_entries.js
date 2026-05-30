module.exports = {
  name: 'create_budget_entries',
  up: async (client) => {
    await client.query(`
      CREATE TABLE IF NOT EXISTS budget_entries (
        id SERIAL PRIMARY KEY,
        track VARCHAR(50) NOT NULL DEFAULT 'Studio',
        type VARCHAR(20) NOT NULL CHECK (type IN ('Income', 'Expense')),
        mode VARCHAR(20) NOT NULL DEFAULT 'Actual' CHECK (mode IN ('Actual', 'Planned')),
        amount_cop NUMERIC(15,2) NOT NULL DEFAULT 0,
        amount_usd NUMERIC(10,2),
        currency VARCHAR(10) DEFAULT 'COP',
        date DATE NOT NULL,
        description TEXT NOT NULL,
        payment_source VARCHAR(50) DEFAULT 'Other',
        category VARCHAR(100),
        client_project VARCHAR(255),
        source VARCHAR(50),
        added_by_phone VARCHAR(50),
        receipt_image_url TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS budget_entries_date_idx ON budget_entries (date DESC)`);
    await client.query(`CREATE INDEX IF NOT EXISTS budget_entries_track_idx ON budget_entries (track)`);
  },
};
