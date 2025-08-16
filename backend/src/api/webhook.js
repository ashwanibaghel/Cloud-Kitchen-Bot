const express = require('express');
const router = express.Router();
const whatsappService = require('../services/whatsapp');

// WhatsApp webhook verification (for initial setup)
router.get('/', (req, res) => {
  const verify_token = process.env.WHATSAPP_VERIFY_TOKEN || 'cloudkitchenverify'; // .env
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  console.log('[Webhook Verification Request]', { mode, token: token ? '***' : undefined, challenge });

  if (mode && token && mode === 'subscribe' && token === verify_token) {
    console.log('✅ Webhook verified successfully!');
    res.status(200).send(challenge);
  } else {
    console.error('❌ Webhook verification failed!');
    res.sendStatus(403);
  }
});

// Main WhatsApp webhook endpoint (message receiver)
// Respond 200 immediately to avoid retries, then process async
router.post('/', (req, res) => {
  console.log('[Incoming Webhook Data]', JSON.stringify(req.body, null, 2));
  res.sendStatus(200);
  setImmediate(async () => {
    try {
      await whatsappService.handleIncoming(req.body);
    } catch (e) {
      console.error('[Webhook Error]', e);
    }
  });
});

module.exports = router;