const express = require('express');
const router = express.Router();
const { db } = require('../services/firebase');

const COLLECTION = 'feedback';

// POST /api/feedback
// body: { userId, orderId?, itemId?, itemName?, rating (1-5), comment? }
router.post('/', async (req, res) => {
  try {
    const { userId, orderId, itemId, itemName, rating, comment } = req.body || {};
    const r = Number(rating);
    if (!userId) return res.status(400).json({ error: 'userId is required' });
    if (Number.isNaN(r) || r < 1 || r > 5) return res.status(400).json({ error: 'rating must be between 1 and 5' });

    const doc = {
      userId: String(userId),
      orderId: orderId ? String(orderId) : '',
      itemId: itemId ? String(itemId) : '',
      itemName: itemName ? String(itemName) : '',
      rating: r,
      comment: comment ? String(comment) : '',
      createdAt: new Date().toISOString(),
    };
    const ref = await db.collection(COLLECTION).add(doc);
    const saved = (await ref.get()).data();
    res.status(201).json({ id: ref.id, ...saved });
  } catch {
    res.status(500).json({ error: 'Failed to submit feedback.' });
  }
});

// GET /api/feedback
router.get('/', async (req, res) => {
  try {
    const snap = await db.collection(COLLECTION).orderBy('createdAt', 'desc').limit(1000).get();
    const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    res.json(items);
  } catch {
    try {
      const snap = await db.collection(COLLECTION).get();
      const items = snap.docs.map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
      res.json(items);
    } catch {
      res.status(500).json({ error: 'Failed to fetch feedback.' });
    }
  }
});

// GET /api/feedback/item/:itemId  -> average rating
router.get('/item/:itemId', async (req, res) => {
  try {
    const { itemId } = req.params;
    const snap = await db.collection(COLLECTION).where('itemId', '==', String(itemId)).get();
    let sum = 0, count = 0;
    snap.docs.forEach(d => { sum += Number(d.data().rating || 0); count += 1; });
    const avg = count ? sum / count : 0;
    res.json({ itemId, avgRating: avg, ratings: count });
  } catch {
    res.status(500).json({ error: 'Failed to compute item rating.' });
  }
});

module.exports = router;