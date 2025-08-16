const express = require('express');
const db = require('../services/firebase');

const router = express.Router();

// Simple address API compatible with WhatsApp service
// WhatsApp service expects { address } field in users collection

router.get('/:userId', async (req, res) => {
  try {
    const doc = await db.collection('users').doc(req.params.userId).get();
    const profile = doc.exists ? doc.data() : {};
    res.json({ address: profile.address || null });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:userId', async (req, res) => {
  try {
    const { address } = req.body;
    if (!address) {
      return res.status(400).json({ error: 'address required' });
    }
    await db.collection('users').doc(req.params.userId).set(
      { address, addressUpdatedAt: Date.now() }, 
      { merge: true }
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/:userId', async (req, res) => {
  try {
    const { address } = req.body;
    if (!address) {
      return res.status(400).json({ error: 'address required' });
    }
    await db.collection('users').doc(req.params.userId).update({
      address,
      addressUpdatedAt: Date.now()
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
