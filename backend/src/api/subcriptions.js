const express = require('express');
const router = express.Router();
const { db } = require('../services/firebase');

const COLLECTION = 'subscriptions';

// GET /api/subscriptions/:userId
router.get('/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const snap = await db.collection(COLLECTION).where('userId', '==', userId).orderBy('createdAt', 'desc').get();
    const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    res.json(items);
  } catch {
    try {
      const snap = await db.collection(COLLECTION).where('userId', '==', req.params.userId).get();
      const items = snap.docs.map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
      res.json(items);
    } catch {
      res.status(500).json({ error: 'Failed to fetch subscriptions.' });
    }
  }
});

// POST /api/subscriptions
// body: { userId, plan: 'weekly'|'monthly', items[], startDate?, notes? }
router.post('/', async (req, res) => {
  try {
    const { userId, plan, items, startDate, notes } = req.body || {};
    if (!userId) return res.status(400).json({ error: 'userId is required' });
    if (!['weekly', 'monthly'].includes(String(plan))) return res.status(400).json({ error: 'plan must be weekly or monthly' });
    if (!Array.isArray(items)) return res.status(400).json({ error: 'items must be an array' });

    const now = new Date().toISOString();
    const doc = {
      userId: String(userId),
      plan: String(plan),
      items,
      startDate: startDate ? String(startDate) : now.slice(0, 10),
      status: 'active',
      notes: notes ? String(notes) : '',
      createdAt: now,
      updatedAt: now,
    };
    const ref = await db.collection(COLLECTION).add(doc);
    const saved = (await ref.get()).data();
    res.status(201).json({ id: ref.id, ...saved });
  } catch {
    res.status(500).json({ error: 'Failed to create subscription.' });
  }
});

// PATCH /api/subscriptions/:id  body: { status?, items?, notes? }
router.patch('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const allowed = ['status', 'items', 'notes'];
    const payload = {};
    for (const k of allowed) {
      if (Object.prototype.hasOwnProperty.call(req.body, k)) payload[k] = req.body[k];
    }
    payload.updatedAt = new Date().toISOString();

    await db.collection(COLLECTION).doc(id).set(payload, { merge: true });
    const doc = await db.collection(COLLECTION).doc(id).get();
    if (!doc.exists) return res.status(404).json({ error: 'Subscription not found' });
    res.json({ id: doc.id, ...doc.data() });
  } catch {
    res.status(500).json({ error: 'Failed to update subscription.' });
  }
});

module.exports = router;