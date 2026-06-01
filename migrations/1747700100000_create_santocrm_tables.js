module.exports = {
  name: 'create_santocrm_tables',
  up: async (client) => {
    await client.query(`
      CREATE TABLE IF NOT EXISTS santocrm_invite_codes (
        id SERIAL PRIMARY KEY,
        code VARCHAR(50) NOT NULL UNIQUE,
        max_uses INTEGER DEFAULT 1,
        uses INTEGER DEFAULT 0,
        active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS santocrm_users (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        whatsapp VARCHAR(50),
        role VARCHAR(100),
        invite_code VARCHAR(50),
        verified BOOLEAN DEFAULT FALSE,
        session_token VARCHAR(255),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS santocrm_otp (
        id SERIAL PRIMARY KEY,
        phone VARCHAR(50) NOT NULL,
        otp VARCHAR(10) NOT NULL,
        used BOOLEAN DEFAULT FALSE,
        expires_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS santocrm_users_whatsapp_unique_idx ON santocrm_users (whatsapp)`);
    await client.query(`
      INSERT INTO santocrm_invite_codes (code, max_uses) VALUES
        ('SS-BETA24', 10),
        ('SS-RYAN01', 5),
        ('SS-JAVIER1', 5)
      ON CONFLICT (code) DO NOTHING
    `);
  },
};
