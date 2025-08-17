// WhatsApp service — Single "Show Options" list, Multi‑Add menu with "✓ Done Adding",
// Cart de-dup + Adjust Quantity + tap‑to‑remove + Undo, gentle address flow,
// Smart savings (coupon + points), payments (UPI/Razor/COD), CSAT prompt + points bonus,
// keep‑alive agents.

const http = require('http');
const https = require('https');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');

const { db } = require('../services/firebase');

const WA_VERSION = process.env.WA_API_VERSION || 'v20.0';
const BASE = `https://graph.facebook.com/${WA_VERSION}`;
const OWNER_WA_NUMBER = (process.env.OWNER_WA_NUMBER || '').trim();
const LIVE_BASE = process.env.LIVE_VIDEO_BASE_URL || 'https://your-domain.com/live';
const FEEDBACK_BONUS_POINTS = Number(process.env.FEEDBACK_BONUS_POINTS || 5);
const POINT_VALUE = Number(process.env.POINT_VALUE || 1); // 1 point = ₹1
const EARN_RATE = Number(process.env.EARN_RATE || 0.02); // earn 2% points on paid total
const CSAT_DELAY_SECONDS = Number(process.env.CSAT_DELAY_SECONDS || 20);

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
async function sendHome(to, body = 'Kya karna chahoge?') {
  const rows = [
    { id: 'home:menu', title: '🍽️ Browse Menu', description: 'Add dishes to cart' },
    { id: 'home:cart', title: '🛒 View Cart', description: 'See or edit your cart' },
    { id: 'home:checkout', title: '✅ Checkout', description: 'Place your order' },
    { id: 'home:track', title: '📍 Track Order', description: 'Live status updates' },
    { id: 'home:address', title: '📍 Manage Address', description: 'Save/change address' },
    { id: 'home:coupons', title: '🏷️ Apply Coupon', description: 'Use available discounts' },
    { id: 'home:points', title: '⭐ Loyalty Points', description: 'Check & redeem' },
    { id: 'home:reorder', title: '🔁 Reorder', description: 'Repeat last order' },
    { id: 'home:subscribe', title: '🗓️ Subscriptions', description: 'Weekly/Monthly tiffin' },
    { id: 'home:support', title: '🙋 Talk to Agent', description: 'Get help from a human' },
  ];
  await sendInteractiveList(to, 'Cloud Kitchen', body, 'Main Menu', rows, 'Show Options');
}

// ============ Heuristics ============
function isGreeting(msg) {
  const s = String(msg || '').trim().toLowerCase();
  return /^(hi|hii+|hello|hey|hlo|yo|namaste|namaskar|ok|okay|thanks|thank you|thx|hola|yo+|haan|hmm|hii)$/.test(s);
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

// ============ Cart normalization (de-dup) ============
function normalizeItems(items) {
  const byId = new Map();
  for (const it of Array.isArray(items) ? items : []) {
    const key = it.itemId;
    if (!key) continue;
    const existing = byId.get(key);
    if (existing) {
      existing.qty = (existing.qty || 0) + (Number(it.qty) || 0) || 1;
    } else {
      byId.set(key, { itemId: key, qty: Number(it.qty) || 1, customization: it.customization || '' });
    }
  }
  return Array.from(byId.values());
}

// ============ Menu (Multi-add simulation) ============
async function sendMenuList(to) {
  const snap = await db.collection('menu').where('available', '==', true).get();
  const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const rows = [
    { id: 'menu:done', title: '✓ Done Adding', description: 'Proceed to next step' },
    ...items.map((m) => ({
      id: `menu:${m.id}`,
      title: `${m.name}`,
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
  const cart = doc.exists ? doc.data() : { items: [] };
  const normalized = { items: normalizeItems(cart.items || []) };
  if (JSON.stringify(normalized.items) !== JSON.stringify(cart.items || [])) {
    await setCart(userId, normalized);
  }
  return normalized;
}
async function setCart(userId, cart) {
  const items = normalizeItems(cart.items || []);
  return db.collection('carts').doc(userId).set({ items, updatedAt: nowIso() }, { merge: true });
}
async function computeCartTotals(userId) {
  const cart = await getCart(userId);
  const items = cart.items || [];
  const menuDocs = await Promise.all(items.map((ci) => db.collection('menu').doc(ci.itemId).get()));
  let subtotal = 0;
  items.forEach((ci, idx) => {
    const m = menuDocs[idx].exists ? menuDocs[idx].data() : { price: 0 };
    subtotal += (m.price || 0) * (ci.qty || 1);
  });
  return { items, subtotal, menuDocs };
}
async function sendMiniCart(userId) {
  const { items, subtotal } = await computeCartTotals(userId);
  const count = items.reduce((s, i) => s + (i.qty || 0), 0);
  await safeSend(userId, `🧺 Cart: ${count} items • ₹${subtotal}`);
}
async function sendCartSummary(userId) {
  const { items, subtotal, menuDocs } = await computeCartTotals(userId);
  if (!items.length) {
    await safeSend(userId, '🛒 Your cart is empty.');
    return;
  }
  const lines = items.map((ci, idx) => {
    const m = menuDocs[idx].exists ? menuDocs[idx].data() : { name: 'Item', price: 0 };
    const amt = (m.price || 0) * (ci.qty || 1);
    return `${m.name} x${ci.qty}${ci.customization ? ' (' + ci.customization + ')' : ''} - ₹${amt}`;
  });
  await safeSend(userId, `🛒 Your Cart\n\n${lines.join('\n')}\n\nSubtotal: ₹${subtotal}`);
}
async function sendCartOptionsList(to) {
  const rows = [
    { id: 'cart:opts:qty', title: '➕➖ Adjust Quantity', description: 'Increase or decrease items' },
    { id: 'cart:opts:remove', title: '🗑️ Remove from Cart', description: 'Remove items' },
    { id: 'home:checkout', title: '✅ Checkout', description: 'Place your order' },
    { id: 'home:menu', title: '🍽️ Back to Menu', description: 'Add more items' },
  ];
  await sendInteractiveList(to, 'Cart Options', 'Choose what to do with your cart:', 'Actions', rows, 'Show Options');
}
async function sendRemoveFromCartList(to) {
  const { items } = await getCart(to);
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
      return { id: `remove:id:${ci.itemId}`, title: `Remove ${m.name} (x${ci.qty})`, description: ci.customization || '' };
    }),
  ];
  await sendInteractiveList(to, 'Remove from Cart', 'Select an item to remove:', 'Your Items', rows, 'Show Options');
}
async function sendAdjustQtyList(to) {
  const { items } = await getCart(to);
  if (!items.length) {
    await safeSend(to, 'Cart is empty.');
    await sendHome(to, 'What next?');
    return;
  }
  const menuDocs = await Promise.all(items.map((ci) => db.collection('menu').doc(ci.itemId).get()));
  const rows = [
    { id: 'qty:done', title: '✓ Done Adjusting', description: 'Go back' },
    ...items.flatMap((ci, idx) => {
      const m = menuDocs[idx].exists ? menuDocs[idx].data() : { name: 'Item' };
      return [
        { id: `qty:inc:${ci.itemId}`, title: `➕ ${m.name}`, description: `Increase (now x${ci.qty})` },
        { id: `qty:dec:${ci.itemId}`, title: `➖ ${m.name}`, description: `Decrease (now x${ci.qty})` },
      ];
    }),
  ];
  await sendInteractiveList(to, 'Adjust Quantity', 'Tap to increase or decrease quantity:', 'Your Items', rows, 'Show Options');
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
    await safeSend(to, 'Is waqt koi coupons available nahi hai.');
    await sendHome(to, 'Agla step choose karein:');
    return;
  }
  const rows = promos.map((p) => ({
    id: `coupon:${p.code}`,
    title: `${p.code} — ${p.percent}% OFF`,
    description: p.description || '',
  }));
  await sendInteractiveList(to, 'Coupons', 'Koi coupon choose karo (optional):', 'Available Coupons', rows, 'Show Options');
}
async function getUserPoints(userId) {
  const u = await db.collection('users').doc(userId).get();
  return Number(u.exists ? (u.data()?.loyalty?.points || 0) : 0);
}
async function setUserPoints(userId, points) {
  await db.collection('users').doc(userId).set({ loyalty: { points: Math.max(0, Math.floor(points)) }, updatedAt: nowIso() }, { merge: true });
}

// ============ Payments ============
function buildLiveUrl(orderId, userId) {
  return `${LIVE_BASE}?order=${encodeURIComponent(orderId)}&u=${encodeURIComponent(userId)}`;
}
async function sendPaymentButtons(to, orderId) {
  await sendButtons(to, 'Payment choose karein:', [
    { id: `pay_upi:${orderId}`, title: 'UPI' },
    { id: `pay_razor:${orderId}`, title: 'Razorpay' },
    { id: `pay_cod:${orderId}`, title: 'COD' },
  ]);
}
async function markOrderPaidAndNotify(orderId, userId) {
  const ref = db.collection('orders').doc(orderId);
  const doc = await ref.get();
  if (!doc.exists) {
    await safeSend(userId, 'Order nahi mila.');
    return;
  }
  const o = doc.data();
  const now = nowIso();

  const final = Number(o?.totals?.finalTotal ?? o?.total ?? 0);
  const redeemed = Number(o?.loyalty?.redeemedPoints || 0);
  const curr = await getUserPoints(userId);
  const afterDeduct = curr - redeemed;
  const earn = Math.floor(final * EARN_RATE);
  await setUserPoints(userId, afterDeduct + earn);

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
  await safeSend(userId, '✅ Payment received! Aapka order confirm ho gaya.');
  await safeSend(userId, `🎥 Live kitchen:\n${buildLiveUrl(orderId, userId)}`);
  await sendButtons(userId, 'Quick actions:', [
    { id: 'home:track', title: 'Track' },
    { id: 'home:support', title: 'Support' },
    { id: 'home:menu', title: 'Menu' },
  ]);
  scheduleCSAT(userId, orderId, CSAT_DELAY_SECONDS);
}
async function notifyAdmin(text) {
  if (!OWNER_WA_NUMBER) return;
  await safeSend(OWNER_WA_NUMBER, text);
}

// ============ CSAT (feedback) ============
const csatTimers = new Map(); // userId -> timeout

async function sendCSATPrompt(userId, orderId) {
  const sessionRef = db.collection('sessions').doc(userId);
  await sessionRef.set({ csatPendingFor: orderId, updatedAt: Date.now() }, { merge: true });

  const rows = [
    { id: `csat:5:${orderId}`, title: '⭐️⭐️⭐️⭐️⭐️ 5', description: 'Loved it' },
    { id: `csat:4:${orderId}`, title: '⭐️⭐️⭐️⭐️ 4', description: 'Good' },
    { id: `csat:3:${orderId}`, title: '⭐️⭐️⭐️ 3', description: 'Okay' },
    { id: `csat:2:${orderId}`, title: '⭐️⭐️ 2', description: 'Not great' },
    { id: `csat:1:${orderId}`, title: '⭐️ 1', description: 'Bad' },
  ];
  await sendInteractiveList(userId, 'Quick feedback', 'Rate your experience (1–5):', 'Ratings', rows, 'Rate');
}
function scheduleCSAT(userId, orderId, delaySeconds = 20) {
  try { clearTimeout(csatTimers.get(userId)); } catch {}
  const t = setTimeout(() => {
    sendCSATPrompt(userId, orderId).catch(() => {});
    csatTimers.delete(userId);
  }, Math.max(5, delaySeconds) * 1000);
  csatTimers.set(userId, t);
}
async function handleCSATSelection(userId, id) {
  const parts = id.split(':');
  const rating = Number(parts[1]);
  const orderId = parts[2];
  const sessionRef = db.collection('sessions').doc(userId);
  await sessionRef.set({ csatPendingFor: '', csatAwaitingText: { orderId, rating }, updatedAt: Date.now() }, { merge: true });

  await db.collection('feedback').add({
    userId,
    orderId,
    rating,
    comment: '',
    createdAt: nowIso(),
  });

  const curr = await getUserPoints(userId);
  await setUserPoints(userId, curr + FEEDBACK_BONUS_POINTS);

  if (rating <= 3) {
    await safeSend(userId, `😔 Sorry! Kya better kar sakte the? Short message bhej do.`);
  } else {
    await safeSend(userId, `Shukriya! 🙏 Koi chhota sa comment dena chaho to bhej do. (Optional)`);
  }
  await sendHome(userId, 'Need anything else?');
}

// ============ Checkout flow ============
async function startCheckoutFlow(userId) {
  const cart = await getCart(userId);
  const items = cart.items || [];
  if (!items.length) {
    await safeSend(userId, 'Aapka cart khaali hai.');
    await sendHome(userId, 'Kya karna chahoge?');
    return;
  }

  const profile = await getUserProfile(userId);
  const def = getDefaultAddress(profile);
  if (!def?.address) {
    await safeSend(userId, '📍 Apna full delivery address ek hi message me bhejein.\nExample: "House 12, MG Road, Indore 452001"');
    await db.collection('sessions').doc(userId).set({ step: 'collecting_address', addrStartedAt: Date.now(), updatedAt: Date.now() }, { merge: true });
    return;
  }

  const { subtotal } = await computeCartTotals(userId);
  let baseTotal = subtotal;

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
      await safeSend(userId, `🎉 Coupon auto-applied: ${p.code} (${p.percent}% OFF)`);
      finalTotal -= Math.round(finalTotal * (p.percent / 100));
    } else if (promos.length > 1) {
      await safeSend(userId, `🏷️ Multiple coupons available — "Apply Coupon" me jaa kar choose kar sakte ho. Skipping for now.`);
    }
  } else {
    finalTotal -= Math.round(finalTotal * (Number(session.coupon.percent || 0) / 100));
  }

  const userPts = await getUserPoints(userId);
  if (!session.redeemPoints && userPts > 0) {
    const redeemableValue = Math.min(userPts * POINT_VALUE, finalTotal);
    if (redeemableValue > 0) {
      await sessionRef.set({ ...session, pendingRedeemMax: Math.floor(redeemableValue / POINT_VALUE), updatedAt: Date.now() });
      await sendButtons(userId, `⭐ Aapke paas ${userPts} points (₹${userPts * POINT_VALUE}). Redeem karna chahoge?`, [
        { id: 'btn_redeem_pts', title: 'Redeem' },
        { id: 'btn_skip_pts', title: 'Skip' },
        { id: 'home:coupons', title: 'Coupons' },
      ]);
      await safeSend(userId, `Tip: Points/Coupons optional hain — aap chahein to bina inke bhi checkout kar sakte ho.`);
      return;
    }
  }

  const orderId = uuidv4();
  const now = nowIso();

  const redeemedPoints = Number(session.redeemPoints || 0);
  const redeemValue = redeemedPoints * POINT_VALUE;
  const appliedTotal = Math.max(0, finalTotal - redeemValue);

  await db.collection('orders').doc(orderId).set({
    userId,
    items,
    totals: { baseTotal, promo: session.coupon || null, finalTotal, pointsRedeemValue: redeemValue },
    total: appliedTotal,
    loyalty: redeemedPoints ? { redeemedPoints, pointValue: POINT_VALUE } : null,
    payment: { method: 'unknown', status: 'pending' },
    status: 'pending_payment',
    statusHistory: [{ status: 'pending_payment', at: now }],
    deliveryAddress: def.address || '',
    createdAt: now,
    updatedAt: now,
    etaMinutes: 30,
  });

  await setCart(userId, { items: [] });

  await safeSend(userId, `🎉 Order ban gaya! ID: ${orderId}\nTotal: ₹${appliedTotal}\nETA: ~30 min`);
  await notifyAdmin(`🆕 New Order\nID: ${orderId}\nFrom: ${userId}\nFinal: ₹${appliedTotal}`);
  await sendPaymentButtons(userId, orderId);
  await sendHome(userId, 'Kabhi bhi "Show Options" khol sakte ho:');
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
    await safeSend(userId, 'Koi recent order nahi mila.');
    await sendHome(userId, 'Agla step?');
    return;
  }
  const o = latest.data();
  const total = Number(o?.total ?? o?.totals?.finalTotal ?? 0);
  await safeSend(userId, `Order #${latest.id.slice(-5)} status: ${o.status}\nTotal: ₹${total}\nETA: ${o.etaMinutes || 'N/A'} min\nAddress: ${o.deliveryAddress || '-'}`);
  if (showAfter) await sendHome(userId, 'Kuchh aur chahiye?');
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
    await safeSend(userId, 'Reorder ke liye koi recent order nahi mila.');
    await sendHome(userId, 'Agla step?');
    return;
  }
  const prev = latest.data();
  const items = Array.isArray(prev.items) ? prev.items : [];
  if (!items.length) {
    await safeSend(userId, 'Last order me items nahi mile.');
    await sendHome(userId, 'Kuchh aur try karein:');
    return;
  }
  const { subtotal } = await computeCartTotals(userId);
  const now = nowIso();
  const ref = await db.collection('orders').add({
    userId,
    items,
    totals: { baseTotal: subtotal, finalTotal: subtotal },
    total: subtotal,
    payment: { method: 'unknown', status: 'pending' },
    status: 'pending_payment',
    statusHistory: [{ status: 'pending_payment', at: now }],
    deliveryAddress: prev.deliveryAddress || '',
    createdAt: now,
    updatedAt: now,
    reorderOf: latest.id,
    etaMinutes: 30,
  });
  await safeSend(userId, `Reorder ready (ID: ${ref.id}). Payment choose karein.`);
  await notifyAdmin(`🆕 Reorder\nID: ${ref.id}\nFrom: ${userId}\nTotal: ₹${subtotal}`);
  await sendPaymentButtons(userId, ref.id);
  await sendHome(userId, 'Options open rahenge.');
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
    await safeSend(from, 'Thanks! Kabhi bhi message karo aur order karo.');
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
    await sendHome(from, 'Agla step choose karein:');
    return;
  }

  // Sessions
  const sessionRef = db.collection('sessions').doc(from);
  const sSnap = await sessionRef.get();
  let session = sSnap.exists ? sSnap.data() : {};
  if (!session.updatedAt) session.updatedAt = Date.now();

  // 1) CSAT optional text capture — handle BEFORE anything else
  if (type === 'text' && session.csatAwaitingText && session.csatAwaitingText.orderId) {
    const obj = session.csatAwaitingText;
    await db.collection('feedback').add({
      userId: from,
      orderId: obj.orderId,
      rating: obj.rating,
      comment: text.slice(0, 500),
      createdAt: nowIso(),
    });
    await sessionRef.set({ ...session, csatAwaitingText: null, updatedAt: Date.now() });
    await safeSend(from, `Shukriya feedback ke liye! 🎉 Aapko +${FEEDBACK_BONUS_POINTS} points mil gaye.`);
    await sendHome(from, 'Aur kuchh?');
    return;
  }

  // 2) Global greeting — ALWAYS just open Show Options (never show address prompt)
  if (type === 'text' && isGreeting(text)) {
    // If user was in address step, silently exit it
    if (session.step === 'collecting_address') {
      await sessionRef.set({ ...session, step: '', updatedAt: Date.now() });
    }
    await sendHome(from);
    return;
  }

  // 3) Handle interactive list replies (includes CSAT rating)
  if (type === 'interactive' && message.interactive?.type === 'list_reply') {
    const id = message.interactive.list_reply?.id || '';

    // CSAT rating
    if (id.startsWith('csat:')) {
      await handleCSATSelection(from, id);
      return;
    }

    // Home actions
    if (id.startsWith('home:')) {
      const key = id.split(':')[1];

      if (key === 'menu') {
        await sendMenuList(from);
        return;
      }
      if (key === 'cart') {
        await sendCartSummary(from);
        await sendCartOptionsList(from);
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
          await safeSend(from, `Aapka default address:\n${def.address}\n\nNaya address bhejna ho to ek hi message me bhejein.`);
        } else {
          await safeSend(from, '📍 Please send your full delivery address in one message.\nExample: "House 12, MG Road, Indore 452001"');
        }
        await sessionRef.set({ ...session, step: 'collecting_address', addrStartedAt: Date.now(), updatedAt: Date.now() });
        await sendHome(from, 'Meanwhile, Show Options khul sakta hai.');
        return;
      }
      if (key === 'coupons') {
        await sendCouponsPicker(from);
        return;
      }
      if (key === 'points') {
        const pts = await getUserPoints(from);
        await safeSend(from, `⭐ Aapke points: ${pts} (₹${pts * POINT_VALUE})`);
        await sendHome(from, 'Agla step choose karein:');
        return;
      }
      if (key === 'reorder') {
        await handleReorder(from);
        return;
      }
      if (key === 'subscribe') {
        const { items, subtotal, menuDocs } = await computeCartTotals(from);
        if (!items.length) {
          await safeSend(from, 'Cart khaali hai. Pehle items add karein.');
          await sendMenuList(from);
          return;
        }
        const firstMenu = menuDocs[0].exists ? menuDocs[0].data() : { name: 'Item' };
        await safeSend(from, `🍱 Weekly Tiffin Preview\nItems: ${items.length} (e.g., ${firstMenu.name})\nEst. weekly cost: ~₹${subtotal * 5}`);
        await sendButtons(from, 'Subscription start karein?', [
          { id: 'subs_confirm', title: 'Confirm' },
          { id: 'subs_cancel', title: 'Cancel' },
          { id: 'home:menu', title: 'Menu' },
        ]);
        return;
      }
      if (key === 'support') {
        await db.collection('support').add({
          userId: from, message: 'Agent requested', status: 'open', createdAt: nowIso(), updatedAt: nowIso(),
        });
        await safeSend(from, 'Agent jald contact karega. 😊');
        await notifyAdmin(`🚨 Agent requested by ${from}`);
        await sendHome(from, 'Tab tak aap continue kar sakte ho:');
        return;
      }
    }

    // Menu multi-add
    if (id.startsWith('menu:')) {
      const item = id.split(':')[1];
      if (item === 'done') {
        await safeSend(from, 'Great! Ab aap checkout kar sakte ho.');
        await sendHome(from, 'Open Show Options to continue:');
        return;
      }
      const mDoc = await db.collection('menu').doc(item).get();
      if (!mDoc.exists) {
        await safeSend(from, 'Item nahi mila.');
        await sendMenuList(from);
        return;
      }
      const m = mDoc.data();
      if (m.available === false) {
        await safeSend(from, 'Item out of stock hai.');
        await sendMenuList(from);
        return;
      }
      const cart = await getCart(from);
      const ex = (cart.items || []).find((i) => i.itemId === item);
      if (ex) ex.qty = (ex.qty || 1) + 1;
      else (cart.items = cart.items || []).push({ itemId: item, qty: 1, customization: '' });
      await setCart(from, cart);
      await safeSend(from, `✅ ${m.name} add ho gaya.`);
      await sendMiniCart(from);
      await sendMenuList(from);
      return;
    }

    // Coupon selected
    if (id.startsWith('coupon:')) {
      const code = id.split(':')[1];
      const promo = await fetchActivePromoByCode(code);
      if (!promo) {
        await safeSend(from, 'Coupon invalid ya inactive hai.');
        await sendHome(from, 'Agla step choose karein:');
        return;
      }
      session.coupon = { code: promo.code, percent: promo.percent };
      await sessionRef.set({ ...session, updatedAt: Date.now() });
      await safeSend(from, `✅ Coupon applied: ${promo.code} (${promo.percent}% OFF).`);
      await sendHome(from, 'Checkout ya shopping continue karein:');
      return;
    }

    // Remove from cart
    if (id.startsWith('remove:')) {
      const key = id.split(':')[1];
      if (key === 'done') {
        await safeSend(from, 'Done removing.');
        await sendCartSummary(from);
        await sendCartOptionsList(from);
        return;
      }
      const itemId = id.split(':')[2];
      const cart = await getCart(from);
      const items = cart.items || [];
      const idx = items.findIndex((x) => x.itemId === itemId);
      if (idx >= 0) {
        const removedQty = items[idx].qty || 1;
        items.splice(idx, 1);
        await setCart(from, { items });
        const undo = { itemId, qty: removedQty, expiresAt: Date.now() + 15000 };
        await sessionRef.set({ ...session, lastUndo: undo, updatedAt: Date.now() });
        await safeSend(from, '🗑️ Item removed.');
        await sendMiniCart(from);
        await sendButtons(from, `Undo karna hai? (${Math.ceil((undo.expiresAt - Date.now())/1000)}s)`, [
          { id: 'undo_remove', title: '↩️ Undo' },
          { id: 'home:cart', title: 'Cart' },
        ]);
        return;
      }
      await safeSend(from, 'Selection invalid.');
      await sendCartSummary(from);
      await sendCartOptionsList(from);
      return;
    }

    // Adjust quantity
    if (id.startsWith('qty:')) {
      const parts = id.split(':'); // qty:inc:itemId OR qty:dec:itemId
      const act = parts[1];
      const itemId = parts[2];
      const cart = await getCart(from);
      const it = (cart.items || []).find((x) => x.itemId === itemId);
      if (!it) {
        await safeSend(from, 'Item cart me nahi mila.');
        await sendAdjustQtyList(from);
        return;
      }
      if (act === 'inc') it.qty = (it.qty || 1) + 1;
      if (act === 'dec') it.qty = Math.max(0, (it.qty || 1) - 1);
      if (it.qty === 0) {
        const undo = { itemId, qty: 1, expiresAt: Date.now() + 15000 };
        await sessionRef.set({ ...session, lastUndo: undo, updatedAt: Date.now() });
        cart.items = cart.items.filter((x) => x.itemId !== itemId);
        await safeSend(from, 'Item removed (qty 0).');
      }
      await setCart(from, cart);
      await sendMiniCart(from);
      await sendAdjustQtyList(from);
      return;
    }

    if (id === 'qty:done') {
      await sendCartSummary(from);
      await sendCartOptionsList(from);
      return;
    }

    await sendHome(from);
    return;
  }

  // 4) Handle interactive button replies
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
        await sendHome(from, 'Agla kya karna chahoge?');
        return;
      }
      await sessionRef.set({ ...sess, step: 'collecting_address', tempAddress: '', addrStartedAt: Date.now(), updatedAt: Date.now() });
      await safeSend(from, 'Theek hai, naya address ek baar me bhejein.\nExample: "House 12, MG Road, Indore 452001"');
      await sendHome(from, 'Tab tak aap continue kar sakte ho:');
      return;
    }

    // Undo remove
    if (id === 'undo_remove') {
      const s = await sessionRef.get();
      const sess = s.exists ? s.data() : {};
      const undo = sess.lastUndo;
      if (undo && Date.now() < Number(undo.expiresAt)) {
        const cart = await getCart(from);
        const ex = (cart.items || []).find((i) => i.itemId === undo.itemId);
        if (ex) ex.qty = (ex.qty || 0) + (undo.qty || 1);
        else (cart.items = cart.items || []).push({ itemId: undo.itemId, qty: undo.qty || 1, customization: '' });
        await setCart(from, cart);
        await sessionRef.set({ ...sess, lastUndo: null, updatedAt: Date.now() });
        await safeSend(from, '↩️ Undo ho gaya. Item wapas aa gaya.');
        await sendMiniCart(from);
        await sendCartOptionsList(from);
      } else {
        await safeSend(from, 'Undo window khatam ho gaya.');
        await sendCartOptionsList(from);
      }
      return;
    }

    // Points redeem
    if (id === 'btn_redeem_pts' || id === 'btn_skip_pts') {
      const s = await sessionRef.get();
      const sess = s.exists ? s.data() : {};
      if (id === 'btn_redeem_pts') {
        const pts = await getUserPoints(from);
        const maxPts = Math.min(pts, Number(sess.pendingRedeemMax || 0));
        await sessionRef.set({ ...sess, redeemPoints: maxPts, pendingRedeemMax: 0, updatedAt: Date.now() });
        await safeSend(from, `✅ ${maxPts} points redeem honge at checkout.`);
      } else {
        await sessionRef.set({ ...sess, pendingRedeemMax: 0, updatedAt: Date.now() });
        await safeSend(from, 'Points redeem skip kiya.');
      }
      await startCheckoutFlow(from);
      return;
    }

    // Subscription confirm/cancel
    if (id === 'subs_confirm' || id === 'subs_cancel') {
      if (id === 'subs_cancel') {
        await safeSend(from, 'Subscription cancel kar diya. No worries 😊');
        await sendHome(from, 'Agla step choose karein:');
        return;
      }
      const { items } = await getCart(from);
      if (!items.length) {
        await safeSend(from, 'Cart khaali hai. Pehle items add karein.');
        await sendHome(from, 'Menu open karein:');
        return;
      }
      const now = nowIso();
      const ref = await db.collection('subscriptions').add({
        userId: from, plan: 'weekly', items, startDate: now.slice(0, 10), status: 'active', notes: '', createdAt: now, updatedAt: now,
      });
      await safeSend(from, `✅ Weekly subscription created. ID: ${ref.id}`);
      await sendHome(from, 'Next kya karein?');
      return;
    }

    // Payments
    if (id.startsWith('pay_upi:')) {
      const orderId = id.split(':')[1];
      const o = await db.collection('orders').doc(orderId).get();
      if (!o.exists) {
        await safeSend(from, 'Order nahi mila.');
        await sendHome(from, 'Agla step choose karein:');
        return;
      }
      const data = o.data();
      const amount = Number(data?.total ?? data?.totals?.finalTotal ?? 0);
      const upi = `upi://pay?pa=merchant@upi&pn=CloudKitchen&am=${amount}&tn=Order%20${orderId}`;
      await safeSend(from, `UPI Link:\n${upi}\nUPI app me open karke pay kar dein.`);
      await sendButtons(from, 'Payment ho gaya?', [
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
        await safeSend(from, 'Order nahi mila.');
        await sendHome(from, 'Agla step choose karein:');
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
      await safeSend(from, `Razorpay Order ID: ${razorpayOrderId}\n(Note: Real integration ke baad auto-confirm ho jayega)`);
      await sendButtons(from, 'Payment ho gaya?', [
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
        await safeSend(from, 'Order nahi mila.');
        await sendHome(from, 'Agla step choose karein:');
        return;
      }
      const o = doc.data();
      const now = nowIso();

      const final = Number(o?.totals?.finalTotal ?? o?.total ?? 0);
      const redeemed = Number(o?.loyalty?.redeemedPoints || 0);
      const curr = await getUserPoints(from);
      const afterDeduct = curr - redeemed;
      const earn = Math.floor(final * EARN_RATE);
      await setUserPoints(from, afterDeduct + earn);

      await ref.set(
        {
          payment: { ...(o.payment || {}), method: 'COD', status: 'pending' },
          status: 'confirmed',
          updatedAt: now,
          statusHistory: [ ...(o.statusHistory || []), { status: 'confirmed', at: now } ],
        },
        { merge: true }
      );
      await safeSend(from, '✅ COD selected. Aapka order confirm ho gaya!');
      await safeSend(from, `🎥 Live kitchen:\n${buildLiveUrl(orderId, from)}`);
      await notifyAdmin(`🆕 COD Confirmed\nID: ${orderId}\nFrom: ${from}\nTotal: ₹${Number(o?.total ?? o?.totals?.finalTotal ?? 0)}`);
      await sendButtons(from, 'Quick actions:', [
        { id: 'home:track', title: 'Track' },
        { id: 'home:support', title: 'Support' },
        { id: 'home:menu', title: 'Menu' },
      ]);
      scheduleCSAT(from, orderId, CSAT_DELAY_SECONDS);
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
        entry: [{ changes: [{ value: { messages: [{ from, type: 'interactive', interactive: { type: 'list_reply', list_reply: { id } } }] }}]}],
      });
      return;
    }

    await sendHome(from);
    return;
  }

  // 5) Address capture — AFTER CSAT and greeting checks
  if (session.step === 'collecting_address' && type === 'text') {
    // Only handle address-looking text; greetings already handled globally
    if (looksLikeAddress(text)) {
      session.tempAddress = text;
      await sessionRef.set({ ...session, updatedAt: Date.now() });
      await sendButtons(from, `Ye address save karein?\n${text}`, [
        { id: 'addr_save', title: 'Save' },
        { id: 'addr_edit', title: 'Change' },
        { id: 'home:menu', title: 'Menu' },
      ]);
      return;
    }

    const nowTs = Date.now();
    const last = Number(session.addrHintShownAt || 0);
    if (!last || nowTs - last > 30000) {
      await safeSend(from, 'Address incomplete lag raha hai. House, Street, City, Pincode sab ek message me bhejein.\nExample: "House 12, MG Road, Indore 452001"');
      session.addrHintShownAt = nowTs;
      await sessionRef.set({ ...session, updatedAt: nowTs });
    }
    await sendHome(from, 'Dusre kaam bhi kar sakte ho:');
    return;
  }

  // Entry points
  if (['start', 'menu', 'help'].includes(lower)) {
    await sendHome(from);
    return;
  }

  // Default
  await sendHome(from);
}

module.exports = {
  handleIncoming,
  sendHome,
  sendMenuList,
  sendCouponsPicker,
  sendMessage,
  markOrderPaidAndNotify,
  sendCSATPrompt,
};