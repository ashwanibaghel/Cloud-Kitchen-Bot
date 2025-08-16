const express = require('express');
const router = express.Router();

router.post('/confirm', async (req, res) => {
  const { orderId } = req.body;
  res.json({ success: true, orderId });
});

router.post('/refund', async (req, res) => {
  const { orderId, amount } = req.body;
  res.json({ success: true, orderId, refunded: amount });
});

module.exports = router;
