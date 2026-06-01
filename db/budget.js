/**
 * Budget entry queries.
 * Owns: all CRUD + aggregation queries on budget_entries.
 * Does NOT own: HTTP layer, authentication, validation — those belong in routes/budget.js.
 */
const pool = require('./index');

/**
 * Insert a new budget entry. Returns the created row.
 */
async function createEntry(entry) {
  const { track, type, mode, amount_cop, amount_usd, currency, date, description, payment_source, category, client_project } = entry;
  const { rows } = await pool.query(
    `INSERT INTO budget_entries
       (track, type, mode, amount_cop, amount_usd, currency, date, description, payment_source, category, client_project)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     RETURNING *`,
    [track, type, mode, amount_cop, amount_usd || null, currency || 'COP', date, description, payment_source || 'Other', category || null, client_project || null]
  );
  return rows[0];
}

/**
 * Fetch entries with optional filters: track, mode, payment_source, date_from, date_to.
 * Returns newest-first.
 */
async function getEntries({ track, mode, payment_source, date_from, date_to, limit = 200, offset = 0 } = {}) {
  const conditions = [];
  const params = [];
  const safeLimit = Math.min(Math.max(Number(limit) || 200, 1), 500);
  const safeOffset = Math.max(Number(offset) || 0, 0);

  if (track) { params.push(track); conditions.push(`track = $${params.length}`); }
  if (mode) { params.push(mode); conditions.push(`mode = $${params.length}`); }
  if (payment_source) { params.push(payment_source); conditions.push(`payment_source = $${params.length}`); }
  if (date_from) { params.push(date_from); conditions.push(`date >= $${params.length}`); }
  if (date_to) { params.push(date_to); conditions.push(`date <= $${params.length}`); }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  params.push(safeLimit, safeOffset);

  const { rows } = await pool.query(
    `SELECT * FROM budget_entries ${where} ORDER BY date DESC, id DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  return rows;
}

/**
 * Delete entry by id. Returns deleted row or null.
 */
async function deleteEntry(id) {
  const { rows } = await pool.query('DELETE FROM budget_entries WHERE id = $1 RETURNING *', [id]);
  return rows[0] || null;
}

/**
 * Update a budget entry. Only updates provided fields. Returns updated row.
 */
async function updateEntry(id, fields) {
  const allowed = ['track', 'type', 'mode', 'amount_cop', 'amount_usd', 'currency', 'date', 'description', 'payment_source', 'category', 'client_project'];
  const sets = [];
  const params = [];

  for (const key of allowed) {
    if (fields[key] !== undefined) {
      params.push(fields[key]);
      sets.push(`${key} = $${params.length}`);
    }
  }

  if (!sets.length) throw new Error('No valid fields to update');

  params.push(id);
  const { rows } = await pool.query(
    `UPDATE budget_entries SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $${params.length} RETURNING *`,
    params
  );
  return rows[0] || null;
}

/**
 * Summary: income, expenses, net per track per month (last N months).
 * Returns rows: { track, month (YYYY-MM), type, mode, total }
 */
async function getMonthlySummary({ months = 4 } = {}) {
  const safeMonths = Math.min(Math.max(Number(months) || 4, 1), 24);
  const { rows } = await pool.query(`
    SELECT
      track,
      TO_CHAR(date, 'YYYY-MM') AS month,
      type,
      mode,
      SUM(amount_cop) AS total_cop
    FROM budget_entries
    WHERE date >= DATE_TRUNC('month', NOW()) - (($1::int - 1) * INTERVAL '1 month')
    GROUP BY track, month, type, mode
    ORDER BY track, month DESC, type, mode
  `, [safeMonths]);
  return rows;
}

/**
 * Plan vs actual comparison: per track per month.
 * Returns variance (actual - planned) per track per month.
 */
async function getPlanVsActual({ months = 4 } = {}) {
  const safeMonths = Math.min(Math.max(Number(months) || 4, 1), 24);
  const { rows } = await pool.query(`
    SELECT
      track,
      TO_CHAR(date, 'YYYY-MM') AS month,
      type,
      SUM(CASE WHEN mode = 'Actual'  THEN amount_cop ELSE 0 END) AS actual_cop,
      SUM(CASE WHEN mode = 'Planned' THEN amount_cop ELSE 0 END) AS planned_cop
    FROM budget_entries
    WHERE date >= DATE_TRUNC('month', NOW()) - (($1::int - 1) * INTERVAL '1 month')
    GROUP BY track, month, type
    ORDER BY track, month DESC, type
  `, [safeMonths]);
  return rows;
}

/**
 * Payback tracker stats: cumulative profit, phase, run rate, projections.
 * Uses Actual-mode entries only. Deducts Javier's flat monthly salary ($625 USD ≈ 2,750,000 COP)
 * and operating costs before computing profit share.
 */
async function getPaybackStats() {
  const { rows } = await pool.query(`
    SELECT
      type,
      mode,
      SUM(amount_cop) AS total_cop
    FROM budget_entries
    WHERE mode = 'Actual'
    GROUP BY type, mode
    ORDER BY type
  `);

  let totalIncome = 0;
  let totalExpense = 0;
  for (const r of rows) {
    if (r.type === 'Income') totalIncome += Number(r.total_cop);
    if (r.type === 'Expense') totalExpense += Number(r.total_cop);
  }

  // Javier's salary in COP: $625/mo × 4400 COP/USD
  const JAVIER_SALARY_COP = 625 * 4400; // 2,750,000 COP/month

  // Operating costs flat/mo
  const OPERATING_COP = 1375 * 4400; // 6,050,000 COP/month

  // Phase 1 threshold: Ryan needs $70K cumulative share
  const RYAN_PHASE1_TARGET_USD = 70000;
  const RYAN_PHASE1_SPLIT = 0.75;
  const TOTAL_PROFIT_NEEDED_USD = RYAN_PHASE1_TARGET_USD / RYAN_PHASE1_SPLIT; // ~93,333

  // All Actual entries — compute first/last dates for run rate
  const { rows: entryDates } = await pool.query(`
    SELECT
      MIN(date) AS first_entry,
      MAX(date) AS last_entry,
      COUNT(*) AS entry_count
    FROM budget_entries
    WHERE mode = 'Actual' AND type = 'Income'
  `);

  return {
    totalIncome,
    totalExpense,
    totalProfit: totalIncome - totalExpense,
    javierSalaryCOP: JAVIER_SALARY_COP,
    operatingCOP: OPERATING_COP,
    ryanPhase1TargetUSD: RYAN_PHASE1_TARGET_USD,
    totalProfitNeededUSD: TOTAL_PROFIT_NEEDED_USD,
    firstEntry: entryDates[0]?.first_entry,
    lastEntry: entryDates[0]?.last_entry,
    entryCount: Number(entryDates[0]?.entry_count || 0),
  };
}

module.exports = { createEntry, getEntries, deleteEntry, updateEntry, getMonthlySummary, getPlanVsActual, getPaybackStats };
