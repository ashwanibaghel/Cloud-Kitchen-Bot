// Webhook: wires Meta WhatsApp GET verify + POST events to services/whatsapp.handleIncoming
const express = require('express');
const router = express.Router();

let wa;
try {
  wa = require('../services/whatsapp');
} catch (e) {
  console.error('[webhook] Failed to load WhatsApp service:', e.message);
  wa = null;
}

// GET verify (Meta)
router.get('/', (req, res) => {
  const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || 'cloudkitchenverify';
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

// POST events
router.post('/', async (req, res) => {
  try {
    if (wa) await wa.handleIncoming(req.body);
  } catch (e) {
    console.error('[Webhook Error]', e.message);
  }
  // Always 200 quickly per WhatsApp requirement
  res.sendStatus(200);
});

module.exports = router;