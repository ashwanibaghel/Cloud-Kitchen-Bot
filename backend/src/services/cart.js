const db = require('./firebase');

const CARTS = 'carts';
const MENU = 'menu';

async function getCart(userId) {
  const doc = await db.collection(CARTS).doc(userId).get();
  const data = doc.exists ? doc.data() : { items: [] };
  return Array.isArray(data.items) ? data.items : [];
}

async function saveCart(userId, items) {
  await db.collection(CARTS).doc(userId).set({ items }, { merge: true });
  return items;
}

async function clearCart(userId) {
  await db.collection(CARTS).doc(userId).set({ items: [] }, { merge: true });
}

async function addItem(userId, itemId, qty = 1) {
  // Menu item fetch
  const menuDoc = await db.collection(MENU).doc(itemId).get();
  if (!menuDoc.exists) throw new Error('Menu item not found');
  const menuItem = { id: menuDoc.id, ...menuDoc.data() };
  if (menuItem.available === false) throw new Error('Item out of stock');

  // Cart update
  const items = await getCart(userId);
  const idx = items.findIndex(i => i.id === itemId);
  if (idx >= 0) {
    items[idx].qty = (items[idx].qty || 1) + qty;
  } else {
    items.push({
      id: menuItem.id,
      name: menuItem.name,
      price: menuItem.price,
      qty,
    });
  }
  await saveCart(userId, items);
  return items;
}

function calcTotal(items) {
  return items.reduce((sum, i) => sum + (i.price || 0) * (i.qty || 1), 0);
}

module.exports = {
  getCart,
  addItem,
  clearCart,
  calcTotal,
};