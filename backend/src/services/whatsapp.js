// WhatsApp service — Zero-typing UX with a single "Show Options" list,
// Multi-Add menu ("✓ Done Adding"), tap-to-remove, UPI link + "I've paid", COD instant confirm + live link.
// Address flow: no rude prompts; greetings ignored; confirm Save/Change via buttons.

const http = require('http');
const https = require('https');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');

// Adjust this import if your firebase service exports differently
const { db } = require('./firebase');

const WA_VERSION = process.env.WA_API_VERSION || 'v20.0';
const BASE = `https://graph.facebook.com/${WA_VERSION}`;
const OWNER_WA_NUMBER = (process.env.OWNER_WA_NUMBER || '').trim();
const LIVE_BASE = process.env.LIVE_VIDEO_BASE_URL || 'https://your-domain.com/live';

const waClient = axios.create({
  timeout: 8000,
  httpAgent: new http.Agent({ keepAlive: true, maxSockets: 20 }),
  httpsAgent: new https.Agent({ keepAlive: true, maxSockets: 20 }),
  headers: {
    Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
    'Content-Type': 'application/json',
  },
});

function nowIso() {
  return new Date().toISOString();
}
async function waPost(path, data) {
  const url = `${BASE}/${path}`;
  try {
    const res = await waClient.post(url, data);
    return res.data;
  } catch (e) {
    const s = e.response?.status;
    const b = e.response?.data;
    console.error('[WA Error]', s || '', b ? JSON.stringify(b) : e.message);
    throw e;
  }
}
async function sendMessage(to, message) {
  if (!to) return;
  const data = {
    messaging_product: 'whatsapp',
    to,
    type: 'text',
    text: { body: String(message).slice(0, 4000) },
  };
  return waPost(`${process.env.WHATSAPP_PHONE_ID}/messages`, data);
}
async function safeSend(to, message) {
  try {
    await sendMessage(to, message);
  } catch (_) {}
}
async function sendInteractiveList(to, headerText, bodyText, sectionTitle, rows, buttonLabel = 'Show Options') {
  if (!to) return;
  const data = {
    messaging_product: 'whatsapp',
    to,
    type: 'interactive',
    interactive: {
      type: 'list',
      header: { type: 'text', text: headerText },
      body: { text: bodyText },
      action: {
        button: buttonLabel,
        sections: [
          {
            title: sectionTitle,
            rows: rows.map((r) => ({
              id: r.id,
              title: r.title,
              description: r.description ? String(r.description).slice(0, 70) : '',
            })),
          },
        ],
      },
    },
  };
  return waPost(`${process.env.WHATSAPP_PHONE_ID}/messages`, data);
}
async function sendButtons(to, text, buttons) {
  if (!to) return;
  // buttons: [{ id, title }] max 3
  const data = {
    messaging_product: 'whatsapp',
    to,
    type: 'interactive',
    interactive: {
      type: 'button',
      body: { text },
      action: {
        buttons: buttons.slice(0, 3).map((b) => ({
          type: 'reply',
          reply: { id: b.id, title: String(b.title).slice(0, 20) },
        })),
      },
    },
  };
  return waPost(`${process.env.WHATSAPP_PHONE_ID}/messages`, data);
}

// ============ Show Options ============
async function sendHome(to, body = 'What would you like to do?') {
  const rows = [
    { id: 'home:menu', title: 'Browse Menu', description: 'Add dishes to cart' },
    { id: 'home:cart', title: 'View Cart', description: 'See or edit your cart' },
    { id: 'home:checkout', title: 'Checkout', description: 'Place your order' },
    { id: 'home:track', title: 'Track Order', description: 'Live status updates' },
    { id: 'home:address', title: 'Manage Address', description: 'Save/change address' },
    { id: 'home:coupons', title: 'Apply Coupon', description: 'Use available discounts' },
    { id: 'home:points', title: 'Loyalty Points', description: 'Check & redeem' },
    { id: 'home:reorder', title: 'Reorder', description: 'Repeat last order' },
    { id: 'home:subscribe', title: 'Subscriptions', description: 'Weekly/Monthly tiffin' },
    { id: 'home:support', title: 'Talk to Agent', description: 'Get help from a human' },
  ];
  await sendInteractiveList(to, 'Cloud Kitchen', body, 'Main Menu', rows, 'Show Options');
}

// ============ Heuristics ============
function isGreeting(msg) {
  const s = String(msg || '').trim().toLowerCase();
  return /^(hi|hii+|hello|hey|hlo|yo|namaste|namaskar|ok|okay|thanks|thank you|thx|hola|yo+|haan|hmm)$/.test(s);
}
function looksLikeAddress(msg) {
  const s = String(msg || '').trim();
  if (s.length < 10) return false;
  const hasNumber = /\d/.test(s);
  const hasPin = /\b\d{6}\b|\b\d{5}\b/.test(s);
  const hasKeyword = /(road|rd|street|st|sector|block|colony|nagar|vihar|lane|phase|apt|apartment|tower|society|bldg|building|near|opp|opposite|behind|gate|plot|flat|floor|house|no\.|area|locality|market|bazar|chowk|naka|city|pincode)/i.test(
    s
  );
  const hasComma = s.includes(',');
  return (hasNumber || hasPin) && (hasKeyword || hasComma);
}

// ============ Menu (Multi-add simulation) ============
async function sendMenuList(to) {
  const snap = await db.collection('menu').where('available', '==', true).get();
  const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const rows = [
    { id: 'menu:done', title: '✓ Done Adding', description: 'Proceed to next step' },
    ...items.map((m) => ({
      id: `menu:${m.id}`,
      title: m.name,
      description: `₹${m.price} ${m.available ? '' : '(Out of stock)'}`,
    })),
  ];
  await sendInteractiveList(
    to,
    'Cloud Kitchen Menu',
    'Tap items to add. Select "✓ Done Adding" when finished.',
    'Menu',
    rows,
    'Show Options'
  );
}

// ============ Cart helpers ============
async function getCart(userId) {
  const doc = await db.collection('carts').doc(userId).get();
  return doc.exists ? doc.data() : { items: [] };
}
async function setCart(userId, cart) {
  return db.collection('carts').doc(userId).set({ ...cart, updatedAt: nowIso() }, { merge: true });
}
async function sendCartSummary(userId) {
  const cart = await getCart(userId);
  const items = cart.items || [];
  if (!items.length) {
    await safeSend(userId, '🛒 Your cart is empty.');
    return;
  }
  const menuDocs = await Promise.all(items.map((ci) => db.collection('menu').doc(ci.itemId).get()));
  let total = 0;
  const lines = items.map((ci, idx) => {
    const m = menuDocs[idx].exists ? menuDocs[idx].data() : { name: 'Item', price: 0 };
    const amt = (m.price || 0) * (ci.qty || 1);
    total += amt;
    return `${m.name} x${ci.qty}${ci.customization ? ' (' + ci.customization + ')' : ''} - ₹${amt}`;
  });
  await safeSend(userId, `🛒 Your Cart\n\n${lines.join('\n')}\n\nSubtotal: ₹${total}`);
}
async function sendRemoveFromCartList(to) {
  const cart = await getCart(to);
  const items = cart.items || [];
  if (!items.length) {
    await safeSend(to, 'Cart is empty.');
    await sendHome(to, 'What next?');
    return;
  }
  const menuDocs = await Promise.all(items.map((ci) => db.collection('menu').doc(ci.itemId).get()));
  const rows = [
    { id: 'remove:done', title: '✓ Done Removing', description: 'Go back' },
    ...items.map((ci, idx) => {
      const m = menuDocs[idx].exists ? menuDocs[idx].data() : { name: 'Item' };
      return { id: `remove:${idx}`, title: `Remove ${m.name} x${ci.qty}`, description: ci.customization || '' };
    }),
  ];
  await sendInteractiveList(to, 'Remove from Cart', 'Select an item to remove:', 'Your Items', rows, 'Show Options');
}

// ============ Address helpers ============
async function getUserProfile(userId) {
  const doc = await db.collection('users').doc(userId).get();
  return doc.exists ? doc.data() : {};
}
function getDefaultAddress(profile) {
  if (!profile) return null;
  if (Array.isArray(profile.addresses) && profile.addresses.length) {
    return profile.addresses.find((a) => a.isDefault) || profile.addresses[0];
  }
  if (profile.address) return { address: profile.address, isDefault: true, id: 'default' };
  return null;
}
async function saveUserAddress(userId, address) {
  const ref = db.collection('users').doc(userId);
  const snap = await ref.get();
  const data = snap.exists ? snap.data() : {};
  let addresses = Array.isArray(data.addresses) ? data.addresses : [];
  if (!addresses.length) {
    addresses = [{ id: 'default', label: 'Default', address: String(address), isDefault: true }];
  } else {
    addresses = addresses.map((a) => (a.isDefault ? { ...a, address: String(address) } : a));
  }
  await ref.set({ addresses, address: String(address), updatedAt: nowIso() }, { merge: true });
}

// ============ Coupons/Loyalty ============
async function fetchActivePromos() {
  const snap = await db.collection('promos').where('active', '==', true).get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}
async function fetchActivePromoByCode(code) {
  const promoCode = String(code || '').trim().toUpperCase();
  if (!promoCode) return null;
  const snap = await db.collection('promos').where('code', '==', promoCode).where('active', '==', true).limit(1).get();
  if (snap.empty) return null;
  return { id: snap.docs[0].id, ...snap.docs[0].data() };
}
async function sendCouponsPicker(to) {
  const promos = await fetchActivePromos();
  if (!promos.length) {
    await safeSend(to, 'No coupons available right now.');
    await sendHome(to, 'Choose next action:');
    return;
  }
  const rows = promos.map((p) => ({
    id: `coupon:${p.code}`,
    title: `${p.code} — ${p.percent}% OFF`,
    description: p.description || '',
  }));
  await sendInteractiveList(to, 'Coupons', 'Select a coupon to apply:', 'Available Coupons', rows, 'Show Options');
}

// ============ Payments ============
function buildLiveUrl(orderId, userId) {
  return `${LIVE_BASE}?order=${encodeURIComponent(orderId)}&u=${encodeURIComponent(userId)}`;
}
async function sendPaymentButtons(to, orderId) {
  await sendButtons(to, 'Choose a payment method:', [
    { id: `pay_upi:${orderId}`, title: 'UPI' },
    { id: `pay_razor:${orderId}`, title: 'Razorpay' },
    { id: `pay_cod:${orderId}`, title: 'COD' },
  ]);
}
async function markOrderPaidAndNotify(orderId, userId) {
  const ref = db.collection('orders').doc(orderId);
  const doc = await ref.get();
  if (!doc.exists) {
    await safeSend(userId, 'Order not found.');
    return;
  }
  const o = doc.data();
  const now = nowIso();
  await ref.set(
    {
      status: 'confirmed',
      paidAt: now,
      payment: { ...(o.payment || {}), status: 'paid' },
      updatedAt: now,
      statusHistory: [ ...(o.statusHistory || []), { status: 'confirmed', at: now } ],
    },
    { merge: true }
  );
  await safeSend(userId, '✅ Payment received! Your order is confirmed.');
  await safeSend(userId, `🎥 Live kitchen:\n${buildLiveUrl(orderId, userId)}`);
  await sendHome(userId, 'You can track your order or do more:');
}
async function notifyAdmin(text) {
  if (!OWNER_WA_NUMBER) return;
  await safeSend(OWNER_WA_NUMBER, text);
}

// ============ Checkout flow ============
async function startCheckoutFlow(userId) {
  const cart = await getCart(userId);
  const items = cart.items || [];
  if (!items.length) {
    await safeSend(userId, 'Your cart is empty.');
    await sendHome(userId, 'Choose an option:');
    return;
  }

  const profile = await getUserProfile(userId);
  const def = getDefaultAddress(profile);
  if (!def?.address) {
    await safeSend(userId, '📍 Please send your full delivery address in a single message.');
    await db.collection('sessions').doc(userId).set({ step: 'collecting_address', updatedAt: Date.now() }, { merge: true });
    return;
  }

  // Compute totals
  const menuDocs = await Promise.all(items.map((ci) => db.collection('menu').doc(ci.itemId).get()));
  let baseTotal = 0;
  items.forEach((ci, idx) => {
    const m = menuDocs[idx].exists ? menuDocs[idx].data() : { price: 0 };
    baseTotal += (m.price || 0) * (ci.qty || 1);
  });

  // Apply coupon if single available
  const sessionRef = db.collection('sessions').doc(userId);
  const sSnap = await sessionRef.get();
  let session = sSnap.exists ? sSnap.data() : {};
  let finalTotal = baseTotal;

  if (!session.coupon) {
    const promos = await fetchActivePromos();
    if (promos.length === 1) {
      const p = promos[0];
      session.coupon = { code: p.code, percent: p.percent };
      await sessionRef.set({ ...session, updatedAt: Date.now() });
      await safeSend(userId, `🎉 Auto-applied coupon: ${p.code} (${p.percent}% OFF)`);
      finalTotal -= Math.round(finalTotal * (p.percent / 100));
    } else if (promos.length > 1) {
      await sendCouponsPicker(userId);
      return;
    }
  } else {
    finalTotal -= Math.round(finalTotal * (Number(session.coupon.percent || 0) / 100));
  }

  const now = nowIso();
  const orderId = uuidv4();
  await db.collection('orders').doc(orderId).set({
    userId,
    items,
    totals: { baseTotal, promo: session.coupon || null, finalTotal },
    total: finalTotal,
    payment: { method: 'unknown', status: 'pending' },
    status: 'pending_payment',
    statusHistory: [{ status: 'pending_payment', at: now }],
    deliveryAddress: def.address || '',
    createdAt: now,
    updatedAt: now,
  });

  await setCart(userId, { items: [] });

  await safeSend(userId, `Order created (ID: ${orderId}). Total: ₹${finalTotal}`);
  await notifyAdmin(`🆕 New Order\nID: ${orderId}\nFrom: ${userId}\nTotal: ₹${finalTotal}`);

  await sendPaymentButtons(userId, orderId);
  await sendHome(userId, 'You can always open Show Options:');
}

// ============ Main incoming handler ============
async function handleIncoming(payload) {
  const entry = payload?.entry?.[0]?.changes?.[0]?.value;
  if (!entry?.messages) return;

  const message = entry.messages[0];
  const from = message.from;
  const type = message.type;
  const text = type === 'text' ? (message.text?.body?.trim() || '') : '';
  const lower = text.toLowerCase();

  // Exit keywords
  if (['bye', 'stop', 'exit'].includes(lower)) {
    await safeSend(from, 'Thanks! Message anytime to order again.');
    return;
  }

  // Location handling
  if (type === 'location') {
    const loc = message.location || {};
    await db.collection('users').doc(from).set(
      { lastLocation: { lat: loc.latitude, lng: loc.longitude, name: loc.name || '', address: loc.address || '' }, updatedAt: nowIso() },
      { merge: true }
    );
    await safeSend(from, '📍 Location saved for delivery.');
    await sendHome(from, 'What would you like to do next?');
    return;
  }

  // Sessions
  const sessionRef = db.collection('sessions').doc(from);
  const sSnap = await sessionRef.get();
  let session = sSnap.exists ? sSnap.data() : {};
  if (!session.updatedAt) session.updatedAt = Date.now();

  // Handle interactive list replies
  if (type === 'interactive' && message.interactive?.type === 'list_reply') {
    const id = message.interactive.list_reply?.id || '';

    // Home actions
    if (id.startsWith('home:')) {
      const key = id.split(':')[1];

      if (key === 'menu') {
        await sendMenuList(from);
        return;
      }
      if (key === 'cart') {
        await sendCartSummary(from);
        await sendRemoveFromCartList(from);
        return;
      }
      if (key === 'checkout') {
        await startCheckoutFlow(from);
        return;
      }
      if (key === 'track') {
        await handleTrack(from, true);
        return;
      }
      if (key === 'address') {
        const profile = await getUserProfile(from);
        const def = getDefaultAddress(profile);
        if (def?.address) {
          await safeSend(from, `Your default address:\n${def.address}\n\nSend a new address to update.`);
        } else {
          await safeSend(from, '📍 Please send your full delivery address in one message.\nExample: "House 12, MG Road, Indore 452001"');
        }
        await sessionRef.set({ ...session, step: 'collecting_address', updatedAt: Date.now() });
        await sendHome(from, 'You can continue from Show Options meanwhile.');
        return;
      }
      if (key === 'coupons') {
        await sendCouponsPicker(from);
        return;
      }
      if (key === 'points') {
        const u = await db.collection('users').doc(from).get();
        const points = Number(u.exists ? (u.data()?.loyalty?.points || 0) : 0);
        await safeSend(from, `⭐ Your loyalty points: ${points}`);
        await sendHome(from, 'What next?');
        return;
      }
      if (key === 'reorder') {
        await handleReorder(from);
        return;
      }
      if (key === 'subscribe') {
        const cart = await getCart(from);
        if (!cart.items?.length) {
          await safeSend(from, 'Your cart is empty. Add items first.');
          await sendMenuList(from);
          return;
        }
        const now = nowIso();
        const r = await db.collection('subscriptions').add({
          userId: from, plan: 'weekly', items: cart.items, startDate: now.slice(0, 10), status: 'active', notes: '', createdAt: now, updatedAt: now,
        });
        await safeSend(from, `✅ Weekly subscription created. ID: ${r.id}`);
        await sendHome(from, 'Choose your next action:');
        return;
      }
      if (key === 'support') {
        await db.collection('support').add({
          userId: from, message: 'Agent requested', status: 'open', createdAt: nowIso(), updatedAt: nowIso(),
        });
        await safeSend(from, 'A human agent will reach out to you soon.');
        await notifyAdmin(`🚨 Agent requested by ${from}`);
        await sendHome(from, 'Meanwhile, you can continue:');
        return;
      }
    }

    // Menu multi-add
    if (id.startsWith('menu:')) {
      const item = id.split(':')[1];
      if (item === 'done') {
        await safeSend(from, 'Great! You can checkout now.');
        await sendHome(from, 'Open Show Options to continue:');
        return;
      }
      const mDoc = await db.collection('menu').doc(item).get();
      if (!mDoc.exists) {
        await safeSend(from, 'Item not found.');
        await sendMenuList(from);
        return;
      }
      const m = mDoc.data();
      if (m.available === false) {
        await safeSend(from, 'Item is out of stock.');
        await sendMenuList(from);
        return;
      }
      const cart = await getCart(from);
      const ex = (cart.items || []).find((i) => i.itemId === item);
      if (ex) ex.qty = (ex.qty || 1) + 1;
      else (cart.items = cart.items || []).push({ itemId: item, qty: 1, customization: '' });
      await setCart(from, cart);
      await safeSend(from, `✅ Added ${m.name} to your cart.`);
      await sendMenuList(from); // re-open for multi-add
      return;
    }

    // Coupon selected
    if (id.startsWith('coupon:')) {
      const code = id.split(':')[1];
      const promo = await fetchActivePromoByCode(code);
      if (!promo) {
        await safeSend(from, 'Invalid or inactive coupon.');
        await sendHome(from, 'Choose next action:');
        return;
      }
      session.coupon = { code: promo.code, percent: promo.percent };
      await sessionRef.set({ ...session, updatedAt: Date.now() });
      await safeSend(from, `✅ Coupon applied: ${promo.code} (${promo.percent}% OFF).`);
      await sendHome(from, 'Proceed to checkout or continue shopping:');
      return;
    }

    // Remove from cart
    if (id.startsWith('remove:')) {
      const idxStr = id.split(':')[1];
      if (idxStr === 'done') {
        await safeSend(from, 'Done removing.');
        await sendCartSummary(from);
        await sendHome(from, 'What next?');
        return;
      }
      const i = parseInt(idxStr, 10);
      const cart = await getCart(from);
      const items = cart.items || [];
      if (Number.isFinite(i) && items[i]) {
        items.splice(i, 1);
        await setCart(from, { items });
        await safeSend(from, 'Item removed.');
        await sendRemoveFromCartList(from); // allow removing more
        return;
      }
      await safeSend(from, 'Invalid selection.');
      await sendCartSummary(from);
      await sendHome(from, 'Choose next action:');
      return;
    }

    // Fallback to home
    await sendHome(from);
    return;
  }

  // Handle interactive button replies (payments + address confirm)
  if (type === 'interactive' && message.interactive?.type === 'button_reply') {
    const id = message.interactive.button_reply?.id || '';

    // Address confirm buttons
    if (id === 'addr_save' || id === 'addr_edit') {
      const s = await sessionRef.get();
      const sess = s.exists ? s.data() : {};
      const temp = sess.tempAddress || '';
      if (id === 'addr_save' && temp) {
        await saveUserAddress(from, temp);
        await sessionRef.set({ step: '', tempAddress: '', updatedAt: Date.now() }, { merge: true });
        await safeSend(from, '✅ Address saved.');
        await sendHome(from, 'What would you like to do next?');
        return;
      }
      // edit
      await sessionRef.set({ ...sess, step: 'collecting_address', tempAddress: '', updatedAt: Date.now() });
      await safeSend(from, 'Okay, please send your full address again.\nExample: "House 12, MG Road, Indore 452001"');
      await sendHome(from, 'You can continue other things meanwhile:');
      return;
    }

    // Payments
    if (id.startsWith('pay_upi:')) {
      const orderId = id.split(':')[1];
      const o = await db.collection('orders').doc(orderId).get();
      if (!o.exists) {
        await safeSend(from, 'Order not found.');
        await sendHome(from, 'Choose next action:');
        return;
      }
      const data = o.data();
      const amount = Number(data?.totals?.finalTotal ?? data?.total ?? 0);
      const upi = `upi://pay?pa=merchant@upi&pn=CloudKitchen&am=${amount}&tn=Order%20${orderId}`;
      await safeSend(from, `UPI Link:\n${upi}\nOpen this link in your UPI app to pay.`);
      await sendButtons(from, 'When done:', [
        { id: `mark_paid:${orderId}`, title: 'I’ve paid' },
        { id: 'home:track', title: 'Track' },
        { id: 'home:support', title: 'Support' },
      ]);
      return;
    }
    if (id.startsWith('pay_razor:')) {
      const orderId = id.split(':')[1];
      const ref = db.collection('orders').doc(orderId);
      const doc = await ref.get();
      if (!doc.exists) {
        await safeSend(from, 'Order not found.');
        await sendHome(from, 'Choose next action:');
        return;
      }
      const razorpayOrderId = 'razor_' + Math.random().toString(36).slice(2, 12);
      await ref.set(
        {
          payment: { ...(doc.data().payment || {}), method: 'Razorpay', status: 'pending', razorpayOrderId },
          status: 'pending_payment',
          updatedAt: nowIso(),
        },
        { merge: true }
      );
      await safeSend(from, `Razorpay Order ID: ${razorpayOrderId}\n(After real integration, payment confirmation will be automatic.)`);
      await sendButtons(from, 'When done:', [
        { id: `mark_paid:${orderId}`, title: 'I’ve paid' },
        { id: 'home:track', title: 'Track' },
        { id: 'home:support', title: 'Support' },
      ]);
      return;
    }
    if (id.startsWith('pay_cod:')) {
      const orderId = id.split(':')[1];
      const ref = db.collection('orders').doc(orderId);
      const doc = await ref.get();
      if (!doc.exists) {
        await safeSend(from, 'Order not found.');
        await sendHome(from, 'Choose next action:');
        return;
      }
      const o = doc.data();
      const now = nowIso();
      await ref.set(
        {
          payment: { ...(o.payment || {}), method: 'COD', status: 'pending' },
          status: 'confirmed',
          updatedAt: now,
          statusHistory: [ ...(o.statusHistory || []), { status: 'confirmed', at: now } ],
        },
        { merge: true }
      );
      await safeSend(from, '✅ COD selected. Your order is confirmed!');
      await safeSend(from, `🎥 Live kitchen:\n${buildLiveUrl(orderId, from)}`);
      await notifyAdmin(`🆕 COD Confirmed\nID: ${orderId}\nFrom: ${from}\nTotal: ₹${Number(o?.totals?.finalTotal ?? o?.total ?? 0)}`);
      await sendHome(from, 'You can track your order or do more:');
      return;
    }
    if (id.startsWith('mark_paid:')) {
      const orderId = id.split(':')[1];
      await markOrderPaidAndNotify(orderId, from);
      return;
    }

    // If button maps to home action
    if (id.startsWith('home:')) {
      await handleIncoming({
        entry: [{ changes: [{ value: { messages: [{ from, type: 'interactive', interactive: { type: 'list_reply', list_reply: { id } } }] }}]}]},
      });
      return;
    }

    await sendHome(from);
    return;
  }

  // Address capture (typed message only) — polite and smart
  if (session.step === 'collecting_address' && type === 'text') {
    // If greeting/short chit-chat, don't scold; just guide and show options
    if (isGreeting(text)) {
      await safeSend(from, 'No worries — whenever you’re ready, please send your full address in one message.\nExample: "House 12, MG Road, Indore 452001"');
      await sendHome(from, 'Meanwhile, you can continue:');
      return;
    }

    // If looks like a real address → confirm with buttons
    if (looksLikeAddress(text)) {
      session.tempAddress = text;
      await sessionRef.set({ ...session, updatedAt: Date.now() });
      await sendButtons(from, `Save this address?\n${text}`, [
        { id: 'addr_save', title: 'Save' },
        { id: 'addr_edit', title: 'Change' },
        { id: 'home:menu', title: 'Menu' },
      ]);
      return;
    }

    // Otherwise, gentle hint (rate-limited) + Show Options
    const nowTs = Date.now();
    const last = Number(session.addrHintShownAt || 0);
    if (!last || nowTs - last > 30000) {
      await safeSend(from, 'Address seems incomplete. Please send your full address (house, street, city, pincode).\nExample: "House 12, MG Road, Indore 452001"');
      session.addrHintShownAt = nowTs;
      await sessionRef.set({ ...session, updatedAt: nowTs });
    }
    await sendHome(from, 'You can continue other actions too:');
    return;
  }

  // Entry points
  if (['hi', 'hello', 'start', 'menu', 'help'].includes(lower)) {
    await sendHome(from);
    return;
  }

  // Default
  await sendHome(from);
}

// ============ Track & Reorder ============
async function handleTrack(userId, showAfter = false) {
  let latest;
  try {
    const snap = await db.collection('orders').where('userId', '==', userId).orderBy('createdAt', 'desc').limit(1).get();
    latest = snap.empty ? null : snap.docs[0];
  } catch {
    const s = await db.collection('orders').where('userId', '==', userId).get();
    if (s.empty) latest = null;
    else latest = s.docs.sort((a, b) => String(b.data().createdAt || '').localeCompare(String(a.data().createdAt || '')))[0];
  }
  if (!latest) {
    await safeSend(userId, 'No recent orders found.');
    await sendHome(userId, 'What next?');
    return;
  }
  const o = latest.data();
  const total = Number(o?.totals?.finalTotal ?? o?.total ?? 0);
  await safeSend(userId, `Order #${latest.id.slice(-5)} status: ${o.status}\nTotal: ₹${total}\nETA: ${o.deliveryETA || 'N/A'}\nRider: ${o.deliveryPerson || 'N/A'}\nAddress: ${o.deliveryAddress || '-'}`);
  if (showAfter) await sendHome(userId, 'Need anything else?');
}
async function handleReorder(userId) {
  let latest;
  try {
    const snap = await db.collection('orders').where('userId', '==', userId).orderBy('createdAt', 'desc').limit(1).get();
    latest = snap.empty ? null : snap.docs[0];
  } catch {
    const s = await db.collection('orders').where('userId', '==', userId).get();
    if (s.empty) latest = null;
    else latest = s.docs.sort((a, b) => String(b.data().createdAt || '').localeCompare(String(a.data().createdAt || '')))[0];
  }
  if (!latest) {
    await safeSend(userId, 'No recent orders to reorder.');
    await sendHome(userId, 'What next?');
    return;
  }
  const prev = latest.data();
  const items = Array.isArray(prev.items) ? prev.items : [];
  if (!items.length) {
    await safeSend(userId, 'Last order has no items.');
    await sendHome(userId, 'Choose another action:');
    return;
  }
  const docs = await Promise.all(items.map((ci) => db.collection('menu').doc(ci.itemId).get()));
  let baseTotal = 0;
  items.forEach((ci, idx) => {
    const m = docs[idx].exists ? docs[idx].data() : { price: 0 };
    baseTotal += (m.price || 0) * (ci.qty || 1);
  });
  const now = nowIso();
  const ref = await db.collection('orders').add({
    userId,
    items,
    totals: { baseTotal, finalTotal: baseTotal },
    total: baseTotal,
    payment: { method: 'unknown', status: 'pending' },
    status: 'pending_payment',
    statusHistory: [{ status: 'pending_payment', at: now }],
    deliveryAddress: prev.deliveryAddress || '',
    createdAt: now,
    updatedAt: now,
    reorderOf: latest.id,
  });
  await safeSend(userId, `Reorder created (ID: ${ref.id}). Select payment from options.`);
  await notifyAdmin(`🆕 Reorder\nID: ${ref.id}\nFrom: ${userId}\nTotal: ₹${baseTotal}`);
  await sendPaymentButtons(userId, ref.id);
  await sendHome(userId, 'You can open Show Options any time.');
}

module.exports = {
  handleIncoming,
  sendHome,
  sendMenuList,
  sendCouponsPicker,
  sendMessage,
  markOrderPaidAndNotify,
};