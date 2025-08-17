const express = require('express');
const router = express.Router();
const { db } = require('../services/firebase');

// Users endpoints
router.get('/users', async (req, res) => {
  try {
    const snap = await db.collection('users').limit(1000).get();
    const users = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch users.' });
  }
});

router.delete('/users/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await db.collection('users').doc(id).delete();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete user.' });
  }
});

// Promos CRUD
const PROMOS = 'promos';

router.get('/promos', async (req, res) => {
  try {
    const snap = await db.collection(PROMOS).orderBy('createdAt', 'desc').get();
    const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    res.json(items);
  } catch {
    try {
      const snap = await db.collection(PROMOS).get();
      const items = snap.docs.map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
      res.json(items);
    } catch {
      res.status(500).json({ error: 'Failed to fetch promos.' });
    }
  }
});

router.post('/promos', async (req, res) => {
  try {
    const { code, percent, active, description } = req.body || {};
    if (!code) return res.status(400).json({ error: 'code is required' });
    const pct = Number(percent);
    if (Number.isNaN(pct) || pct < 0 || pct > 100) {
      return res.status(400).json({ error: 'percent must be between 0 and 100' });
    }
    const doc = {
      code: String(code).toUpperCase(),
      percent: pct,
      active: typeof active === 'boolean' ? active : true,
      description: description ? String(description) : '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const ref = await db.collection(PROMOS).add(doc);
    const saved = (await ref.get()).data();
    res.status(201).json({ id: ref.id, ...saved });
  } catch {
    res.status(500).json({ error: 'Failed to create promo.' });
  }
});

router.patch('/promos/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const allowed = ['code', 'percent', 'active', 'description'];
    const payload = {};
    for (const k of allowed) {
      if (Object.prototype.hasOwnProperty.call(req.body, k)) {
        payload[k] = k === 'percent' ? Number(req.body[k]) : req.body[k];
      }
    }
    if (payload.percent !== undefined && (Number.isNaN(payload.percent) || payload.percent < 0 || payload.percent > 100)) {
      return res.status(400).json({ error: 'percent must be between 0 and 100' });
    }
    if (payload.code) payload.code = String(payload.code).toUpperCase();
    payload.updatedAt = new Date().toISOString();

    await db.collection(PROMOS).doc(id).set(payload, { merge: true });
    const doc = await db.collection(PROMOS).doc(id).get();
    if (!doc.exists) return res.status(404).json({ error: 'Promo not found' });
    res.json({ id: doc.id, ...doc.data() });
  } catch {
    res.status(500).json({ error: 'Failed to update promo.' });
  }
});

router.delete('/promos/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await db.collection(PROMOS).doc(id).delete();
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Failed to delete promo.' });
  }
});

// Owners Choice flag on menu
router.patch('/menu/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { ownersChoice } = req.body || {};
    await db.collection('menu').doc(id).set({ ownersChoice: !!ownersChoice, updatedAt: new Date().toISOString() }, { merge: true });
    const doc = await db.collection('menu').doc(id).get();
    if (!doc.exists) return res.status(404).json({ error: 'Menu item not found' });
    res.json({ id: doc.id, ...doc.data() });
  } catch {
    res.status(500).json({ error: 'Failed to update menu item.' });
  }
});

// Admin config (live video URL)
router.get('/config', async (req, res) => {
  try {
    const doc = await db.collection('config').doc('general').get();
    const data = doc.exists ? doc.data() : {};
    res.json({ liveVideoUrl: data.liveVideoUrl || process.env.LIVE_VIDEO_BASE_URL || '' });
  } catch {
    res.status(500).json({ error: 'Failed to load config.' });
  }
});

router.post('/config', async (req, res) => {
  try {
    const { liveVideoUrl } = req.body || {};
    await db.collection('config').doc('general').set({ liveVideoUrl: String(liveVideoUrl || ''), updatedAt: new Date().toISOString() }, { merge: true });
    const doc = await db.collection('config').doc('general').get();
    res.status(201).json({ liveVideoUrl: doc.data().liveVideoUrl || '' });
  } catch {
    res.status(500).json({ error: 'Failed to save config.' });
  }
});

// Admin: Loyalty stats
router.get('/loyalty/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const doc = await db.collection('users').doc(userId).get();
    const data = doc.exists ? doc.data() : {};
    res.json({ userId, points: Number(data?.loyalty?.points || 0) });
  } catch {
    res.status(500).json({ error: 'Failed to fetch loyalty.' });
  }
});

module.exports = router;