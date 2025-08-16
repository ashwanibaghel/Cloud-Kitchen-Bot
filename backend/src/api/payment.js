const express = require('express');
const db = require('../services/firebase');

const router = express.Router();

router.post('/confirm', async (req, res) => {
  const { orderId } = req.body;
  res.json({ success: true, orderId });
});

router.post('/refund', async (req, res) => {
  const { orderId, amount } = req.body;
  res.json({ success: true, orderId, refunded: amount });
});

// Webhook endpoint for payment confirmation
router.post('/webhook', async (req, res) => {
  try {
    const { orderId, status } = req.body;
    if (!orderId || !status) {
      return res.status(400).json({ error: 'orderId and status required' });
    }
    
    if (status === 'paid') {
      await db.collection('orders').doc(orderId).update({
        status: 'confirmed',
        paidAt: Date.now()
      });
    }
    
    res.json({ success: true, orderId, status });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
