const express = require('express');
const db = require('../services/firebase');

const router = express.Router();

router.post('/delete', async (req, res) => {
  const { userId } = req.body;
  if (!userId) return res.status(400).json({ error: "userId required" });
  await db.collection('users').doc(userId).delete();
  await db.collection('carts').doc(userId).delete();
  await db.collection('sessions').doc(userId).delete();
  res.json({ success: true });
});

router.get('/export/:userId', async (req, res) => {
  const userId = req.params.userId;
  const orders = await db.collection('orders').where('userId', '==', userId).get();
  const userOrders = [];
  orders.forEach(doc => userOrders.push(doc.data()));
  res.json({ userId, orders: userOrders });
});

module.exports = router;
