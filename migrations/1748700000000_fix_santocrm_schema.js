module.exports = {
  name: 'fix_santocrm_schema',
  up: async (client) => {
    await client.query(`
      ALTER TABLE santocrm_invite_codes
        ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT TRUE
    `);

    await client.query(`
      ALTER TABLE santocrm_otp
        ADD COLUMN IF NOT EXISTS used BOOLEAN DEFAULT FALSE
    `);

    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS santocrm_users_whatsapp_unique_idx
      ON santocrm_users (whatsapp)
    `);

    await client.query(`
      UPDATE santocrm_invite_codes
      SET active = TRUE
      WHERE active IS NULL
    `);

    await client.query(`
      UPDATE santocrm_otp
      SET used = FALSE
      WHERE used IS NULL
    `);
  },
};
