/**
 * WhatsApp bot database queries.
 * Owns: whatsapp_sellers, whatsapp_bot_state tables + WhatsApp-sourced CRM/budget writes.
 * Does NOT own: HTTP routing (routes/whatsapp.js), WhatsApp API calls, message parsing.
 */
const pool = require('./index');

const SELLER_ROLES = ['Producer', 'Engineer', 'Videographer / Camera', 'Photographer', 'Content Creator / Influencer', 'Manager', 'Other'];

// --- Sellers ---

async function getSellers({ status, search } = {}) {
  const conditions = [];
  const params = [];
  if (status) { params.push(status); conditions.push(`status = $${params.length}`); }
  if (search) { params.push(`%${search}%`); conditions.push(`(name ILIKE $${params.length} OR phone ILIKE $${params.length})`); }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const { rows } = await pool.query(
    `SELECT id, name, phone, role, status, leads_added, last_active_at, added_by_admin, created_at
     FROM whatsapp_sellers ${where}
     ORDER BY created_at DESC LIMIT 200`,
    params
  );
  return rows;
}

async function getSellerByPhone(phone) {
  const normalized = normalizePhone(phone);
  const { rows } = await pool.query(
    `SELECT * FROM whatsapp_sellers WHERE phone = $1`,
    [normalized]
  );
  return rows[0] || null;
}

async function createSeller({ name, phone, role, added_by_admin = false }) {
  const normalized = normalizePhone(phone);
  const code = generateCode();
  const expires = new Date(Date.now() + 10 * 60 * 1000); // 10 min
  const { rows } = await pool.query(
    `INSERT INTO whatsapp_sellers (name, phone, role, status, verification_code, code_expires_at, added_by_admin)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (phone) DO UPDATE SET
       name = EXCLUDED.name, role = EXCLUDED.role,
       verification_code = EXCLUDED.verification_code,
       code_expires_at = EXCLUDED.code_expires_at,
       status = CASE WHEN whatsapp_sellers.status = 'revoked' THEN 'pending' ELSE whatsapp_sellers.status END,
       updated_at = NOW()
     RETURNING *`,
    [name, normalized, role || 'Other', added_by_admin ? 'verified' : 'pending', code, expires, added_by_admin]
  );
  return { seller: rows[0], code };
}

async function verifySeller(phone, code) {
  const normalized = normalizePhone(phone);
  const { rows } = await pool.query(
    `UPDATE whatsapp_sellers
     SET status = 'verified', verification_code = NULL, code_expires_at = NULL, updated_at = NOW()
     WHERE phone = $1 AND verification_code = $2 AND code_expires_at > NOW() AND status = 'pending'
     RETURNING *`,
    [normalized, code]
  );
  return rows[0] || null;
}

async function revokeSeller(id) {
  const { rows } = await pool.query(
    `UPDATE whatsapp_sellers SET status = 'revoked', updated_at = NOW() WHERE id = $1 RETURNING *`,
    [id]
  );
  return rows[0] || null;
}

async function touchSellerActivity(phone) {
  const normalized = normalizePhone(phone);
  await pool.query(
    `UPDATE whatsapp_sellers SET last_active_at = NOW(), updated_at = NOW() WHERE phone = $1`,
    [normalized]
  );
}

async function incrementLeadsAdded(phone) {
  const normalized = normalizePhone(phone);
  await pool.query(
    `UPDATE whatsapp_sellers SET leads_added = leads_added + 1, last_active_at = NOW(), updated_at = NOW() WHERE phone = $1`,
    [normalized]
  );
}

// --- Bot State (multi-step conversation tracking) ---

async function getBotState(phone) {
  const normalized = normalizePhone(phone);
  const { rows } = await pool.query(
    `SELECT * FROM whatsapp_bot_state WHERE phone = $1`,
    [normalized]
  );
  return rows[0] || null;
}

async function setBotState(phone, state, payload = null) {
  const normalized = normalizePhone(phone);
  const { rows } = await pool.query(
    `INSERT INTO whatsapp_bot_state (phone, state, payload, updated_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (phone) DO UPDATE SET state = EXCLUDED.state, payload = EXCLUDED.payload, updated_at = NOW()
     RETURNING *`,
    [normalized, state, payload ? JSON.stringify(payload) : null]
  );
  return rows[0];
}

async function clearBotState(phone) {
  const normalized = normalizePhone(phone);
  await pool.query(
    `DELETE FROM whatsapp_bot_state WHERE phone = $1`,
    [normalized]
  );
}

// --- CRM Integration ---

async function findClientByPhone(phone) {
  const normalized = normalizePhone(phone);
  const { rows } = await pool.query(
    `SELECT * FROM crm_clients WHERE phone = $1 LIMIT 1`,
    [normalized]
  );
  return rows[0] || null;
}

async function upsertCrmClient({ name, phone, notes, source = 'WhatsApp', added_by_phone, added_by_role }) {
  const normalized = phone ? normalizePhone(phone) : null;
  const existing = normalized ? await findClientByPhone(normalized) : null;

  if (existing) {
    // Update notes — append new context
    const updatedNotes = existing.notes
      ? `${existing.notes}\n---\n${notes}`
      : notes;
    const { rows } = await pool.query(
      `UPDATE crm_clients SET notes = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
      [updatedNotes, existing.id]
    );
    return { client: rows[0], isDuplicate: true };
  }

  const { rows } = await pool.query(
    `INSERT INTO crm_clients (name, phone, source, notes, stage, added_by_phone, added_by_role)
     VALUES ($1, $2, $3, $4, 'contact', $5, $6)
     RETURNING *`,
    [name || (normalized || 'Unknown'), normalized, source, notes || null, added_by_phone || null, added_by_role || null]
  );
  return { client: rows[0], isDuplicate: false };
}

// --- Budget Integration ---

async function createWhatsAppBudgetEntry({ type, amount_cop, amount_usd, date, description, category, track, added_by_phone, receipt_image_url }) {
  const { rows } = await pool.query(
    `INSERT INTO budget_entries
       (track, type, mode, amount_cop, amount_usd, currency, date, description, payment_source, category, source, added_by_phone, receipt_image_url)
     VALUES ($1, $2, 'Actual', $3, $4, 'COP', $5, $6, 'Other', $7, 'whatsapp', $8, $9)
     RETURNING *`,
    [
      track || 'Studio',
      type,
      amount_cop,
      amount_usd || null,
      date || new Date().toISOString().split('T')[0],
      description,
      category || null,
      added_by_phone || null,
      receipt_image_url || null,
    ]
  );
  return rows[0];
}

// --- Helpers ---

function normalizePhone(phone) {
  // Strip all non-digit chars, ensure leading +
  if (!phone) return phone;
  const digits = phone.replace(/\D/g, '');
  return `+${digits}`;
}

function generateCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

module.exports = {
  SELLER_ROLES,
  getSellers,
  getSellerByPhone,
  createSeller,
  verifySeller,
  revokeSeller,
  touchSellerActivity,
  incrementLeadsAdded,
  getBotState,
  setBotState,
  clearBotState,
  findClientByPhone,
  upsertCrmClient,
  createWhatsAppBudgetEntry,
  normalizePhone,
};
