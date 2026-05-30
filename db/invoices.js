/**
 * Invoice + quote database queries.
 * Owns: invoices table.
 * Does NOT own: HTTP routing (routes/invoices.js), WhatsApp API calls, auth.
 */
const pool = require('./index');
const crypto = require('crypto');

async function getNextInvoiceNumber(type) {
  const prefix = type === 'quote' ? 'QT' : 'SS';
  const year = new Date().getFullYear();
  const { rows } = await pool.query(`SELECT nextval('invoice_number_seq') AS n`);
  const seq = String(rows[0].n).padStart(3, '0');
  return `${prefix}-${year}-${seq}`;
}

async function createInvoice({ type = 'invoice', client_id, deal_id, client_name, client_phone, client_email, track, amount_cop, amount_usd, description, items, due_date, added_by_phone, notes }) {
  const invoice_number = await getNextInvoiceNumber(type);
  const public_token = crypto.randomBytes(32).toString('hex');

  const { rows } = await pool.query(
    `INSERT INTO invoices
       (invoice_number, type, status, client_id, deal_id, client_name, client_phone, client_email, track, amount_cop, amount_usd, description, items, due_date, public_token, added_by_phone, notes)
     VALUES ($1,$2,'draft',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
     RETURNING *`,
    [invoice_number, type, client_id || null, deal_id || null, client_name, client_phone || null, client_email || null, track || 'Studio', amount_cop, amount_usd || null, description, JSON.stringify(items || []), due_date || null, public_token, added_by_phone || null, notes || null]
  );
  return rows[0];
}

async function getInvoices({ status, client_id, type, limit = 100 } = {}) {
  const conditions = [];
  const params = [];
  if (status) { params.push(status); conditions.push(`i.status = $${params.length}`); }
  if (client_id) { params.push(client_id); conditions.push(`i.client_id = $${params.length}`); }
  if (type) { params.push(type); conditions.push(`i.type = $${params.length}`); }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  params.push(limit);
  const { rows } = await pool.query(
    `SELECT i.*, c.name AS crm_name FROM invoices i
     LEFT JOIN crm_clients c ON c.id = i.client_id
     ${where}
     ORDER BY i.created_at DESC LIMIT $${params.length}`,
    params
  );
  return rows;
}

async function getInvoiceByToken(token) {
  const { rows } = await pool.query(
    `SELECT * FROM invoices WHERE public_token = $1`,
    [token]
  );
  return rows[0] || null;
}

async function getInvoiceById(id) {
  const { rows } = await pool.query(`SELECT * FROM invoices WHERE id = $1`, [id]);
  return rows[0] || null;
}

async function updateInvoiceStatus(id, status, extra = {}) {
  const updates = ['status = $2', 'updated_at = NOW()'];
  const params = [id, status];
  if (status === 'sent') { updates.push(`sent_at = NOW()`); }
  if (status === 'paid') { updates.push(`paid_at = NOW()`); }
  if (extra.notes !== undefined) { params.push(extra.notes); updates.push(`notes = $${params.length}`); }
  const { rows } = await pool.query(
    `UPDATE invoices SET ${updates.join(', ')} WHERE id = $1 RETURNING *`,
    params
  );
  return rows[0] || null;
}

async function updateInvoice(id, fields) {
  const allowed = ['client_name', 'client_phone', 'client_email', 'track', 'amount_cop', 'amount_usd', 'description', 'items', 'due_date', 'notes'];
  const sets = ['updated_at = NOW()'];
  const params = [id];
  for (const key of allowed) {
    if (fields[key] !== undefined) {
      params.push(key === 'items' ? JSON.stringify(fields[key]) : fields[key]);
      sets.push(`${key} = $${params.length}`);
    }
  }
  const { rows } = await pool.query(
    `UPDATE invoices SET ${sets.join(', ')} WHERE id = $1 RETURNING *`,
    params
  );
  return rows[0] || null;
}

module.exports = { createInvoice, getInvoices, getInvoiceByToken, getInvoiceById, updateInvoiceStatus, updateInvoice };
