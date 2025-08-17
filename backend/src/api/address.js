const express = require('express');
const router = express.Router();
const { db } = require('../services/firebase');

// Helpers to keep backward compatibility (single address) and support multiple addresses
async function getUserDoc(userId) {
  const ref = db.collection('users').doc(userId);
  const snap = await ref.get();
  return { ref, data: snap.exists ? snap.data() : {} };
}

// GET /api/address/:userId
// Returns { userId, addresses: [...], defaultAddress }
router.get('/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { data } = await getUserDoc(userId);
    const addresses = Array.isArray(data.addresses) ? data.addresses : (data.address ? [{ id: 'default', label: 'Default', address: data.address, isDefault: true }] : []);
    const defaultAddress = addresses.find(a => a.isDefault) || addresses[0] || null;
    res.json({ userId, addresses, defaultAddress });
  } catch {
    res.status(500).json({ error: 'Failed to fetch addresses.' });
  }
});

// POST /api/address/:userId
// Body can be { address } (legacy) OR { label, address, isDefault? }
router.post('/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const body = req.body || {};
    const { ref, data } = await getUserDoc(userId);
    let addresses = Array.isArray(data.addresses) ? data.addresses : [];

    if (body.address && !body.label) {
      // Legacy: single address set as default
      addresses = [{ id: 'default', label: 'Default', address: String(body.address), isDefault: true }];
    } else {
      const id = Math.random().toString(36).slice(2, 10);
      const entry = {
        id,
        label: String(body.label || 'Address'),
        address: String(body.address || ''),
        isDefault: !!body.isDefault
      };
      if (entry.isDefault) {
        addresses = addresses.map(a => ({ ...a, isDefault: false }));
      }
      addresses.push(entry);
    }

    await ref.set({ addresses, updatedAt: new Date().toISOString() }, { merge: true });
    res.status(201).json({ userId, addresses });
  } catch {
    res.status(500).json({ error: 'Failed to add address.' });
  }
});

// PATCH /api/address/:userId
// Body: { defaultId? } OR { address } (legacy update default)
router.patch('/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const body = req.body || {};
    const { ref, data } = await getUserDoc(userId);
    let addresses = Array.isArray(data.addresses) ? data.addresses : [];

    if (body.defaultId) {
      addresses = addresses.map(a => ({ ...a, isDefault: a.id === body.defaultId }));
    } else if (body.address && !body.label) {
      // Legacy: update default
      if (!addresses.length) {
        addresses = [{ id: 'default', label: 'Default', address: String(body.address), isDefault: true }];
      } else {
        addresses = addresses.map(a => a.isDefault ? { ...a, address: String(body.address) } : a);
      }
    }

    await ref.set({ addresses, updatedAt: new Date().toISOString() }, { merge: true });
    res.json({ userId, addresses });
  } catch {
    res.status(500).json({ error: 'Failed to update address.' });
  }
});

// PATCH /api/address/:userId/:addrId
router.patch('/:userId/:addrId', async (req, res) => {
  try {
    const { userId, addrId } = req.params;
    const body = req.body || {};
    const { ref, data } = await getUserDoc(userId);
    let addresses = Array.isArray(data.addresses) ? data.addresses : [];
    addresses = addresses.map(a => a.id === addrId ? { ...a, ...body, id: a.id } : a);
    if (body.isDefault) {
      addresses = addresses.map(a => ({ ...a, isDefault: a.id === addrId }));
    }
    await ref.set({ addresses, updatedAt: new Date().toISOString() }, { merge: true });
    res.json({ userId, addresses });
  } catch {
    res.status(500).json({ error: 'Failed to update specific address.' });
  }
});

// DELETE /api/address/:userId/:addrId
router.delete('/:userId/:addrId', async (req, res) => {
  try {
    const { userId, addrId } = req.params;
    const { ref, data } = await getUserDoc(userId);
    let addresses = Array.isArray(data.addresses) ? data.addresses : [];
    addresses = addresses.filter(a => a.id !== addrId);
    if (addresses.length && !addresses.some(a => a.isDefault)) {
      addresses[0].isDefault = true;
    }
    await ref.set({ addresses, updatedAt: new Date().toISOString() }, { merge: true });
    res.json({ userId, addresses });
  } catch {
    res.status(500).json({ error: 'Failed to delete address.' });
  }
});

module.exports = router;