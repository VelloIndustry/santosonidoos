/**
 * Invoice + quote routes.
 * Owns: /api/invoices/* — CRUD, status updates, public shareable view.
 * Does NOT own: DB queries (db/invoices.js), WhatsApp sending (routes/whatsapp.js).
 */
const express = require('express');
const router = express.Router();
const db = require('../db/invoices');

function requireSecret(req, res, next) {
  const secret = process.env.BUDGET_SECRET;
  if (!secret) return next();
  const provided = req.headers['x-budget-secret'] || req.query._secret;
  if (provided !== secret) return res.status(401).json({ error: 'Unauthorized' });
  next();
}

// GET /api/invoices — list (protected)
router.get('/', requireSecret, async (req, res) => {
  try {
    const { status, client_id, type } = req.query;
    const invoices = await db.getInvoices({ status, client_id: client_id ? Number(client_id) : undefined, type });
    res.json(invoices);
  } catch (err) {
    console.error('GET /api/invoices error:', err);
    res.status(500).json({ error: 'Failed to fetch invoices' });
  }
});

// POST /api/invoices — create (protected)
router.post('/', requireSecret, async (req, res) => {
  try {
    const { type, client_id, deal_id, client_name, client_phone, client_email, track, amount_cop, amount_usd, description, items, due_date, added_by_phone, notes } = req.body;
    if (!client_name || !amount_cop || !description) {
      return res.status(400).json({ error: 'Required: client_name, amount_cop, description' });
    }
    const invoice = await db.createInvoice({ type, client_id, deal_id, client_name, client_phone, client_email, track, amount_cop, amount_usd, description, items, due_date, added_by_phone, notes });
    res.status(201).json(invoice);
  } catch (err) {
    console.error('POST /api/invoices error:', err);
    res.status(500).json({ error: 'Failed to create invoice' });
  }
});

// PUT /api/invoices/:id — update fields (protected)
router.put('/:id', requireSecret, async (req, res) => {
  try {
    const updated = await db.updateInvoice(Number(req.params.id), req.body);
    if (!updated) return res.status(404).json({ error: 'Invoice not found' });
    res.json(updated);
  } catch (err) {
    console.error('PUT /api/invoices/:id error:', err);
    res.status(500).json({ error: 'Failed to update invoice' });
  }
});

// PUT /api/invoices/:id/status — update status (protected)
router.put('/:id/status', requireSecret, async (req, res) => {
  try {
    const { status, notes } = req.body;
    const valid = ['draft', 'sent', 'paid', 'cancelled'];
    if (!valid.includes(status)) return res.status(400).json({ error: `status must be one of: ${valid.join(', ')}` });
    const updated = await db.updateInvoiceStatus(Number(req.params.id), status, { notes });
    if (!updated) return res.status(404).json({ error: 'Invoice not found' });
    res.json(updated);
  } catch (err) {
    console.error('PUT /api/invoices/:id/status error:', err);
    res.status(500).json({ error: 'Failed to update status' });
  }
});

// GET /api/invoices/view/:token — public shareable view (no auth)
router.get('/view/:token', async (req, res) => {
  try {
    const invoice = await db.getInvoiceByToken(req.params.token);
    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
    res.json(invoice);
  } catch (err) {
    console.error('GET /api/invoices/view/:token error:', err);
    res.status(500).json({ error: 'Failed to fetch invoice' });
  }
});

module.exports = router;
