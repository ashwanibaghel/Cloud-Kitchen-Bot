const express = require('express');
const db = require('../services/firebase');

const router = express.Router();

router.post('/', async (req, res) => {
  try {
    const { userId, message, orderId } = req.body;
    if (!userId || !message) return res.status(400).json({ error: "Missing fields" });
    await db.collection('support').add({
      userId,
      message,
      orderId: orderId || null,
      createdAt: Date.now(),
      status: 'open'
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/', async (req, res) => {
  try {
    const snapshot = await db.collection('support').orderBy('createdAt', 'desc').get();
    const tickets = [];
    snapshot.forEach(doc => tickets.push({ id: doc.id, ...doc.data() }));
    res.json({ tickets });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/:id', async (req, res) => {
  try {
    await db.collection('support').doc(req.params.id).update(req.body);
    const updatedDoc = await db.collection('support').doc(req.params.id).get();
    if (!updatedDoc.exists) {
      return res.status(404).json({ error: 'Support ticket not found' });
    }
    res.json({ id: updatedDoc.id, ...updatedDoc.data() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
