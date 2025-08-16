const express = require('express');
const db = require('../services/firebase');

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const snapshot = await db.collection('menu').get();
    const items = [];
    snapshot.forEach(doc => items.push({ id: doc.id, ...doc.data() }));
    res.json({ menu: items });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const { name, description, price, available, customizations, imageUrl } = req.body;
    if (!name || !price) return res.status(400).json({ error: "Name and price required" });
    const newItem = {
      name,
      description: description || "",
      price: Number(price),
      available: available !== undefined ? available : true,
      customizations: customizations || [],
      imageUrl: imageUrl || ""
    };
    const docRef = await db.collection('menu').add(newItem);
    res.json({ id: docRef.id, ...newItem });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/:id', async (req, res) => {
  try {
    const id = req.params.id;
    await db.collection('menu').doc(id).update(req.body);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const id = req.params.id;
    await db.collection('menu').doc(id).delete();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
