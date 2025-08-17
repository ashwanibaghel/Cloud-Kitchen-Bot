const express = require('express');
const router = express.Router();
const { db } = require('../services/firebase');

const COLLECTION = 'inventory';

// GET /api/inventory
router.get('/', async (req, res) => {
  try {
    const snap = await db.collection(COLLECTION).get();
    const items = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (b.updatedAt || b.createdAt || '').localeCompare(a.updatedAt || a.createdAt || ''));
    res.json(items);
  } catch {
    res.status(500).json({ error: 'Failed to fetch inventory.' });
  }
});

// POST /api/inventory
router.post('/', async (req, res) => {
  try {
    const { name, stock, threshold, unit } = req.body || {};
    const doc = {
      name: name ? String(name) : '',
      stock: stock != null ? Number(stock) : 0,
      threshold: threshold != null ? Number(threshold) : 0,
      unit: unit ? String(unit) : '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const ref = await db.collection(COLLECTION).add(doc);
    const saved = (await ref.get()).data();
    res.status(201).json({ id: ref.id, ...saved });
  } catch {
    res.status(500).json({ error: 'Failed to create inventory item.' });
  }
});

// PATCH /api/inventory/:id
router.patch('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const payload = { ...req.body, updatedAt: new Date().toISOString() };
    if (payload.stock !== undefined) payload.stock = Number(payload.stock);
    if (payload.threshold !== undefined) payload.threshold = Number(payload.threshold);
    if (Number.isNaN(payload.stock)) delete payload.stock;
    if (Number.isNaN(payload.threshold)) delete payload.threshold;

    await db.collection(COLLECTION).doc(id).set(payload, { merge: true });
    const doc = await db.collection(COLLECTION).doc(id).get();
    if (!doc.exists) return res.status(404).json({ error: 'Inventory item not found' });
    res.json({ id: doc.id, ...doc.data() });
  } catch {
    res.status(500).json({ error: 'Failed to update inventory item.' });
  }
});

module.exports = router;