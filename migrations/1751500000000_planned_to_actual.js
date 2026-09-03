exports.up = async (pool) => {
  await pool.query(`UPDATE budget_entries SET mode = 'Actual' WHERE mode = 'Planned'`);
};
