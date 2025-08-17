const express = require('express');
const router = express.Router();
const { db } = require('../services/firebase');

const COLLECTION = 'support';

// Create ticket
router.post('/', async (req, res) => {
  try {
    const { userId, message, orderId, priority } = req.body || {};
    const doc = {
      userId: userId ? String(userId) : '',
      message: message ? String(message) : '',
      orderId: orderId ? String(orderId) : '',
      status: 'open',
      priority: priority || 'normal',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const ref = await db.collection(COLLECTION).add(doc);
    const saved = (await ref.get()).data();
    res.status(201).json({ id: ref.id, ...saved });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create support ticket.' });
  }
});

// GET list
router.get('/', async (req, res) => {
  try {
    const snap = await db.collection(COLLECTION).orderBy('createdAt', 'desc').get();
    const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    res.json(items);
  } catch {
    try {
      const snap = await db.collection(COLLECTION).get();
      const items = snap.docs.map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
      res.json(items);
    } catch (e2) {
      res.status(500).json({ error: 'Failed to fetch support tickets.' });
    }
  }
});

// PATCH /api/support/:id
router.patch('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const allowed = ['status', 'message', 'assignedTo', 'escalated'];
    const payload = {};
    for (const k of allowed) {
      if (Object.prototype.hasOwnProperty.call(req.body, k)) payload[k] = req.body[k];
    }
    payload.updatedAt = new Date().toISOString();

    await db.collection(COLLECTION).doc(id).set(payload, { merge: true });
    const doc = await db.collection(COLLECTION).doc(id).get();
    if (!doc.exists) return res.status(404).json({ error: 'Ticket not found' });
    res.json({ id: doc.id, ...doc.data() });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update support ticket.' });
  }
});

module.exports = router;