/**
 * SantoCRM API routes.
 * Owns: invite code validation, beta signup, WhatsApp OTP, session auth for SantoCRM.
 * Does NOT own: Santo Sonido studio CRM (/api/crm) — that's routes/crm.js.
 */
const express = require('express');
const router = express.Router();
const db = require('../db/santocrm');

// ── POST /api/santocrm/validate-invite ──
// Checks that an invite code exists, is active, and has uses remaining.
router.post('/validate-invite', async (req, res) => {
  const { code } = req.body || {};
  if (!code) return res.status(400).json({ error: 'Invite code is required.' });

  try {
    const invite = await db.validateInviteCode(code);
    if (!invite) {
      return res.status(400).json({
        valid: false,
        error: "This invite code isn't valid — request one from Santo Sonido OS."
      });
    }
    res.json({ valid: true });
  } catch (err) {
    console.error('validate-invite error:', err);
    res.status(500).json({ error: 'Server error. Please try again.' });
  }
});

// ── POST /api/santocrm/signup ──
// Creates (or updates) user record, generates OTP, sends it via WhatsApp.
router.post('/signup', async (req, res) => {
  const { name, whatsapp, role, invite_code } = req.body || {};

  if (!name || !whatsapp || !role || !invite_code) {
    return res.status(400).json({ error: 'All fields are required.' });
  }

  // Re-validate invite before creating user (prevents race on last slot)
  try {
    const invite = await db.validateInviteCode(invite_code);
    if (!invite) {
      return res.status(400).json({ error: "Invite code no longer valid." });
    }

    await db.createUser({ name, whatsapp, role, invite_code });
    await db.incrementInviteUsage(invite_code);

    const otp = await db.createOtp(whatsapp);

    // Send OTP via WhatsApp using Polsia email proxy as notification channel.
    // In production this would go through a WhatsApp Business API provider.
    // For now: log OTP to console for admin to share manually during beta testing.
    console.log(`[SantoCRM OTP] ${db.normalizeWhatsapp(whatsapp)} → ${otp}`);

    // Attempt to send via Polsia email proxy to studio admin for manual relay
    const POLSIA_API_KEY = process.env.POLSIA_API_KEY;
    if (POLSIA_API_KEY) {
      try {
        await fetch('https://polsia.com/api/proxy/email/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${POLSIA_API_KEY}` },
          body: JSON.stringify({
            to: 'santosonidostudio@gmail.com',
            subject: `SantoCRM OTP — ${db.normalizeWhatsapp(whatsapp)}`,
            body: `New SantoCRM signup\n\nName: ${name}\nWhatsApp: ${db.normalizeWhatsapp(whatsapp)}\nRole: ${role}\nInvite: ${invite_code}\n\nOTP: ${otp}\n\nForward this OTP to the user on WhatsApp.`,
            html: `<div style="font-family:Arial;background:#111;color:#e0e0e0;padding:24px;border-radius:8px;max-width:500px">
              <h2 style="color:#D4AF37">SantoCRM — New Signup</h2>
              <p><b>Name:</b> ${name}</p>
              <p><b>WhatsApp:</b> ${db.normalizeWhatsapp(whatsapp)}</p>
              <p><b>Role:</b> ${role}</p>
              <p><b>Invite code:</b> ${invite_code}</p>
              <hr style="border-color:#333;margin:16px 0">
              <p style="font-size:24px;font-weight:bold;color:#D4AF37;letter-spacing:.2em">OTP: ${otp}</p>
              <p style="color:#888;font-size:12px">Send this code to the user on WhatsApp. Expires in 10 minutes.</p>
            </div>`
          })
        });
      } catch (emailErr) {
        // Non-fatal — OTP still logged above
        console.error('OTP email relay error:', emailErr);
      }
    }

    res.json({ success: true });
  } catch (err) {
    console.error('signup error:', err);
    res.status(500).json({ error: 'Signup failed. Please try again.' });
  }
});

// ── POST /api/santocrm/verify-otp ──
router.post('/verify-otp', async (req, res) => {
  const { whatsapp, otp } = req.body || {};
  if (!whatsapp || !otp) return res.status(400).json({ error: 'WhatsApp and OTP required.' });

  try {
    const valid = await db.verifyOtp(whatsapp, otp);
    if (!valid) {
      return res.status(400).json({ error: 'Invalid or expired code. Please try again.' });
    }
    const user = await db.markUserVerified(whatsapp);
    // Set session cookie
    res.cookie('santocrm_session', user.session_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
    });
    res.json({ success: true });
  } catch (err) {
    console.error('verify-otp error:', err);
    res.status(500).json({ error: 'Verification failed. Please try again.' });
  }
});

// ── POST /api/santocrm/resend-otp ──
router.post('/resend-otp', async (req, res) => {
  const { whatsapp } = req.body || {};
  if (!whatsapp) return res.status(400).json({ error: 'WhatsApp required.' });

  try {
    const otp = await db.createOtp(whatsapp);
    console.log(`[SantoCRM OTP resend] ${db.normalizeWhatsapp(whatsapp)} → ${otp}`);
    res.json({ success: true });
  } catch (err) {
    console.error('resend-otp error:', err);
    res.status(500).json({ error: 'Could not resend. Try again.' });
  }
});

module.exports = router;
