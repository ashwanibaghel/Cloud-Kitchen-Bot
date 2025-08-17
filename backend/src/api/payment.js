const express = require('express');
const router = express.Router();
const { db } = require('../services/firebase');
const { getUserLoyalty, addLoyaltyPoints } = require('../utils/helpers');

let wa;
try {
  wa = require('../services/whatsapp');
} catch (_) {
  wa = null;
}

// POST /api/payment/create-intent
// body: { orderId, method: 'UPI'|'Razorpay'|'COD' }
router.post('/create-intent', async (req, res) => {
  try {
    const { orderId, method } = req.body || {};
    if (!orderId) return res.status(400).json({ error: 'orderId is required' });

    const doc = await db.collection('orders').doc(orderId).get();
    if (!doc.exists) return res.status(404).json({ error: 'Order not found' });
    const order = doc.data();

    let intent = { method, intentId: 'intent_' + Math.random().toString(36).slice(2, 10), status: 'pending' };
    if (method === 'UPI') {
      const amount = order?.totals?.finalTotal || order?.total || 0;
      intent.upiLink = `upi://pay?pa=merchant@upi&pn=CloudKitchen&am=${amount}&tn=Order%20${orderId}`;
    } else if (method === 'Razorpay') {
      intent.razorpayOrderId = 'razor_' + Math.random().toString(36).slice(2, 12);
    } else if (method === 'COD') {
      await db.collection('orders').doc(orderId).set({ payment: { ...(order.payment || {}), method: 'COD', status: 'pending' }, status: 'cod_pending', updatedAt: new Date().toISOString() }, { merge: true });
    }

    res.status(201).json(intent);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create payment intent.' });
  }
});

// POST /api/payment/webhook
// body: { orderId, status: 'paid'|'failed' }
router.post('/webhook', async (req, res) => {
  try {
    const { orderId, status } = req.body || {};
    if (!orderId) return res.status(400).json({ error: 'orderId is required' });

    const ref = db.collection('orders').doc(orderId);
    const doc = await ref.get();
    if (!doc.exists) return res.status(404).json({ error: 'Order not found' });
    const order = doc.data();

    if (String(status).toLowerCase() === 'paid') {
      const now = new Date().toISOString();
      await ref.set(
        {
          status: 'confirmed',
          paidAt: now,
          payment: { ...(order.payment || {}), status: 'paid' },
          updatedAt: now,
          statusHistory: [ ...(order.statusHistory || []), { status: 'confirmed', at: now } ]
        },
        { merge: true }
      );

      // Loyalty: +1 point per 10 currency on finalTotal
      const finalTotal = Number(order?.totals?.finalTotal || order?.total || 0);
      if (order.userId) {
        const { ref: userRef, points: current } = await getUserLoyalty(order.userId);
        const toAdd = Math.floor(finalTotal / 10);
        await addLoyaltyPoints(userRef, current, toAdd);
      }

      // Notify user (if WA configured)
      if (wa && order.userId) {
        const liveUrl = `🎥 Live kitchen:\nhttps://your-domain.com/live?order=${encodeURIComponent(orderId)}&u=${encodeURIComponent(order.userId)}`;
        wa.sendMessage(order.userId, `✅ Payment received! Your order is confirmed.`).catch(() => {});
        wa.sendMessage(order.userId, liveUrl).catch(() => {});
      }
    } else if (String(status).toLowerCase() === 'failed') {
      await ref.set({ payment: { ...(order.payment || {}), status: 'failed' }, updatedAt: new Date().toISOString() }, { merge: true });
      if (wa && order.userId) {
        wa.sendMessage(order.userId, `❌ Payment failed. Reply "pay upi" or "pay razorpay" or "COD" to continue.`).catch(() => {});
      }
    }

    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Failed to process payment webhook.' });
  }
});

module.exports = router;