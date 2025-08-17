const express = require('express');
const router = express.Router();
const { db } = require('../services/firebase');

const COLLECTION = 'carts';

// Helper to get cart ref
function cartRef(userId) {
  return db.collection(COLLECTION).doc(String(userId));
}

// GET /api/cart/:userId
router.get('/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const doc = await cartRef(userId).get();
    const data = doc.exists ? doc.data() : { items: [] };
    res.json({ userId, items: Array.isArray(data.items) ? data.items : [], updatedAt: data.updatedAt || null });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch cart.' });
  }
});

// POST /api/cart/:userId/add
// body: { itemId, name, price, qty, customizations?, specialInstructions? }
router.post('/:userId/add', async (req, res) => {
  try {
    const { userId } = req.params;
    const { itemId, name, price, qty, customizations, specialInstructions } = req.body || {};
    if (!itemId) return res.status(400).json({ error: 'itemId is required' });

    const ref = cartRef(userId);
    const doc = await ref.get();
    const items = (doc.exists && Array.isArray(doc.data().items)) ? doc.data().items : [];
    const existingIdx = items.findIndex(it => String(it.itemId) === String(itemId));
    const next = {
      itemId: String(itemId),
      name: name ? String(name) : '',
      price: Number(price) || 0,
      qty: Number(qty || 1),
      customizations: Array.isArray(customizations) ? customizations : [],
      specialInstructions: specialInstructions ? String(specialInstructions) : ''
    };
    if (existingIdx >= 0) {
      items[existingIdx].qty = Number(items[existingIdx].qty || 1) + Number(next.qty || 1);
    } else {
      items.push(next);
    }
    await ref.set({ items, updatedAt: new Date().toISOString() }, { merge: true });
    res.status(201).json({ userId, items });
  } catch (err) {
    res.status(500).json({ error: 'Failed to add to cart.' });
  }
});

// PATCH /api/cart/:userId/item/:itemId  body: { qty }
router.patch('/:userId/item/:itemId', async (req, res) => {
  try {
    const { userId, itemId } = req.params;
    const qty = Number(req.body?.qty);
    if (Number.isNaN(qty) || qty < 0) return res.status(400).json({ error: 'qty must be a non-negative number' });

    const ref = cartRef(userId);
    const doc = await ref.get();
    const items = (doc.exists && Array.isArray(doc.data().items)) ? doc.data().items : [];
    const idx = items.findIndex(it => String(it.itemId) === String(itemId));
    if (idx < 0) return res.status(404).json({ error: 'Item not in cart' });
    if (qty === 0) {
      items.splice(idx, 1);
    } else {
      items[idx].qty = qty;
    }
    await ref.set({ items, updatedAt: new Date().toISOString() }, { merge: true });
    res.json({ userId, items });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update cart item.' });
  }
});

// DELETE /api/cart/:userId/item/:itemId
router.delete('/:userId/item/:itemId', async (req, res) => {
  try {
    const { userId, itemId } = req.params;
    const ref = cartRef(userId);
    const doc = await ref.get();
    const items = (doc.exists && Array.isArray(doc.data().items)) ? doc.data().items : [];
    const next = items.filter(it => String(it.itemId) !== String(itemId));
    await ref.set({ items: next, updatedAt: new Date().toISOString() }, { merge: true });
    res.json({ userId, items: next });
  } catch (err) {
    res.status(500).json({ error: 'Failed to remove cart item.' });
  }
});

// DELETE /api/cart/:userId/clear
router.delete('/:userId/clear', async (req, res) => {
  try {
    const { userId } = req.params;
    await cartRef(userId).set({ items: [], updatedAt: new Date().toISOString() }, { merge: true });
    res.json({ userId, items: [] });
  } catch (err) {
    res.status(500).json({ error: 'Failed to clear cart.' });
  }
});

module.exports = router;