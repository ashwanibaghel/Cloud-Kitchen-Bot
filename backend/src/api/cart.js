const express = require('express');
const db = require('../services/firebase');

const router = express.Router();

router.get('/:userId', async (req, res) => {
  try {
    const userId = req.params.userId;
    const cartDoc = await db.collection('carts').doc(userId).get();
    res.json(cartDoc.exists ? cartDoc.data() : { items: [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:userId', async (req, res) => {
  try {
    const userId = req.params.userId;
    const { itemId, qty, customization } = req.body;
    if (!itemId || !qty) return res.status(400).json({ error: "itemId and qty required" });
    const cartRef = db.collection('carts').doc(userId);
    let cartDoc = await cartRef.get();
    let cart = cartDoc.exists ? cartDoc.data() : { items: [] };
    cart.items.push({ itemId, qty, customization: customization || "" });
    await cartRef.set(cart);
    res.json(cart);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:userId', async (req, res) => {
  try {
    const userId = req.params.userId;
    await db.collection('carts').doc(userId).set({ items: [] });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:userId/:itemId', async (req, res) => {
  try {
    const userId = req.params.userId;
    const itemId = req.params.itemId;
    const cartRef = db.collection('carts').doc(userId);
    let cartDoc = await cartRef.get();
    let cart = cartDoc.exists ? cartDoc.data() : { items: [] };
    cart.items = cart.items.filter(i => i.itemId !== itemId);
    await cartRef.set(cart);
    res.json(cart);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
