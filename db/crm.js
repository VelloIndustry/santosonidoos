/**
 * CRM database queries.
 * Owns: crm_clients, crm_deals, crm_activity tables.
 * Does NOT own: API routes (routes/crm.js), auth config, static serving.
 */
const pool = require('./index');

const CLIENT_STAGES = ['contact', 'qualifying', 'proposal', 'negotiating', 'won', 'lost'];
const DEAL_STAGES   = ['contact', 'qualifying', 'proposal', 'negotiating', 'won', 'lost'];
const ACT_TYPES     = ['call', 'email', 'message', 'meeting', 'note'];

// --- Clients ---
async function getClients({ search, stage, track } = {}) {
  let query = `
    SELECT c.*,
      COALESCE(json_agg(
        json_build_object('id', d.id, 'name', d.name, 'track', d.track, 'stage', d.stage, 'value_cop', d.value_cop, 'value_usd', d.value_usd)
        ORDER BY d.created_at DESC
      ) FILTER (WHERE d.id IS NOT NULL), '[]') AS deals
    FROM crm_clients c
    LEFT JOIN crm_deals d ON d.client_id = c.id
  `;
  const params = [];
  const conditions = [];

  if (search) {
    params.push(`%${search}%`);
    conditions.push(`(c.name ILIKE $${params.length} OR c.email ILIKE $${params.length} OR c.phone ILIKE $${params.length})`);
  }
  if (stage) {
    params.push(stage);
    conditions.push(`c.stage = $${params.length}`);
  }

  if (conditions.length) query += ' WHERE ' + conditions.join(' AND ');
  query += ' GROUP BY c.id ORDER BY c.created_at DESC LIMIT 100';
  const { rows } = await pool.query(query, params);
  return rows;
}

async function getClientById(id) {
  const { rows } = await pool.query(`
    SELECT c.*,
      COALESCE(json_agg(
        json_build_object('id', d.id, 'name', d.name, 'track', d.track, 'stage', d.stage, 'value_cop', d.value_cop, 'value_usd', d.value_usd, 'notes', d.notes)
        ORDER BY d.created_at DESC
      ) FILTER (WHERE d.id IS NOT NULL), '[]') AS deals
    FROM crm_clients c
    LEFT JOIN crm_deals d ON d.client_id = c.id
    WHERE c.id = $1
    GROUP BY c.id
  `, [id]);
  return rows[0] || null;
}

async function createClient({ name, email, phone, city, source, notes, stage }) {
  const { rows } = await pool.query(`
    INSERT INTO crm_clients (name, email, phone, city, source, notes, stage)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING *
  `, [name, email || null, phone || null, city || null, source || null, notes || null, stage || 'contact']);
  return rows[0];
}

async function updateClient(id, fields) {
  const sets = [];
  const vals = [];
  const allowed = ['name', 'email', 'phone', 'city', 'source', 'notes', 'stage'];
  for (const f of allowed) {
    if (fields[f] !== undefined) {
      vals.push(fields[f]);
      sets.push(`${f} = $${vals.length}`);
    }
  }
  if (!sets.length) return null;
  vals.push(id);
  const { rows } = await pool.query(`
    UPDATE crm_clients SET ${sets.join(', ')}, updated_at = NOW()
    WHERE id = $${vals.length} RETURNING *
  `, vals);
  return rows[0] || null;
}

async function deleteClient(id) {
  const { rows } = await pool.query('DELETE FROM crm_clients WHERE id = $1 RETURNING id', [id]);
  return rows[0];
}

// --- Deals ---
async function createDeal({ client_id, name, track, stage, value_cop, value_usd, notes }) {
  const { rows } = await pool.query(`
    INSERT INTO crm_deals (client_id, name, track, stage, value_cop, value_usd, notes)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING *
  `, [client_id, name, track || null, stage || 'contact', value_cop || 0, value_usd || 0, notes || null]);
  return rows[0];
}

async function updateDeal(id, fields) {
  const sets = [];
  const vals = [];
  const allowed = ['name', 'track', 'stage', 'value_cop', 'value_usd', 'notes'];
  for (const f of allowed) {
    if (fields[f] !== undefined) {
      vals.push(fields[f]);
      sets.push(`${f} = $${vals.length}`);
    }
  }
  if (!sets.length) return null;
  vals.push(id);
  const { rows } = await pool.query(`
    UPDATE crm_deals SET ${sets.join(', ')}, updated_at = NOW()
    WHERE id = $${vals.length} RETURNING *
  `, vals);
  return rows[0] || null;
}

async function deleteDeal(id) {
  const { rows } = await pool.query('DELETE FROM crm_deals WHERE id = $1 RETURNING id', [id]);
  return rows[0];
}

// --- Activity ---
async function getActivity(client_id) {
  const { rows } = await pool.query(`
    SELECT a.*, d.name AS deal_name
    FROM crm_activity a
    LEFT JOIN crm_deals d ON d.id = a.deal_id
    WHERE a.client_id = $1
    ORDER BY a.created_at DESC
    LIMIT 50
  `, [client_id]);
  return rows;
}

async function createActivity({ client_id, deal_id, type, content }) {
  const { rows } = await pool.query(`
    INSERT INTO crm_activity (client_id, deal_id, type, content)
    VALUES ($1, $2, $3, $4)
    RETURNING *
  `, [client_id, deal_id || null, type, content]);
  return rows[0];
}

async function deleteActivity(id) {
  const { rows } = await pool.query('DELETE FROM crm_activity WHERE id = $1 RETURNING id', [id]);
  return rows[0];
}

module.exports = {
  getClients,
  getClientById,
  createClient,
  updateClient,
  deleteClient,
  createDeal,
  updateDeal,
  deleteDeal,
  getActivity,
  createActivity,
  deleteActivity,
  CLIENT_STAGES,
  DEAL_STAGES,
  ACT_TYPES,
};