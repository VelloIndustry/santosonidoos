/**
 * CRM API routes.
 * Owns: /api/crm/* endpoints — client/deal/activity CRUD.
 * Does NOT own: DB queries (db/crm.js), authentication config, static serving.
 */
const express = require('express');
const router = express.Router();
const db = require('../db/crm');

// Internal-only guard
function requireSecret(req, res, next) {
  const secret = process.env.BUDGET_SECRET;
  if (!secret) return next();
  const provided = req.headers['x-budget-secret'] || req.query._secret;
  if (provided !== secret) return res.status(401).json({ error: 'Unauthorized' });
  next();
}

router.use(requireSecret);

// GET /api/crm/clients
router.get('/clients', async (req, res) => {
  try {
    const { search, stage, track } = req.query;
    const clients = await db.getClients({ search, stage, track });
    res.json(clients);
  } catch (err) {
    console.error('GET /api/crm/clients error:', err);
    res.status(500).json({ error: 'Failed to fetch clients' });
  }
});

// GET /api/crm/clients/:id
router.get('/clients/:id', async (req, res) => {
  try {
    const client = await db.getClientById(Number(req.params.id));
    if (!client) return res.status(404).json({ error: 'Client not found' });
    res.json(client);
  } catch (err) {
    console.error('GET /api/crm/clients/:id error:', err);
    res.status(500).json({ error: 'Failed to fetch client' });
  }
});

// POST /api/crm/clients
router.post('/clients', async (req, res) => {
  try {
    const { name, email, phone, city, source, notes, stage } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required' });
    const client = await db.createClient({ name, email, phone, city, source, notes, stage });
    res.status(201).json(client);
  } catch (err) {
    console.error('POST /api/crm/clients error:', err);
    res.status(500).json({ error: 'Failed to create client' });
  }
});

// PUT /api/crm/clients/:id
router.put('/clients/:id', async (req, res) => {
  try {
    const updated = await db.updateClient(Number(req.params.id), req.body);
    if (!updated) return res.status(404).json({ error: 'Client not found' });
    res.json(updated);
  } catch (err) {
    console.error('PUT /api/crm/clients/:id error:', err);
    res.status(500).json({ error: 'Failed to update client' });
  }
});

// DELETE /api/crm/clients/:id
router.delete('/clients/:id', async (req, res) => {
  try {
    const deleted = await db.deleteClient(Number(req.params.id));
    if (!deleted) return res.status(404).json({ error: 'Client not found' });
    res.json({ success: true, deleted });
  } catch (err) {
    console.error('DELETE /api/crm/clients/:id error:', err);
    res.status(500).json({ error: 'Failed to delete client' });
  }
});

// POST /api/crm/deals
router.post('/deals', async (req, res) => {
  try {
    const { client_id, name, track, stage, value_cop, value_usd, notes } = req.body;
    if (!client_id || !name) return res.status(400).json({ error: 'client_id and name are required' });
    const deal = await db.createDeal({ client_id, name, track, stage, value_cop, value_usd, notes });
    res.status(201).json(deal);
  } catch (err) {
    console.error('POST /api/crm/deals error:', err);
    res.status(500).json({ error: 'Failed to create deal' });
  }
});

// PUT /api/crm/deals/:id
router.put('/deals/:id', async (req, res) => {
  try {
    const updated = await db.updateDeal(Number(req.params.id), req.body);
    if (!updated) return res.status(404).json({ error: 'Deal not found' });
    res.json(updated);
  } catch (err) {
    console.error('PUT /api/crm/deals/:id error:', err);
    res.status(500).json({ error: 'Failed to update deal' });
  }
});

// DELETE /api/crm/deals/:id
router.delete('/deals/:id', async (req, res) => {
  try {
    const deleted = await db.deleteDeal(Number(req.params.id));
    if (!deleted) return res.status(404).json({ error: 'Deal not found' });
    res.json({ success: true, deleted });
  } catch (err) {
    console.error('DELETE /api/crm/deals/:id error:', err);
    res.status(500).json({ error: 'Failed to delete deal' });
  }
});

// GET /api/crm/clients/:id/activity
router.get('/clients/:id/activity', async (req, res) => {
  try {
    const activity = await db.getActivity(Number(req.params.id));
    res.json(activity);
  } catch (err) {
    console.error('GET /api/crm/clients/:id/activity error:', err);
    res.status(500).json({ error: 'Failed to fetch activity' });
  }
});

// POST /api/crm/activity
router.post('/activity', async (req, res) => {
  try {
    const { client_id, deal_id, type, content } = req.body;
    if (!client_id || !type || !content) return res.status(400).json({ error: 'client_id, type, and content are required' });
    const activity = await db.createActivity({ client_id, deal_id, type, content });
    res.status(201).json(activity);
  } catch (err) {
    console.error('POST /api/crm/activity error:', err);
    res.status(500).json({ error: 'Failed to create activity' });
  }
});

// DELETE /api/crm/activity/:id
router.delete('/activity/:id', async (req, res) => {
  try {
    const deleted = await db.deleteActivity(Number(req.params.id));
    if (!deleted) return res.status(404).json({ error: 'Activity not found' });
    res.json({ success: true, deleted });
  } catch (err) {
    console.error('DELETE /api/crm/activity/:id error:', err);
    res.status(500).json({ error: 'Failed to delete activity' });
  }
});

module.exports = router;