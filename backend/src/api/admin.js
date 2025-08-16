const express = require('express');
const db = require('../services/firebase');

const router = express.Router();

router.get('/users', async (req, res) => {
  try {
    const snapshot = await db.collection('users').get();
    const users = [];
    snapshot.forEach(doc => users.push({ id: doc.id, ...doc.data() }));
    res.json({ users });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/user/:userId', async (req, res) => {
  try {
    await db.collection('users').doc(req.params.userId).update(req.body);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/promos', async (req, res) => {
  try {
    const snapshot = await db.collection('promos').get();
    const promos = [];
    snapshot.forEach(doc => promos.push({ id: doc.id, ...doc.data() }));
    res.json({ promos });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/promos', async (req, res) => {
  try {
    const { code, percent, active, description } = req.body;
    if (!code || !percent) return res.status(400).json({ error: "code and percent required" });
    await db.collection('promos').add({
      code,
      percent: Number(percent),
      active: !!active,
      description: description || ""
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/promos/:id', async (req, res) => {
  try {
    await db.collection('promos').doc(req.params.id).update(req.body);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/promos/:id', async (req, res) => {
  try {
    await db.collection('promos').doc(req.params.id).delete();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
