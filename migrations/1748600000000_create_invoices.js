module.exports = {
  name: 'create_invoices',
  up: async (client) => {
    await client.query(`
      CREATE TABLE IF NOT EXISTS invoices (
        id SERIAL PRIMARY KEY,
        invoice_number VARCHAR(20) NOT NULL UNIQUE,
        type VARCHAR(10) NOT NULL DEFAULT 'invoice' CHECK (type IN ('quote', 'invoice')),
        status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'paid', 'cancelled')),
        client_id INTEGER REFERENCES crm_clients(id) ON DELETE SET NULL,
        deal_id INTEGER REFERENCES crm_deals(id) ON DELETE SET NULL,
        client_name VARCHAR(255) NOT NULL,
        client_phone VARCHAR(50),
        client_email VARCHAR(255),
        track VARCHAR(50) DEFAULT 'Studio',
        amount_cop NUMERIC(15,2) NOT NULL DEFAULT 0,
        amount_usd NUMERIC(10,2),
        description TEXT NOT NULL,
        items JSONB DEFAULT '[]',
        due_date DATE,
        sent_at TIMESTAMPTZ,
        paid_at TIMESTAMPTZ,
        public_token VARCHAR(64) NOT NULL UNIQUE,
        added_by_phone VARCHAR(50),
        notes TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS invoices_client_id_idx ON invoices (client_id);
      CREATE INDEX IF NOT EXISTS invoices_status_idx ON invoices (status);
      CREATE INDEX IF NOT EXISTS invoices_public_token_idx ON invoices (public_token);
    `);

    // Sequence for invoice numbers (SS-2026-001 format)
    await client.query(`
      CREATE SEQUENCE IF NOT EXISTS invoice_number_seq START 1
    `);
  },
};
