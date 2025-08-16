const express = require('express');
const db = require('../services/firebase');

const router = express.Router();

router.get('/bestsellers', async (req, res) => {
  try {
    const orders = await db.collection('orders').get();
    const counts = {};
    orders.forEach(doc => {
      (doc.data().items || []).forEach(i => {
        counts[i.itemId] = (counts[i.itemId] || 0) + i.qty;
      });
    });
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    const menuSnapshot = await db.collection('menu').get();
    const menuMap = {};
    menuSnapshot.forEach(doc => menuMap[doc.id] = doc.data());
    const bestsellers = sorted.map(([id, qty]) => ({ id, name: menuMap[id]?.name || id, price: menuMap[id]?.price || 0, sold: qty }));
    res.json({ bestsellers });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/orders-per-day', async (req, res) => {
  try {
    const orders = await db.collection('orders').get();
    const byDate = {};
    orders.forEach(doc => {
      const date = new Date(doc.data().createdAt).toISOString().slice(0, 10);
      byDate[date] = (byDate[date] || 0) + 1;
    });
    res.json({ ordersPerDay: byDate });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/retention', async (req, res) => {
  try {
    const orders = await db.collection('orders').get();
    const userOrderCounts = {};
    orders.forEach(doc => {
      const user = doc.data().userId;
      userOrderCounts[user] = (userOrderCounts[user] || 0) + 1;
    });
    const repeatCustomers = Object.values(userOrderCounts).filter(c => c > 1).length;
    res.json({ repeatCustomers, totalCustomers: Object.keys(userOrderCounts).length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
