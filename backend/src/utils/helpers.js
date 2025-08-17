const { db } = require('../services/firebase');

async function fetchActivePromo(code) {
  if (!code) return null;
  const promoCode = String(code).toUpperCase();
  const snap = await db.collection('promos').where('code', '==', promoCode).where('active', '==', true).limit(1).get();
  if (snap.empty) return null;
  return { id: snap.docs[0].id, ...snap.docs[0].data() };
}

function applyPromoToTotal(promo, total) {
  if (!promo) return { discount: 0, percent: 0 };
  const percent = Number(promo.percent) || 0;
  const discount = Math.max(0, Math.round((Number(total) || 0) * (percent / 100)));
  return { discount, percent };
}

async function getUserLoyalty(userId) {
  const ref = db.collection('users').doc(userId);
  const doc = await ref.get();
  const data = doc.exists ? doc.data() : {};
  const loyalty = data.loyalty || { points: 0 };
  return { ref, points: Number(loyalty.points || 0) };
}

async function redeemLoyaltyPoints(userRef, currentPoints, toRedeem) {
  const redeem = Math.max(0, Math.min(Number(toRedeem || 0), Number(currentPoints || 0)));
  if (redeem > 0) {
    await userRef.set({ loyalty: { points: Number(currentPoints) - redeem, updatedAt: new Date().toISOString() } }, { merge: true });
  }
  return redeem;
}

async function addLoyaltyPoints(userRef, currentPoints, toAdd) {
  const add = Math.max(0, Math.floor(Number(toAdd || 0)));
  await userRef.set({ loyalty: { points: Number(currentPoints || 0) + add, updatedAt: new Date().toISOString() } }, { merge: true });
}

function pushStatusHistory(order, nextStatus) {
  const history = Array.isArray(order.statusHistory) ? order.statusHistory.slice() : [];
  history.push({ status: String(nextStatus), at: new Date().toISOString() });
  return history;
}

module.exports = {
  fetchActivePromo,
  applyPromoToTotal,
  getUserLoyalty,
  redeemLoyaltyPoints,
  addLoyaltyPoints,
  pushStatusHistory,
};