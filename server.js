const express = require('express');
const path = require('path');
const fs = require('fs');
const { requireAuth } = require('./middleware/auth');
const santoCrmDb = require('./db/santocrm');

const app = express();
const port = process.env.PORT || 3000;

if (!process.env.DATABASE_URL) {
  console.error('ERROR: DATABASE_URL environment variable is required');
  process.exit(1);
}

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(require('cookie-parser')());

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function requireSantoCrmSession(req, res, next) {
  try {
    const token = req.cookies?.santocrm_session;
    const user = token ? await santoCrmDb.getUserBySessionToken(token) : null;
    if (!user) return res.redirect('/join');
    req.santocrmUser = user;
    next();
  } catch (err) {
    console.error('SantoCRM session check error:', err);
    res.redirect('/join');
  }
}

// Health check endpoint (required for Render)
// Does NOT query database to allow Neon auto-suspend
app.get('/health', (req, res) => {
  res.json({ status: 'healthy' });
});


// Auth routes (login/logout pages — no auth required)
app.use('/', require('./routes/auth'));

// Budget tracker — internal only
app.use('/api/budget', require('./routes/budget'));

// CRM — internal only
app.use('/api/crm', require('./routes/crm'));

// SantoCRM — beta signup + auth API
app.use('/api/santocrm', require('./routes/santocrm'));

// WhatsApp CRM Bot — webhook + seller onboarding + admin API
app.use('/api/whatsapp', require('./routes/whatsapp'));

// Invoices + quotes — CRUD + public shareable view
app.use('/api/invoices', require('./routes/invoices'));

// Contact / booking form endpoint
app.post('/api/contact', async (req, res) => {
  const { name, email, phone, service, city, message } = req.body;

  if (!name || !email || !message) {
    return res.status(400).json({ error: 'Name, email, and message are required.' });
  }

  const POLSIA_API_KEY = process.env.POLSIA_API_KEY;
  const STUDIO_EMAIL = 'santosonidostudio@gmail.com';
  const safeName = escapeHtml(name);
  const safeEmail = escapeHtml(email);
  const safePhone = escapeHtml(phone || '-');
  const safeService = escapeHtml(service || 'your project');
  const safeCity = escapeHtml(city || '-');
  const safeMessage = escapeHtml(message);

  const emailBody = [
    `New booking inquiry from santosoniodostudio.com`,
    ``,
    `Name: ${name}`,
    `Email: ${email}`,
    `Phone: ${phone || '—'}`,
    `Service: ${service || '—'}`,
    `City: ${city || '—'}`,
    ``,
    `Message:`,
    message,
  ].join('\n');

  const emailHtml = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; background: #111; color: #e0e0e0; padding: 24px; border-radius: 8px;">
      <h2 style="color: #d4a847; margin-bottom: 16px;">New Booking Inquiry — Santo Sonido OS</h2>
      <table style="width:100%; border-collapse: collapse;">
        <tr><td style="padding: 6px 0; color: #888;">Name</td><td style="padding: 6px 0; color: #f5f5f5;">${safeName}</td></tr>
        <tr><td style="padding: 6px 0; color: #888;">Email</td><td style="padding: 6px 0; color: #f5f5f5;">${safeEmail}</td></tr>
        <tr><td style="padding: 6px 0; color: #888;">Phone</td><td style="padding: 6px 0; color: #f5f5f5;">${safePhone}</td></tr>
        <tr><td style="padding: 6px 0; color: #888;">Service</td><td style="padding: 6px 0; color: #f5f5f5;">${safeService}</td></tr>
        <tr><td style="padding: 6px 0; color: #888;">City</td><td style="padding: 6px 0; color: #f5f5f5;">${safeCity}</td></tr>
      </table>
      <div style="margin-top: 16px; border-top: 1px solid #333; padding-top: 16px;">
        <p style="color: #888; font-size: 12px; margin-bottom: 8px;">Message</p>
        <p style="white-space: pre-line; color: #f5f5f5;">${safeMessage}</p>
      </div>
    </div>`;

  const autoReplyBody = `Hi ${name},\n\nThanks for reaching out to Santo Sonido OS. We received your inquiry about "${service || 'your project'}" and will get back to you within 24 hours.\n\nIn the meantime, feel free to WhatsApp us directly:\nhttps://wa.me/573148824744\n\n— Santo Sonido OS`;

  const autoReplyHtml = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; background: #111; color: #e0e0e0; padding: 24px; border-radius: 8px;">
      <h2 style="color: #d4a847; margin-bottom: 12px;">Inquiry received. ✓</h2>
      <p style="margin-bottom: 16px;">Hi <strong>${safeName}</strong>, thanks for reaching out to Santo Sonido OS.</p>
      <p style="margin-bottom: 16px;">We received your inquiry about <strong>${safeService}</strong> and will get back to you within 24 hours.</p>
      <p style="margin-bottom: 16px;">In the meantime, feel free to WhatsApp us directly:</p>
      <a href="https://wa.me/573148824744" style="display: inline-block; background: #25D366; color: #fff; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: bold;">WhatsApp Us</a>
      <p style="margin-top: 24px; color: #666; font-size: 12px;">— Santo Sonido OS</p>
    </div>`;

  try {
    // Register contact
    await fetch('https://polsia.com/api/proxy/email/contacts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${POLSIA_API_KEY}` },
      body: JSON.stringify({ email, name, source: 'contact_form' }),
    });

    // Notify studio
    await fetch('https://polsia.com/api/proxy/email/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${POLSIA_API_KEY}` },
      body: JSON.stringify({ to: STUDIO_EMAIL, subject: `Booking Inquiry — ${name} (${service || 'General'})`, body: emailBody, html: emailHtml }),
    });

    // Auto-reply to submitter
    await fetch('https://polsia.com/api/proxy/email/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${POLSIA_API_KEY}` },
      body: JSON.stringify({ to: email, subject: 'Santo Sonido OS — Inquiry received', body: autoReplyBody, html: autoReplyHtml }),
    });

    res.json({ success: true });
  } catch (err) {
    console.error('Contact form error:', err);
    res.status(500).json({ error: 'Failed to send inquiry. Please try again or WhatsApp us directly.' });
  }
});

// Serve static files from public folder
app.use(express.static(path.join(__dirname, 'public')));

// Serve HTML page with analytics slug injection
function serveHtmlPage(res, filename) {
  const slug = process.env.POLSIA_ANALYTICS_SLUG || '';
  const htmlPath = path.join(__dirname, 'public', filename);

  if (fs.existsSync(htmlPath)) {
    let html = fs.readFileSync(htmlPath, 'utf8');
    html = html.replace('__POLSIA_SLUG__', slug);
    res.type('html').send(html);
  } else {
    res.status(404).json({ message: 'Page not found' });
  }
}

app.get('/', requireAuth, (req, res) => res.redirect('/budget'));
app.get('/work', (req, res) => serveHtmlPage(res, 'work.html'));
app.get('/studio', (req, res) => serveHtmlPage(res, 'studio.html'));
app.get('/producer', (req, res) => serveHtmlPage(res, 'producer.html'));
app.get('/artists', (req, res) => serveHtmlPage(res, 'artists.html'));
app.get('/budget', requireAuth, (req, res) => serveHtmlPage(res, 'budget.html'));
app.get('/crm', requireAuth, (req, res) => serveHtmlPage(res, 'crm.html'));
app.get('/crm/join', (req, res) => {
  // Inject bot WhatsApp number for wa.me link on success screen
  const htmlPath = path.join(__dirname, 'public', 'crm-join.html');
  if (fs.existsSync(htmlPath)) {
    let html = fs.readFileSync(htmlPath, 'utf8');
    const botNumber = process.env.WHATSAPP_BOT_NUMBER || '';
    html = html.replace('__WA_BOT_NUMBER__', botNumber).replace('__POLSIA_SLUG__', process.env.POLSIA_ANALYTICS_SLUG || '');
    res.type('html').send(html);
  } else {
    res.status(404).json({ message: 'Page not found' });
  }
});

// SantoCRM pages
app.get('/santocrm', (req, res) => serveHtmlPage(res, 'santocrm.html'));
app.get('/join', (req, res) => serveHtmlPage(res, 'join.html'));
app.get('/dashboard', requireSantoCrmSession, (req, res) => serveHtmlPage(res, 'dashboard.html'));
app.get('/privacy', (req, res) => serveHtmlPage(res, 'privacy.html'));
app.get('/terms', (req, res) => serveHtmlPage(res, 'terms.html'));
app.get('/invoice/:token', (req, res) => serveHtmlPage(res, 'invoice.html')); // public
app.get('/invoices', requireAuth, (req, res) => serveHtmlPage(res, 'invoices.html'));

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
