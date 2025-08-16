const express = require('express');
const db = require('../services/firebase');

const router = express.Router();

router.post('/', async (req, res) => {
  try {
    const { userId, message, orderId, rating } = req.body;
    if (!userId || !message) return res.status(400).json({ error: "Missing fields" });
    await db.collection('feedback').add({
      userId,
      message,
      orderId: orderId || null,
      rating: rating || null,
      createdAt: Date.now()
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/', async (req, res) => {
  try {
    const snapshot = await db.collection('feedback').orderBy('createdAt', 'desc').get();
    const feedback = [];
    snapshot.forEach(doc => feedback.push({ id: doc.id, ...doc.data() }));
    res.json({ feedback });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
