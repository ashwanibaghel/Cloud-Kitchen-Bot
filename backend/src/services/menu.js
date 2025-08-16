const db = require('./firebase');

async function listMenu() {
  const snap = await db.collection('menu').get();
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(m => m.available !== false);
}

module.exports = { listMenu };