/**
 * Budget API routes.
 * Owns: /api/budget/* endpoints — CRUD on entries, summary, plan-vs-actual, OCR scan.
 * Does NOT own: DB queries (db/budget.js), authentication config, static serving.
 */
const express = require('express');
const router = express.Router();
const db = require('../db/budget');
const Anthropic = require('@anthropic-ai/sdk');

// Accept either a valid session cookie (login) or the BUDGET_SECRET header (API access)
function requireSecret(req, res, next) {
  const { getSession } = require('../middleware/auth');
  if (getSession(req.cookies?.session)) return next();
  const secret = process.env.BUDGET_SECRET;
  if (!secret) return next();
  const provided = req.headers['x-budget-secret'] || req.query._secret;
  if (provided !== secret) return res.status(401).json({ error: 'Unauthorized' });
  next();
}

router.use(requireSecret);

// GET /api/budget/entries — list with optional filters
router.get('/entries', async (req, res) => {
  try {
    const { track, mode, payment_source, date_from, date_to, limit, offset } = req.query;
    const entries = await db.getEntries({ track, mode, payment_source, date_from, date_to, limit: limit ? Number(limit) : 200, offset: offset ? Number(offset) : 0 });
    res.json(entries);
  } catch (err) {
    console.error('GET /api/budget/entries error:', err);
    res.status(500).json({ error: 'Failed to fetch entries' });
  }
});

// POST /api/budget/entries — create entry
router.post('/entries', async (req, res) => {
  try {
    const { track, type, mode, amount_cop, amount_usd, currency, date, description, payment_source, category, client_project } = req.body;

    if (!track || !type || !mode || !amount_cop || !date || !description) {
      return res.status(400).json({ error: 'Required: track, type, mode, amount_cop, date, description' });
    }

    const VALID_TRACKS = ['Studio', 'Artist', 'Producer', 'Camera'];
    const VALID_TYPES = ['Income', 'Expense'];
    const VALID_MODES = ['Actual', 'Planned'];
    const VALID_SOURCES = ['Cash', 'Bancolombia', 'OneRPM', 'Other'];

    if (!VALID_TRACKS.includes(track)) return res.status(400).json({ error: `track must be one of: ${VALID_TRACKS.join(', ')}` });
    if (!VALID_TYPES.includes(type)) return res.status(400).json({ error: `type must be one of: ${VALID_TYPES.join(', ')}` });
    if (!VALID_MODES.includes(mode)) return res.status(400).json({ error: `mode must be one of: ${VALID_MODES.join(', ')}` });
    if (payment_source && !VALID_SOURCES.includes(payment_source)) return res.status(400).json({ error: `payment_source must be one of: ${VALID_SOURCES.join(', ')}` });

    const entry = await db.createEntry({ track, type, mode, amount_cop, amount_usd, currency, date, description, payment_source, category, client_project });
    res.status(201).json(entry);
  } catch (err) {
    console.error('POST /api/budget/entries error:', err);
    res.status(500).json({ error: 'Failed to create entry' });
  }
});

// PUT /api/budget/entries/:id — update entry
router.put('/entries/:id', async (req, res) => {
  try {
    const updated = await db.updateEntry(Number(req.params.id), req.body);
    if (!updated) return res.status(404).json({ error: 'Entry not found' });
    res.json(updated);
  } catch (err) {
    console.error('PUT /api/budget/entries/:id error:', err);
    res.status(500).json({ error: 'Failed to update entry' });
  }
});

// DELETE /api/budget/entries/:id — delete entry
router.delete('/entries/:id', async (req, res) => {
  try {
    const deleted = await db.deleteEntry(Number(req.params.id));
    if (!deleted) return res.status(404).json({ error: 'Entry not found' });
    res.json({ success: true, deleted });
  } catch (err) {
    console.error('DELETE /api/budget/entries/:id error:', err);
    res.status(500).json({ error: 'Failed to delete entry' });
  }
});

// GET /api/budget/summary — monthly P&L per track
router.get('/summary', async (req, res) => {
  try {
    const { months } = req.query;
    const rows = await db.getMonthlySummary({ months: months ? Number(months) : 4 });
    res.json(rows);
  } catch (err) {
    console.error('GET /api/budget/summary error:', err);
    res.status(500).json({ error: 'Failed to fetch summary' });
  }
});

// GET /api/budget/plan-vs-actual — plan vs actual comparison
router.get('/plan-vs-actual', async (req, res) => {
  try {
    const { months } = req.query;
    const rows = await db.getPlanVsActual({ months: months ? Number(months) : 4 });
    res.json(rows);
  } catch (err) {
    console.error('GET /api/budget/plan-vs-actual error:', err);
    res.status(500).json({ error: 'Failed to fetch plan vs actual' });
  }
});

// GET /api/budget/payback — payback tracker stats
router.get('/payback', async (req, res) => {
  try {
    const stats = await db.getPaybackStats();
    res.json(stats);
  } catch (err) {
    console.error('GET /api/budget/payback error:', err);
    res.status(500).json({ error: 'Failed to fetch payback stats' });
  }
});

// POST /api/budget/ocr — extract receipt data using Claude Vision
router.post('/ocr', async (req, res) => {
  try {
    const { image } = req.body;
    if (!image || !image.startsWith('data:image')) {
      return res.status(400).json({ error: 'Invalid image data' });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });
    }

    // Parse base64 data URL
    const matches = image.match(/^data:(image\/\w+);base64,(.+)$/);
    if (!matches) return res.status(400).json({ error: 'Invalid image format' });
    const mediaType = matches[1];
    const base64Data = matches[2];

    const client = new Anthropic({ apiKey });

    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: mediaType, data: base64Data },
          },
          {
            type: 'text',
            text: `Eres un lector de recibos colombiano. Analiza esta imagen y extrae los datos.

Devuelve SOLO JSON válido:
{
  "amount_cop": número entero (monto total en COP, 0 si no puedes leerlo),
  "date": "YYYY-MM-DD" (fecha del recibo, hoy si no aparece),
  "vendor": "Nombre del comercio" (máx 80 chars),
  "payment_source": "Bancolombia" | "Cash" | "Other",
  "confidence": "alta" | "media" | "baja"
}

Reglas: solo el total del recibo (no propinas ni vueltos). "$45.000" = 45000. "Cash" si no ves referencia bancaria clara.`,
          },
        ],
      }],
    });

    const raw = response.content[0]?.text?.trim() || '{}';
    const jsonStr = raw.replace(/^```json\n?/, '').replace(/\n?```$/, '').trim();
    const data = JSON.parse(jsonStr);

    res.json({
      amount_cop: data.amount_cop || null,
      date: data.date || null,
      vendor: data.vendor || null,
      payment_source: data.payment_source || 'Cash',
      confidence: data.confidence || 'media',
    });
  } catch (err) {
    console.error('POST /api/budget/ocr error:', err);
    res.status(500).json({ error: 'No se pudo procesar la imagen: ' + err.message });
  }
});

module.exports = router;
