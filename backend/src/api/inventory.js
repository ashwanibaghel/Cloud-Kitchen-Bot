const express = require('express');
const db = require('../services/firebase');

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const snapshot = await db.collection('inventory').get();
    const items = [];
    snapshot.forEach(doc => items.push({ id: doc.id, ...doc.data() }));
    res.json({ inventory: items });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/:id', async (req, res) => {
  try {
    await db.collection('inventory').doc(req.params.id).update(req.body);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const docRef = await db.collection('inventory').add(req.body);
    res.json({ success: true, id: docRef.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
