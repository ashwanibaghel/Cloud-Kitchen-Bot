const express = require('express');
const router = express.Router();
const { db } = require('../services/firebase');

const COLLECTION = 'menu';

// Helper: compute simple popularity from orders (best-effort)
async function computePopularityMap() {
  try {
    const snap = await db.collection('orders').orderBy('createdAt', 'desc').limit(500).get();
    const map = new Map();
    snap.docs.forEach(d => {
      const items = (d.data().items || []);
      items.forEach(it => {
        const id = String(it.itemId || it.id || '');
        const qty = Number(it.qty || 1);
        if (!id) return;
        map.set(id, (map.get(id) || 0) + qty);
      });
    });
    return map;
  } catch {
    return new Map();
  }
}

async function computeRatingsMap() {
  try {
    const snap = await db.collection('feedback').orderBy('createdAt', 'desc').limit(1000).get();
    const agg = new Map(); // id -> { sum, count }
    snap.docs.forEach(d => {
      const { itemId, rating } = d.data();
      const id = String(itemId || '');
      if (!id) return;
      const r = Number(rating || 0);
      if (!agg.has(id)) agg.set(id, { sum: 0, count: 0 });
      agg.get(id).sum += r;
      agg.get(id).count += 1;
    });
    const map = new Map();
    for (const [id, v] of agg.entries()) {
      map.set(id, v.count ? (v.sum / v.count) : 0);
    }
    return map;
  } catch {
    return new Map();
  }
}

// GET /api/menu?sort=createdAt|popular|topRated|ownersChoice
router.get('/', async (req, res) => {
  const sort = String(req.query.sort || 'createdAt');
  try {
    const snap = await db.collection(COLLECTION).get();
    let items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    if (sort === 'ownersChoice') {
      items = items.filter(i => !!i.ownersChoice).sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
    } else if (sort === 'popular') {
      const pop = await computePopularityMap();
      items.sort((a, b) => (pop.get(b.id) || 0) - (pop.get(a.id) || 0));
    } else if (sort === 'topRated') {
      const ratings = await computeRatingsMap();
      items.sort((a, b) => (ratings.get(b.id) || 0) - (ratings.get(a.id) || 0));
    } else {
      items.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    }
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch menu.' });
  }
});

// POST /api/menu
router.post('/', async (req, res) => {
  try {
    const { name, price, description, available, customizations, imageUrl, ownersChoice } = req.body || {};
    if (!name) return res.status(400).json({ error: 'name is required' });

    const numPrice = Number(price);
    if (Number.isNaN(numPrice)) return res.status(400).json({ error: 'price must be a number' });

    const doc = {
      name: String(name),
      price: numPrice,
      description: description ? String(description) : '',
      available: typeof available === 'boolean' ? available : true,
      customizations: Array.isArray(customizations) ? customizations.map(x => String(x)) : [],
      imageUrl: imageUrl ? String(imageUrl) : '',
      ownersChoice: !!ownersChoice,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const ref = await db.collection(COLLECTION).add(doc);
    const saved = (await ref.get()).data();
    res.status(201).json({ id: ref.id, ...saved });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create menu item.' });
  }
});

// PATCH /api/menu/:id
router.patch('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const payload = {};
    const allowed = ['name', 'price', 'description', 'available', 'customizations', 'imageUrl', 'ownersChoice'];

    for (const k of allowed) {
      if (Object.prototype.hasOwnProperty.call(req.body, k)) {
        payload[k] = k === 'price' ? Number(req.body[k]) : req.body[k];
      }
    }
    if (payload.price !== undefined && Number.isNaN(payload.price)) {
      return res.status(400).json({ error: 'price must be a number' });
    }
    payload.updatedAt = new Date().toISOString();

    await db.collection(COLLECTION).doc(id).set(payload, { merge: true });
    const doc = await db.collection(COLLECTION).doc(id).get();
    if (!doc.exists) return res.status(404).json({ error: 'Item not found' });
    res.json({ id: doc.id, ...doc.data() });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update menu item.' });
  }
});

// DELETE /api/menu/:id
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await db.collection(COLLECTION).doc(id).delete();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete menu item.' });
  }
});

module.exports = router;