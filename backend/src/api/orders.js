const express = require('express');
const db = require('../services/firebase');
const { v4: uuidv4 } = require('uuid');

const router = express.Router();

router.get('/:userId', async (req, res) => {
  try {
    const userId = req.params.userId;
    const snapshot = await db.collection('orders').where('userId', '==', userId).orderBy('createdAt', 'desc').get();
    const orders = [];
    snapshot.forEach(doc => orders.push({ id: doc.id, ...doc.data() }));
    res.json({ orders });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/', async (req, res) => {
  try {
    const snapshot = await db.collection('orders').orderBy('createdAt', 'desc').get();
    const orders = [];
    snapshot.forEach(doc => orders.push({ id: doc.id, ...doc.data() }));
    res.json({ orders });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const { userId, items, total, status, scheduledFor } = req.body;
    if (!userId || !items || !total) return res.status(400).json({ error: "Missing fields" });
    const order = {
      userId,
      items,
      total,
      status: status || 'pending_payment',
      createdAt: Date.now(),
      scheduledFor: scheduledFor || null
    };
    await db.collection('orders').doc(uuidv4()).set(order);
    await db.collection('carts').doc(userId).set({ items: [] });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/:orderId', async (req, res) => {
  try {
    const orderId = req.params.orderId;
    await db.collection('orders').doc(orderId).update(req.body);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:orderId', async (req, res) => {
  try {
    const orderId = req.params.orderId;
    await db.collection('orders').doc(orderId).delete();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
