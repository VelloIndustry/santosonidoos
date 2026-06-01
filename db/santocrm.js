/**
 * SantoCRM database queries.
 * Owns: invite code validation, user signup, OTP creation/verification, session management.
 * Does NOT own: HTTP handling, WhatsApp messaging API calls — those live in routes/santocrm.js.
 */
const pool = require('./index');
const crypto = require('crypto');

// ── Invite Codes ──

async function validateInviteCode(code) {
  const { rows } = await pool.query(
    `SELECT * FROM santocrm_invite_codes
     WHERE code = $1 AND active = TRUE AND uses < max_uses`,
    [code.trim().toUpperCase()]
  );
  return rows[0] || null;
}

async function incrementInviteUsage(code) {
  await pool.query(
    `UPDATE santocrm_invite_codes SET uses = uses + 1 WHERE code = $1`,
    [code.trim().toUpperCase()]
  );
}

// ── Users ──

async function getUserByWhatsapp(whatsapp) {
  const { rows } = await pool.query(
    `SELECT * FROM santocrm_users WHERE whatsapp = $1`,
    [normalizeWhatsapp(whatsapp)]
  );
  return rows[0] || null;
}

async function createUser({ name, whatsapp, role, invite_code }) {
  const { rows } = await pool.query(
    `INSERT INTO santocrm_users (name, whatsapp, role, invite_code)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (whatsapp) DO UPDATE
       SET name = EXCLUDED.name, role = EXCLUDED.role
     RETURNING *`,
    [name, normalizeWhatsapp(whatsapp), role, invite_code.trim().toUpperCase()]
  );
  return rows[0];
}

async function markUserVerified(whatsapp) {
  const token = crypto.randomBytes(48).toString('hex');
  const { rows } = await pool.query(
    `UPDATE santocrm_users
     SET verified = TRUE, session_token = $2
     WHERE whatsapp = $1
     RETURNING *`,
    [normalizeWhatsapp(whatsapp), token]
  );
  return rows[0] || null;
}

async function getUserBySessionToken(token) {
  const { rows } = await pool.query(
    `SELECT * FROM santocrm_users WHERE session_token = $1 AND verified = TRUE`,
    [token]
  );
  return rows[0] || null;
}

// ── OTP ──

async function createOtp(whatsapp) {
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  // expires in 10 minutes
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
  await pool.query(
    `INSERT INTO santocrm_otp (phone, otp, expires_at)
     VALUES ($1, $2, $3)`,
    [normalizeWhatsapp(whatsapp), otp, expiresAt]
  );
  return otp;
}

async function verifyOtp(whatsapp, otp) {
  const { rows } = await pool.query(
    `SELECT * FROM santocrm_otp
     WHERE phone = $1 AND otp = $2
       AND expires_at > NOW() AND used = FALSE
     ORDER BY created_at DESC
     LIMIT 1`,
    [normalizeWhatsapp(whatsapp), otp]
  );
  if (!rows[0]) return false;

  // mark used
  await pool.query(`UPDATE santocrm_otp SET used = TRUE WHERE id = $1`, [rows[0].id]);
  return true;
}

// Strip spaces/dashes; ensure leading + for international numbers
function normalizeWhatsapp(num) {
  let n = num.replace(/[\s\-()]/g, '');
  if (!n.startsWith('+')) n = '+' + n;
  return n;
}

module.exports = {
  validateInviteCode,
  incrementInviteUsage,
  getUserByWhatsapp,
  createUser,
  markUserVerified,
  getUserBySessionToken,
  createOtp,
  verifyOtp,
  normalizeWhatsapp,
};
