const express = require('express');
const router = express.Router();
const { db } = require('../services/firebase');

const ORDERS = 'orders';
const FEEDBACK = 'feedback';

async function loadRecentOrders() {
  try {
    const snap = await db.collection(ORDERS).orderBy('createdAt', 'desc').limit(1000).get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch {
    const snap = await db.collection(ORDERS).limit(1000).get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  }
}

async function loadRecentFeedback() {
  try {
    const snap = await db.collection(FEEDBACK).orderBy('createdAt', 'desc').limit(2000).get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch {
    const snap = await db.collection(FEEDBACK).limit(2000).get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  }
}

// Bestsellers
router.get('/bestsellers', async (req, res) => {
  try {
    const orders = await loadRecentOrders();
    const counts = new Map();
    for (const o of orders) {
      const items = Array.isArray(o.items) ? o.items : [];
      for (const it of items) {
        const itemId = String(it.itemId || it.id || '');
        if (!itemId) continue;
        const qty = Number(it.qty || 1);
        const name = it.name ? String(it.name) : undefined;
        if (!counts.has(itemId)) counts.set(itemId, { itemId, name: name || '', sold: 0 });
        counts.get(itemId).sold += qty;
        if (name && !counts.get(itemId).name) counts.get(itemId).name = name;
      }
    }
    const arr = Array.from(counts.values()).sort((a,b) => b.sold - a.sold);
    res.json(arr);
  } catch {
    res.status(500).json({ error: 'Failed to compute bestsellers.' });
  }
});

// Orders per day
router.get('/orders-per-day', async (req, res) => {
  try {
    const orders = await loadRecentOrders();
    const map = {};
    for (const o of orders) {
      const d = o.createdAt ? String(o.createdAt).slice(0, 10) : '';
      if (!d) continue;
      map[d] = (map[d] || 0) + 1;
    }
    res.json(map);
  } catch {
    res.status(500).json({ error: 'Failed to compute orders per day.' });
  }
});

// Top rated items
router.get('/top-rated', async (req, res) => {
  try {
    const feedback = await loadRecentFeedback();
    const agg = new Map(); // itemId -> { sum, count, name? }
    for (const f of feedback) {
      const itemId = String(f.itemId || '');
      if (!itemId) continue;
      const r = Number(f.rating || 0);
      if (!agg.has(itemId)) agg.set(itemId, { sum: 0, count: 0, name: f.itemName || '' });
      agg.get(itemId).sum += r;
      agg.get(itemId).count += 1;
      if (f.itemName && !agg.get(itemId).name) agg.get(itemId).name = f.itemName;
    }
    const list = [];
    for (const [itemId, v] of agg.entries()) {
      list.push({ itemId, name: v.name, avgRating: v.count ? v.sum / v.count : 0, ratings: v.count });
    }
    list.sort((a, b) => b.avgRating - a.avgRating || b.ratings - a.ratings);
    res.json(list);
  } catch {
    res.status(500).json({ error: 'Failed to compute top rated.' });
  }
});

module.exports = router;