const express = require('express');
const db = require('../services/firebase');
const { v4: uuidv4 } = require('uuid');

const router = express.Router();

// Store addresses in addresses/{userId} => { addresses: [ {id, line1, city, pincode, tag, default } ] }

router.get('/:userId', async (req, res) => {
  try {
    const doc = await db.collection('addresses').doc(req.params.userId).get();
    const data = doc.exists ? doc.data() : { addresses: [] };
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/:userId', async (req, res) => {
  try {
    const userId = req.params.userId;
    const { line1, line2, city, state, pincode, tag, isDefault } = req.body;
    if (!line1 || !city || !pincode) return res.status(400).json({ error: "line1, city, pincode required" });
    const id = uuidv4();
    const docRef = db.collection('addresses').doc(userId);
    const doc = await docRef.get();
    const current = doc.exists ? doc.data().addresses || [] : [];
    const next = current.map(a => ({ ...a, default: isDefault ? false : a.default }));
    next.push({ id, line1, line2: line2 || "", city, state: state || "", pincode, tag: tag || "home", default: !!isDefault });
    await docRef.set({ addresses: next });
    res.json({ success: true, id });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.patch('/:userId/:addressId', async (req, res) => {
  try {
    const docRef = db.collection('addresses').doc(req.params.userId);
    const doc = await docRef.get();
    if (!doc.exists) return res.status(404).json({ error: "No addresses" });
    let arr = doc.data().addresses || [];
    arr = arr.map(a => {
      if (a.id === req.params.addressId) {
        const updated = { ...a, ...req.body };
        if (req.body.default === true) {
          // unset others
          return updated;
        }
        return updated;
      }
      return req.body.default === true ? { ...a, default: false } : a;
    });
    await docRef.set({ addresses: arr });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.delete('/:userId/:addressId', async (req, res) => {
  try {
    const docRef = db.collection('addresses').doc(req.params.userId);
    const doc = await docRef.get();
    if (!doc.exists) return res.status(404).json({ error: "No addresses" });
    const arr = (doc.data().addresses || []).filter(a => a.id !== req.params.addressId);
    await docRef.set({ addresses: arr });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
