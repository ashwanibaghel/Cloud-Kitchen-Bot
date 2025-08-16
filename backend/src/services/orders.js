const db = require('./firebase');
const { v4: uuidv4 } = require('uuid');

async function createOrder(userId, items, total, meta = {}) {
  const id = uuidv4();
  const order = {
    id,
    userId,
    items,
    total,
    status: 'pending',
    createdAt: Date.now(),
    ...meta,
  };
  await db.collection('orders').doc(id).set(order);
  return order;
}

async function getLastOrder(userId) {
  const snap = await db.collection('orders')
    .where('userId', '==', userId)
    .orderBy('createdAt', 'desc')
    .limit(1).get();
  if (snap.empty) return null;
  return snap.docs[0].data();
}

async function updateOrderStatus(orderId, status) {
  await db.collection('orders').doc(orderId).set({ status }, { merge: true });
}

module.exports = { createOrder, getLastOrder, updateOrderStatus };