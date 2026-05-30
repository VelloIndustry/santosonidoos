/**
 * WhatsApp bot routes.
 * Owns: /api/whatsapp/* — webhook handler, seller onboarding API, admin seller CRUD.
 * Does NOT own: DB queries (db/whatsapp.js), WhatsApp Cloud API credentials, static pages.
 *
 * Bot commands (verified sellers only):
 *   /santo [name] [phone?] [context]  — add CRM lead
 *   /quote [name] [amount] [desc]     — create quote, log CRM deal in Proposal
 *   /pay [name_or_phone] [amount] [desc] — send payment request to client, await /confirm
 *   /confirm [name_or_ref]            — mark payment received, log income to budget
 *   /factura [name] [amount] [desc]   — alias for /quote (Spanish)
 *   /santo help / /help               — show help
 *   Send image                        — OCR receipt → log to budget
 */
const express = require('express');
const router = express.Router();
const db = require('../db/whatsapp');
const dbInvoices = require('../db/invoices');

// --- WhatsApp Cloud API helpers ---

async function sendWhatsAppMessage(to, body) {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const token = process.env.WHATSAPP_ACCESS_TOKEN;

  if (!phoneNumberId || !token) {
    console.warn('[WA] Missing WHATSAPP_PHONE_NUMBER_ID or WHATSAPP_ACCESS_TOKEN — message not sent');
    return;
  }

  const normalized = to.startsWith('+') ? to.slice(1) : to;

  try {
    const res = await fetch(
      `https://graph.facebook.com/v19.0/${phoneNumberId}/messages`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: normalized,
          type: 'text',
          text: { body },
        }),
      }
    );
    if (!res.ok) {
      const errText = await res.text();
      console.error('[WA] Send failed:', res.status, errText);
    }
  } catch (err) {
    console.error('[WA] Send error:', err.message);
  }
}

async function downloadMediaUrl(mediaId) {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!token) return null;
  try {
    const res = await fetch(`https://graph.facebook.com/v19.0/${mediaId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.url || null;
  } catch { return null; }
}

async function downloadMediaBytes(mediaUrl) {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!token || !mediaUrl) return null;
  try {
    const res = await fetch(mediaUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const buffer = await res.arrayBuffer();
    const contentType = res.headers.get('content-type') || 'image/jpeg';
    return { base64: Buffer.from(buffer).toString('base64'), contentType };
  } catch { return null; }
}

// --- Message parsing ---

function parseCommand(text) {
  const match = text.match(/^\/santo\s+(.+)/i);
  if (!match) return null;
  const rest = match[1].trim();
  const phoneMatch = rest.match(/(\+?\d[\d\s\-()]{6,14}\d)/);
  let phone = null;
  let remaining = rest;
  if (phoneMatch) {
    phone = phoneMatch[1].replace(/[\s\-()]/g, '');
    remaining = rest.replace(phoneMatch[0], '').trim();
  }
  const tokens = remaining.split(/\s+/);
  const name = tokens[0] || null;
  const context = tokens.slice(1).join(' ') || null;
  return { name, phone, context };
}

// Parse: /quote|/factura|/pay Name [+phone?] amount description
// Returns { name, phone, amount, description }
function parseMoneyCommand(text, command) {
  const pattern = new RegExp(`^\\/${command}\\s+(.+)`, 'i');
  const match = text.match(pattern);
  if (!match) return null;

  const rest = match[1].trim();

  // Extract phone if present
  const phoneMatch = rest.match(/(\+?\d[\d\s\-()]{6,14}\d)/);
  let phone = null;
  let noPhone = rest;
  if (phoneMatch) {
    phone = phoneMatch[1].replace(/[\s\-()]/g, '');
    noPhone = rest.replace(phoneMatch[0], '').trim();
  }

  // Extract amount (number with optional COP/USD prefix, dots/commas)
  const amountMatch = noPhone.match(/(\d[\d.,]*\d|\d+)/);
  if (!amountMatch) return null;
  const rawAmt = amountMatch[1].replace(/\./g, '').replace(/,/g, '');
  const amount = parseFloat(rawAmt);
  if (!amount || isNaN(amount)) return null;

  const withoutAmount = noPhone.replace(amountMatch[0], '').trim();
  const tokens = withoutAmount.split(/\s+/).filter(Boolean);
  const name = tokens[0] || 'Cliente';
  const description = tokens.slice(1).join(' ') || 'Servicio';

  return { name, phone, amount, description };
}

function parseAmountFromText(text) {
  const patterns = [
    /(?:USD|US\$)\s*([\d,.]+)/i,
    /\$([\d,.]+)/,
    /(?:COP|CLP|MXN)\s*([\d,.]+)/i,
    /([\d,.]+)\s*(?:USD|usd)/,
    /([\d,.]+)\s*(?:COP|cop)/,
    /([\d.]+,\d{3})/,
    /([\d]{3,})/,
  ];
  for (const pat of patterns) {
    const m = text.match(pat);
    if (m) {
      const raw = m[1].replace(/[.,]/g, '').trim();
      const num = parseFloat(raw);
      if (!isNaN(num) && num > 0) return num;
    }
  }
  return null;
}

// --- Webhook verification (GET) ---

router.get('/webhook', (req, res) => {
  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN;
  const { 'hub.mode': mode, 'hub.verify_token': token, 'hub.challenge': challenge } = req.query;
  if (mode === 'subscribe' && token === verifyToken) {
    console.log('[WA] Webhook verified');
    return res.status(200).send(challenge);
  }
  res.status(403).json({ error: 'Verification failed' });
});

// --- Webhook message handler (POST) ---

router.post('/webhook', async (req, res) => {
  res.status(200).json({ status: 'ok' });

  try {
    const body = req.body;
    if (body.object !== 'whatsapp_business_account') return;

    const entry = body.entry?.[0];
    const change = entry?.changes?.[0];
    const value = change?.value;
    const messages = value?.messages;

    if (!messages?.length) return;

    for (const msg of messages) {
      await handleMessage(msg, value?.metadata);
    }
  } catch (err) {
    console.error('[WA] Webhook processing error:', err);
  }
});

async function handleMessage(msg, metadata) {
  const senderPhone = `+${msg.from}`;
  const msgType = msg.type;

  const seller = await db.getSellerByPhone(senderPhone);
  if (!seller || seller.status !== 'verified') return;

  await db.touchSellerActivity(senderPhone);

  const botState = await db.getBotState(senderPhone);
  const currentState = botState?.state || 'idle';
  const payload = botState?.payload || {};

  // --- Multi-step flows ---
  if (currentState === 'awaiting_income_expense') {
    await handleIncomeExpenseReply(senderPhone, seller, msg, payload);
    return;
  }
  if (currentState === 'awaiting_category') {
    await handleCategoryReply(senderPhone, seller, msg, payload);
    return;
  }
  if (currentState === 'awaiting_payment_confirm') {
    if (msgType === 'text') {
      const text = (msg.text?.body || '').toLowerCase().trim();
      if (text.startsWith('/confirm') || text === 'confirmar' || text === 'si' || text === 'sí' || text === 'pagó') {
        await handleConfirmPayment(senderPhone, seller, payload);
        return;
      }
      if (text === 'cancelar' || text === 'cancel') {
        await db.clearBotState(senderPhone);
        await sendWhatsAppMessage(senderPhone, `❌ Cobro cancelado. El pago no fue registrado.`);
        return;
      }
      // Any other text while awaiting confirm — remind them
      await sendWhatsAppMessage(senderPhone, `⏳ Esperando confirmación de pago para *${payload.client_name}* ($${Number(payload.amount_cop).toLocaleString()}).\n\nEscribe *confirmar* cuando el cliente pague, o *cancelar* para descartar.`);
      return;
    }
  }

  // --- Image → receipt OCR ---
  if (msgType === 'image') {
    const imageId = msg.image?.id;
    const caption = msg.image?.caption || '';
    const mediaUrl = await downloadMediaUrl(imageId);
    const extracted = await ocrReceipt(mediaUrl, caption);

    if (extracted) {
      await db.setBotState(senderPhone, 'awaiting_income_expense', {
        amount_cop: extracted.amount,
        description: extracted.description,
        date: extracted.date,
        receipt_image_url: mediaUrl,
      });

      const confirmMsg = extracted.amount
        ? `📸 Listo!\n\nMonto: *$${Number(extracted.amount).toLocaleString()}*\nVendedor: ${extracted.description || '—'}\nFecha: ${extracted.date || 'hoy'}\n\n¿Es 💰 *Ingreso* o 💸 *Gasto*?\n\nResponde: ingreso / gasto`
        : `📸 Imagen recibida, pero no pude leer el monto claramente.\n\nEnvía: /monto [número] para establecerlo, o responde\n💰 *ingreso* / 💸 *gasto* para continuar.`;

      await sendWhatsAppMessage(senderPhone, confirmMsg);
    } else {
      await sendWhatsAppMessage(senderPhone, `📸 Recibí la imagen pero no pude procesarla. Intenta reenviar con un pie de foto como:\n"Recibo $150000 Alquiler estudio"`);
    }
    return;
  }

  if (msgType !== 'text') return;

  const text = (msg.text?.body || '').trim();

  // Help
  if (/^\/santo\s+help$/i.test(text) || /^\/help$/i.test(text)) {
    await sendWhatsAppMessage(senderPhone, helpMessage());
    return;
  }

  // /quote or /factura — create quote
  if (/^\/(quote|factura)\s+/i.test(text)) {
    const cmd = text.match(/^\/(\w+)/i)[1].toLowerCase();
    await handleQuoteCommand(senderPhone, seller, text, cmd);
    return;
  }

  // /pay — send payment request
  if (/^\/pay\s+/i.test(text) || /^\/cobrar\s+/i.test(text)) {
    const cmd = text.match(/^\/(\w+)/i)[1].toLowerCase();
    await handlePayCommand(senderPhone, seller, text, cmd);
    return;
  }

  // /confirm — confirm payment received
  if (/^\/confirm(\s+.*)?$/i.test(text) || /^\/confirmar(\s+.*)?$/i.test(text)) {
    // Check if there's a pending payment state
    if (currentState === 'awaiting_payment_confirm') {
      await handleConfirmPayment(senderPhone, seller, payload);
    } else {
      await sendWhatsAppMessage(senderPhone, `ℹ️ No hay ningún cobro pendiente de confirmar.\n\nUsa /pay para enviar un cobro primero.`);
    }
    return;
  }

  // /santo — add lead
  if (/^\/santo\s+/i.test(text)) {
    await handleSantoCommand(senderPhone, seller, text);
    return;
  }

  // Forwarded message
  if (msg.context?.forwarded) {
    const contextNotes = `Mensaje reenviado: "${text}"`;
    const { client, isDuplicate } = await db.upsertCrmClient({
      name: 'Lead WhatsApp',
      phone: null,
      notes: contextNotes,
      added_by_phone: senderPhone,
      added_by_role: seller.role,
    });
    await db.incrementLeadsAdded(senderPhone);
    const reply = isDuplicate
      ? `📋 Notas actualizadas en contacto existente.`
      : `✅ Nuevo lead del mensaje reenviado — usa /santo para agregar nombre y teléfono:\n/santo [nombre] [teléfono] [contexto]`;
    await sendWhatsAppMessage(senderPhone, reply);
    return;
  }

  // Fallback
  await sendWhatsAppMessage(senderPhone, `👋 Hola ${seller.name}!\n\n${helpMessage()}`);
}

// --- Command handlers ---

async function handleSantoCommand(phone, seller, text) {
  const parsed = parseCommand(text);
  if (!parsed || !parsed.name) {
    await sendWhatsAppMessage(phone, `❓ No pude entender eso. Intenta:\n/santo Juan +573001234567 quiere un beat`);
    return;
  }

  const notes = parsed.context || null;
  const { client, isDuplicate } = await db.upsertCrmClient({
    name: parsed.name,
    phone: parsed.phone,
    notes,
    added_by_phone: phone,
    added_by_role: seller.role,
  });

  await db.incrementLeadsAdded(phone);

  if (isDuplicate) {
    await sendWhatsAppMessage(phone, `📋 ${parsed.name} ya está en el CRM — notas actualizadas${notes ? ': "' + notes + '"' : ''}`);
  } else {
    const displayPhone = parsed.phone || '(sin teléfono)';
    await sendWhatsAppMessage(phone, `✅ ${parsed.name} (${displayPhone}) agregado — lead de ${seller.role}`);
  }
}

async function handleQuoteCommand(phone, seller, text, cmd) {
  const parsed = parseMoneyCommand(text, cmd);
  if (!parsed) {
    await sendWhatsAppMessage(phone, `❓ Formato: /quote [nombre] [monto] [descripción]\nEjemplo: /quote Juan 500000 Mix y master del sencillo`);
    return;
  }

  // Upsert client in CRM
  const { client, isDuplicate } = await db.upsertCrmClient({
    name: parsed.name,
    phone: parsed.phone || null,
    notes: `Cotización enviada: ${parsed.description} - $${parsed.amount.toLocaleString()} COP`,
    added_by_phone: phone,
    added_by_role: seller.role,
  });

  // Create invoice record
  const invoice = await dbInvoices.createInvoice({
    type: 'quote',
    client_id: client.id,
    client_name: parsed.name,
    client_phone: parsed.phone || client.phone,
    track: 'Studio',
    amount_cop: parsed.amount,
    description: parsed.description,
    added_by_phone: phone,
  });

  const baseUrl = process.env.BASE_URL || 'https://your-app.onrender.com';
  const viewUrl = `${baseUrl}/invoice/${invoice.public_token}`;

  const formattedAmt = Number(parsed.amount).toLocaleString('es-CO');

  // Quote message to forward to client
  const clientMsg = formatQuoteMessage(parsed.name, formattedAmt, parsed.description, invoice.invoice_number);

  await sendWhatsAppMessage(phone,
    `✅ Cotización *${invoice.invoice_number}* creada para *${parsed.name}*\n` +
    `💰 $${formattedAmt} COP — ${parsed.description}\n\n` +
    `🔗 Ver cotización: ${viewUrl}\n\n` +
    `📋 *Mensaje para el cliente:*\n${clientMsg}\n\n` +
    `Cuando confirme, usa:\n/pay ${parsed.name} ${parsed.amount} ${parsed.description}`
  );
}

async function handlePayCommand(phone, seller, text, cmd) {
  const parsed = parseMoneyCommand(text, cmd === 'cobrar' ? 'cobrar' : 'pay');
  if (!parsed) {
    await sendWhatsAppMessage(phone, `❓ Formato: /pay [nombre] [monto] [descripción]\nEjemplo: /pay Juan 500000 Sesión de grabación 3h`);
    return;
  }

  // Find or create client
  const { client } = await db.upsertCrmClient({
    name: parsed.name,
    phone: parsed.phone || null,
    notes: `Cobro enviado: ${parsed.description} - $${parsed.amount.toLocaleString()} COP`,
    added_by_phone: phone,
    added_by_role: seller.role,
  });

  const formattedAmt = Number(parsed.amount).toLocaleString('es-CO');
  const nequiNumber = process.env.NEQUI_NUMBER || process.env.WHATSAPP_BOT_NUMBER || '+573148824744';
  const bancolombiaAccount = process.env.BANCOLOMBIA_ACCOUNT || '';

  // Payment instructions for the client
  const paymentInstructions = buildPaymentMessage(parsed.name, formattedAmt, parsed.description, nequiNumber, bancolombiaAccount);

  // Send payment request to client if we have their phone
  const clientPhone = parsed.phone || client.phone;
  if (clientPhone) {
    await sendWhatsAppMessage(clientPhone, paymentInstructions);
    await sendWhatsAppMessage(phone,
      `📤 Cobro enviado a ${parsed.name} (${clientPhone})\n` +
      `💰 $${formattedAmt} COP — ${parsed.description}\n\n` +
      `Cuando el cliente pague, escribe:\n*confirmar*\n\no:\n/confirm ${parsed.name}`
    );
  } else {
    // No client phone — give Javier the message to share manually
    await sendWhatsAppMessage(phone,
      `📋 Mensaje de cobro para *${parsed.name}* (no tiene teléfono registrado):\n\n` +
      `${paymentInstructions}\n\n` +
      `Comparte este mensaje con el cliente. Cuando pague, escribe:\n*confirmar*`
    );
  }

  // Set state to await confirmation
  await db.setBotState(phone, 'awaiting_payment_confirm', {
    client_name: parsed.name,
    client_phone: clientPhone,
    client_id: client.id,
    amount_cop: parsed.amount,
    description: parsed.description,
  });
}

async function handleConfirmPayment(phone, seller, payload) {
  await db.clearBotState(phone);

  const formattedAmt = Number(payload.amount_cop).toLocaleString('es-CO');

  // Log income to budget
  const entry = await db.createWhatsAppBudgetEntry({
    type: 'Income',
    amount_cop: payload.amount_cop,
    date: new Date().toISOString().split('T')[0],
    description: `${payload.description} — ${payload.client_name}`,
    category: 'client payment',
    track: 'Studio',
    added_by_phone: phone,
  });

  // Update CRM client last activity
  if (payload.client_id) {
    const pool = require('../db/index');
    await pool.query(
      `UPDATE crm_clients SET stage = 'won', updated_at = NOW() WHERE id = $1 AND stage NOT IN ('won', 'lost')`,
      [payload.client_id]
    );
  }

  await sendWhatsAppMessage(phone,
    `✅ ¡Pago confirmado!\n\n` +
    `💰 $${formattedAmt} COP — ${payload.description}\n` +
    `Cliente: ${payload.client_name}\n\n` +
    `Ingreso registrado en /budget ✔️`
  );
}

// --- Receipt OCR flow (multi-step) ---

async function handleIncomeExpenseReply(phone, seller, msg, payload) {
  if (msg.type !== 'text') return;
  const text = (msg.text?.body || '').toLowerCase().trim();

  if (text.includes('ingreso') || text.includes('income') || text.includes('💰') || text === 'i') {
    payload.type = 'Income';
  } else if (text.includes('gasto') || text.includes('expense') || text.includes('💸') || text === 'g' || text === 'e') {
    payload.type = 'Expense';
  } else {
    await sendWhatsAppMessage(phone, `Responde *ingreso* o *gasto* para continuar.`);
    return;
  }

  await db.setBotState(phone, 'awaiting_category', payload);

  const cats = payload.type === 'Income'
    ? 'pago de cliente, regalías, licencia, otro'
    : 'alquiler estudio, equipos, plugins/samples, transporte, comida, marketing, otro';
  await sendWhatsAppMessage(phone, `📂 ¿Categoría? (${cats})\n\nO responde *skip* para usar la predeterminada.`);
}

async function handleCategoryReply(phone, seller, msg, payload) {
  if (msg.type !== 'text') return;
  const text = (msg.text?.body || '').trim();
  const category = text.toLowerCase() === 'skip' ? null : text;

  await db.clearBotState(phone);

  const entry = await db.createWhatsAppBudgetEntry({
    type: payload.type,
    amount_cop: payload.amount_cop || 0,
    date: payload.date || new Date().toISOString().split('T')[0],
    description: payload.description || 'Recibo WhatsApp',
    category,
    track: 'Studio',
    added_by_phone: phone,
    receipt_image_url: payload.receipt_image_url || null,
  });

  const emoji = payload.type === 'Income' ? '💰' : '💸';
  const amt = payload.amount_cop ? Number(payload.amount_cop).toLocaleString('es-CO') : '?';
  await sendWhatsAppMessage(
    phone,
    `✅ Registrado $${amt} ${payload.type === 'Income' ? 'ingreso' : 'gasto'} — ${payload.description || 'recibo'}, ${entry.date}\n${emoji} Visible en /budget.`
  );
}

// --- Claude OCR ---

async function ocrReceipt(mediaUrl, caption) {
  // Fast path: extract from caption
  if (caption) {
    const amount = parseAmountFromText(caption);
    if (amount) {
      return {
        amount,
        description: caption.replace(/[\d,.]+/, '').trim() || 'Recibo',
        date: new Date().toISOString().split('T')[0],
      };
    }
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!mediaUrl || !apiKey) return null;

  const imgData = await downloadMediaBytes(mediaUrl);
  if (!imgData) return null;

  try {
    const Anthropic = require('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey });

    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 150,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: imgData.contentType,
              data: imgData.base64,
            },
          },
          {
            type: 'text',
            text: 'Extrae de este recibo: monto total (solo número en pesos colombianos), nombre del vendedor/comercio, y fecha. Responde SOLO en JSON: {"amount": 150000, "description": "Nombre Comercio", "date": "2026-05-30"}. Si no puedes leerlo, responde {"error": "ilegible"}.',
          },
        ],
      }],
    });

    const content = response.content[0]?.text || '';
    const json = JSON.parse(content.match(/\{.*\}/s)?.[0] || '{}');
    if (json.error || !json.amount) return null;
    return { amount: json.amount, description: json.description, date: json.date };
  } catch (err) {
    console.error('[WA] OCR error:', err.message);
    return null;
  }
}

// --- Message formatters ---

function formatQuoteMessage(clientName, formattedAmt, description, invoiceNumber) {
  const studioName = process.env.STUDIO_NAME || 'Santo Sonido OS';
  const studioPhone = process.env.NEQUI_NUMBER || '+573148824744';
  return (
    `🎵 *Cotización ${invoiceNumber}*\n` +
    `📋 *${studioName}*\n\n` +
    `Hola ${clientName},\n\n` +
    `Te enviamos la cotización para:\n*${description}*\n\n` +
    `💰 *Total: $${formattedAmt} COP*\n\n` +
    `Para confirmar o hacer preguntas, escríbenos:\n${studioPhone}\n\n` +
    `Gracias por confiar en nosotros 🙌`
  );
}

function buildPaymentMessage(clientName, formattedAmt, description, nequiNumber, bancolombiaAccount) {
  const studioName = process.env.STUDIO_NAME || 'Santo Sonido OS';
  let msg = (
    `🎵 *${studioName}*\n\n` +
    `Hola ${clientName} 👋\n\n` +
    `Tu pago pendiente:\n*${description}*\n\n` +
    `💰 *$${formattedAmt} COP*\n\n` +
    `Puedes pagar por:\n`
  );
  if (nequiNumber) msg += `📱 *Nequi:* ${nequiNumber}\n`;
  if (bancolombiaAccount) msg += `🏦 *Bancolombia:* ${bancolombiaAccount}\n`;
  msg += `\nUna vez realizado el pago, avísanos con el comprobante. ¡Gracias! 🙏`;
  return msg;
}

function helpMessage() {
  return (
    `🤖 *SantoCRM Bot*\n\n` +
    `*Agregar lead:*\n/santo Juan +573001234567 quiere un beat\n\n` +
    `*Crear cotización:*\n/quote Juan 500000 Mix y master del sencillo\n` +
    `_(también: /factura)_\n\n` +
    `*Enviar cobro:*\n/pay Juan +573001234567 500000 Sesión 3h\n\n` +
    `*Confirmar pago recibido:*\nescribe *confirmar* o /confirm\n\n` +
    `*Registrar recibo:*\nEnvía foto del recibo — lo leo y lo registro en /budget\n\n` +
    `*Ayuda:*\n/santo help`
  );
}

// --- Seller onboarding API ---

router.post('/sellers/register', async (req, res) => {
  try {
    const { name, phone, role } = req.body;
    if (!name || !phone) return res.status(400).json({ error: 'name and phone are required' });

    const { seller, code } = await db.createSeller({ name, phone, role });
    const msg = `🔑 Tu código de verificación SantoCRM es: *${code}*\n\nIngrésalo en la página de registro para conectarte. Expira en 10 minutos.`;
    await sendWhatsAppMessage(db.normalizePhone(phone), msg);

    res.json({ success: true, message: 'Código de verificación enviado a tu WhatsApp.' });
  } catch (err) {
    console.error('POST /sellers/register error:', err);
    res.status(500).json({ error: 'Registration failed. Please try again.' });
  }
});

router.post('/sellers/verify', async (req, res) => {
  try {
    const { phone, code } = req.body;
    if (!phone || !code) return res.status(400).json({ error: 'phone and code are required' });

    const seller = await db.verifySeller(phone, code);
    if (!seller) return res.status(400).json({ error: 'Código inválido o expirado.' });

    const botNumber = process.env.WHATSAPP_PHONE_NUMBER_ID
      ? `¡Ya estás dentro! Guarda el número del bot como *Santo Sonido CRM* en tus contactos.`
      : `¡Verificado! El admin te compartirá el número del bot.`;

    res.json({ success: true, message: botNumber, seller: { name: seller.name, role: seller.role } });
  } catch (err) {
    console.error('POST /sellers/verify error:', err);
    res.status(500).json({ error: 'Verification failed.' });
  }
});

// --- Admin seller management (protected) ---

function requireSecret(req, res, next) {
  const { getSession } = require('../middleware/auth');
  if (getSession(req.cookies?.session)) return next();
  const secret = process.env.BUDGET_SECRET;
  if (!secret) return next();
  const provided = req.headers['x-budget-secret'] || req.query._secret;
  if (provided !== secret) return res.status(401).json({ error: 'Unauthorized' });
  next();
}

router.get('/sellers', requireSecret, async (req, res) => {
  try {
    const { status, search } = req.query;
    const sellers = await db.getSellers({ status, search });
    res.json(sellers);
  } catch (err) {
    console.error('GET /sellers error:', err);
    res.status(500).json({ error: 'Failed to fetch sellers' });
  }
});

router.post('/sellers', requireSecret, async (req, res) => {
  try {
    const { name, phone, role } = req.body;
    if (!name || !phone) return res.status(400).json({ error: 'name and phone are required' });
    const { seller } = await db.createSeller({ name, phone, role, added_by_admin: true });
    res.status(201).json(seller);
  } catch (err) {
    console.error('POST /sellers error:', err);
    res.status(500).json({ error: 'Failed to add seller' });
  }
});

router.delete('/sellers/:id', requireSecret, async (req, res) => {
  try {
    const seller = await db.revokeSeller(Number(req.params.id));
    if (!seller) return res.status(404).json({ error: 'Seller not found' });
    res.json({ success: true, seller });
  } catch (err) {
    console.error('DELETE /sellers/:id error:', err);
    res.status(500).json({ error: 'Failed to revoke seller' });
  }
});

router.get('/status', requireSecret, async (req, res) => {
  try {
    const sellers = await db.getSellers();
    const verified = sellers.filter(s => s.status === 'verified').length;
    const pending = sellers.filter(s => s.status === 'pending').length;
    const revoked = sellers.filter(s => s.status === 'revoked').length;
    const configured = !!(process.env.WHATSAPP_PHONE_NUMBER_ID && process.env.WHATSAPP_ACCESS_TOKEN);
    res.json({
      bot_configured: configured,
      sellers: { total: sellers.length, verified, pending, revoked },
      recent: sellers.slice(0, 5),
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to get status' });
  }
});

module.exports = router;
