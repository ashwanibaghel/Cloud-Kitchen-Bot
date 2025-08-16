const axios = require('axios');
const db = require('./firebase');
const { extractOrderIntent } = require('./nlp');
const { v4: uuidv4 } = require('uuid');

const WA_VERSION = process.env.WA_API_VERSION || 'v20.0';
const BASE = `https://graph.facebook.com/${WA_VERSION}`;
const LIVE_BASE = process.env.LIVE_VIDEO_BASE_URL || 'https://your-domain.com/live'; // Set in .env

async function waPost(path, data) {
  const url = `${BASE}/${path}`;
  try {
    const res = await axios.post(url, data, {
      headers: {
        Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
        'Content-Type': 'application/json',
      },
      timeout: 10000,
    });
    return res.data;
  } catch (e) {
    const status = e.response?.status;
    const body = e.response?.data;
    console.error('[WhatsApp API Error]', status || '', body ? JSON.stringify(body, null, 2) : e.message);
    throw e;
  }
}

async function sendMessage(to, message, options = {}) {
  const data = {
    messaging_product: 'whatsapp',
    to,
    type: 'text',
    text: { body: message },
    ...options,
  };
  return waPost(`${process.env.WHATSAPP_PHONE_ID}/messages`, data);
}

async function sendVideoLink(to, videoUrl) {
  const data = {
    messaging_product: 'whatsapp',
    to,
    type: 'video',
    video: {
      link: videoUrl,
      caption: 'Here is your live preparation video!',
    },
  };
  return waPost(`${process.env.WHATSAPP_PHONE_ID}/messages`, data);
}

async function sendMenuList(to, menuItems) {
  const sections = [
    {
      title: 'Our Menu',
      rows: menuItems.map((item) => ({
        id: item.id,
        title: item.name,
        description: `₹${item.price} - ${item.description || ''}${item.available ? '' : ' (Out of stock)'}`,
      })),
    },
  ];
  const data = {
    messaging_product: 'whatsapp',
    to,
    type: 'interactive',
    interactive: {
      type: 'list',
      header: { type: 'text', text: 'Cloud Kitchen Menu' },
      body: { text: 'Select an item to add to cart:' },
      action: { button: 'Show Menu', sections },
    },
  };
  return waPost(`${process.env.WHATSAPP_PHONE_ID}/messages`, data);
}

async function sendOrderConfirmationButtons(to, orderId, total) {
  const data = {
    messaging_product: 'whatsapp',
    to,
    type: 'interactive',
    interactive: {
      type: 'button',
      body: { text: `Your total is ₹${total}.\nConfirm order?` },
      action: {
        buttons: [
          { type: 'reply', reply: { id: `confirm_${orderId}`, title: 'Yes' } },
          { type: 'reply', reply: { id: 'cancel', title: 'No' } },
        ],
      },
    },
  };
  return waPost(`${process.env.WHATSAPP_PHONE_ID}/messages`, data);
}

async function sendPromoCode(to, code, description) {
  return sendMessage(to, `🎉 Promo: Use code *${code}* for ${description}!`);
}

async function buildAndSendCartSummary(to) {
  const cartDoc = await db.collection('carts').doc(to).get();
  const items = cartDoc.exists ? cartDoc.data().items || [] : [];
  if (!items.length) {
    await sendMessage(to, '🛒 Your cart is empty. Reply "menu" for options.');
    return;
  }
  let cartMsg = '🛒 Your Cart\n\n';
  let total = 0;
  for (const ci of items) {
    const mi = await db.collection('menu').doc(ci.itemId).get();
    if (mi.exists) {
      const m = mi.data();
      const line = `${m.name} x${ci.qty}${ci.customization ? ' (' + ci.customization + ')' : ''} - ₹${(m.price || 0) * (ci.qty || 1)}\n`;
      cartMsg += line;
      total += (m.price || 0) * (ci.qty || 1);
    }
  }
  cartMsg += `\nTotal: ₹${total}\n\nPress 4 to place order, or 1 to add more.`;
  await sendMessage(to, cartMsg);
}

// ===== Address helpers =====
async function getUserProfile(userId) {
  const doc = await db.collection('users').doc(userId).get();
  return doc.exists ? doc.data() : {};
}
async function saveUserAddress(userId, address) {
  await db.collection('users').doc(userId).set({ address, addressUpdatedAt: Date.now() }, { merge: true });
}
// Simple validator
function isValidAddress(str) {
  if (!str) return false;
  const s = String(str).trim();
  return s.length >= 8; // very basic length check
}

// ===== Live video link builder =====
function buildLiveUrl(orderId, userId) {
  // Keep simple. If you add auth later, append a signed token.
  return `${LIVE_BASE}?order=${encodeURIComponent(orderId)}&u=${encodeURIComponent(userId)}`;
}

// Helper: safely get latest order for a user (with index fallback)
async function getLatestOrderForUser(userId) {
  try {
    const snap = await db
      .collection('orders')
      .where('userId', '==', userId)
      .orderBy('createdAt', 'desc')
      .limit(1)
      .get();
    if (snap.empty) return null;
    const doc = snap.docs[0];
    return { id: doc.id, data: doc.data(), ref: doc.ref };
  } catch (e) {
    const msg = String(e?.message || '');
    if (e?.code === 9 || msg.includes('index') || msg.toLowerCase().includes('failed_precondition')) {
      const snap = await db.collection('orders').where('userId', '==', userId).get();
      if (snap.empty) return null;
      let latestDoc = null;
      snap.forEach((d) => {
        if (!latestDoc) latestDoc = d;
        else {
          const a = d.data()?.createdAt || 0;
          const b = latestDoc.data()?.createdAt || 0;
          if (a > b) latestDoc = d;
        }
      });
      return latestDoc ? { id: latestDoc.id, data: latestDoc.data(), ref: latestDoc.ref } : null;
    }
    throw e;
  }
}

async function clearExpiredSessions() {
  const sessionSnapshot = await db.collection('sessions').get();
  const now = Date.now();
  const timeoutMinutes = parseInt(process.env.SESSION_TIMEOUT_MINUTES || '30', 10);
  sessionSnapshot.forEach(async (doc) => {
    const s = doc.data();
    if (s.updatedAt && now - s.updatedAt > timeoutMinutes * 60 * 1000) {
      await doc.ref.delete();
    }
  });
}

async function handleIncoming(payload) {
  const entry = payload?.entry?.[0]?.changes?.[0]?.value;
  if (!entry?.messages) return;

  const message = entry.messages[0];
  const from = message.from;
  const text = message.text?.body?.trim() || '';
  const lowerText = text.toLowerCase();

  const sessionRef = db.collection('sessions').doc(from);
  let sessionSnapshot = await sessionRef.get();
  let session = sessionSnapshot.exists ? sessionSnapshot.data() : {};
  if (!session.updatedAt) session.updatedAt = Date.now();
  if (!session.lastMessageAt) session.lastMessageAt = 0;

  // Allow payment/address/interactive to bypass flood control
  const isBypass = lowerText === 'paid' || message.type === 'interactive' || session.step?.startsWith('collecting_address') || session.step === 'confirming_address';
  if (!isBypass && Date.now() - session.lastMessageAt < 1000) {
    await sendMessage(from, '⏳ Please slow down.');
    return;
  }
  session.lastMessageAt = Date.now();

  // 1) Interactive replies
  if (message.type === 'interactive') {
    const type = message.interactive?.type;

    // a) List reply -> add selected menu item
    if (type === 'list_reply') {
      const row = message.interactive?.list_reply;
      const itemId = row?.id;
      try {
        if (!itemId) throw new Error('Invalid selection');
        const mDoc = await db.collection('menu').doc(itemId).get();
        if (!mDoc.exists) throw new Error('Menu item not found');
        const m = mDoc.data();
        if (m.available === false) throw new Error('Item out of stock');

        const cartRef = db.collection('carts').doc(from);
        const cSnap = await cartRef.get();
        const cart = cSnap.exists ? cSnap.data() : { items: [] };
        const existing = cart.items.find((i) => i.itemId === itemId);
        if (existing) existing.qty = (existing.qty || 1) + 1;
        else cart.items.push({ itemId, qty: 1, customization: '' });
        await cartRef.set(cart);

        await sendMessage(from, `✅ Added ${m.name} to your cart.`);
        await buildAndSendCartSummary(from);

        session.step = '';
        await sessionRef.set({ ...session, updatedAt: Date.now() });
      } catch (e) {
        await sendMessage(from, `Sorry, couldn't add item: ${e.message}`);
      }
      return;
    }

    // b) Button reply -> confirm/cancel order
    if (type === 'button_reply') {
      const replyId = message.interactive?.button_reply?.id || '';
      try {
        if (replyId.startsWith('confirm_')) {
          const orderId = replyId.replace('confirm_', '');
          // Create order from current cart
          const cartDoc = await db.collection('carts').doc(from).get();
          const items = cartDoc.exists ? cartDoc.data().items : [];
          if (!items.length) {
            await sendMessage(from, 'Your cart is empty. Please add items before confirming.');
            return;
          }
          // Need address
          const profile = await getUserProfile(from);
          if (!profile.address) {
            await sendMessage(from, '📍 Please share your delivery address before we confirm. Send your full address in one message.');
            session.step = 'collecting_address';
            session.afterAddressAction = 'confirm_existing_order';
            session.pendingOrderId = orderId;
            await sessionRef.set({ ...session, updatedAt: Date.now() });
            return;
          }

          let total = 0;
          for (const ci of items) {
            const mi = await db.collection('menu').doc(ci.itemId).get();
            if (mi.exists) total += (mi.data().price || 0) * (ci.qty || 1);
          }
          const finalTotal = session.orderTotal || total;

          const order = {
            userId: from,
            items,
            total: finalTotal,
            status: 'pending_payment',
            createdAt: Date.now(),
            scheduledFor: session.scheduledFor || null,
            deliveryAddress: profile.address || '',
          };
          await db.collection('orders').doc(orderId).set(order);

          await db.collection('carts').doc(from).set({ items: [] });

          await sendMessage(from, `Please pay: https://your-payment-link.com/pay?order=${orderId}`);
          await sendMessage(from, `Once paid, reply "paid" to confirm or wait for auto-verification.`);

          session.step = '';
          delete session.pendingOrderId;
          await sessionRef.set({ ...session, updatedAt: Date.now() });
        } else if (replyId.startsWith('cancel_') || replyId === 'cancel') {
          session.step = '';
          delete session.orderId;
          delete session.orderTotal;
          await sessionRef.set({ ...session, updatedAt: Date.now() });
          await sendMessage(from, 'Order cancelled. You can type 1 to see the menu again.');
        } else {
          await sendMessage(from, 'Not sure what you selected. Type 1 for menu.');
        }
      } catch (e) {
        console.error('[Button Reply Error]', e);
        await sendMessage(from, `Something went wrong: ${e.message}`);
      }
      return;
    }
  }

  // 2) Address commands (view/change)
  if (lowerText === 'address' || lowerText.includes('change address') || lowerText.startsWith('set address')) {
    const profile = await getUserProfile(from);
    if (profile.address) {
      await sendMessage(from, `Your current address:\n${profile.address}\n\nSend a new address to update it.`);
    } else {
      await sendMessage(from, '📍 Please send your full delivery address in one message.\nExample: "House 12, MG Road, Indore, 452001"');
    }
    session.step = 'collecting_address';
    session.afterAddressAction = ''; // standalone update
    await sessionRef.set({ ...session, updatedAt: Date.now() });
    return;
  }

  // 3) Address collection flow
  if (session.step === 'collecting_address' && message.type === 'text') {
    const addr = text;
    if (!isValidAddress(addr)) {
      await sendMessage(from, 'Address looks too short. Please send full address with house no, street, city, pincode.');
      return;
    }
    session.tempAddress = addr;
    session.step = 'confirming_address';
    await sessionRef.set({ ...session, updatedAt: Date.now() });
    await sendMessage(from, `Please confirm this address:\n${addr}\nReply "yes" to save or "no" to re-enter.`);
    return;
  }
  if (session.step === 'confirming_address') {
    if (lowerText.startsWith('yes')) {
      const addr = session.tempAddress;
      await saveUserAddress(from, addr);
      await sendMessage(from, '✅ Address saved.');
      // Continue any pending action
      const next = session.afterAddressAction || '';
      const pendingTotal = session.pendingTotal || null;
      const pendingOrderId = session.pendingOrderId || null;
      session.step = '';
      delete session.tempAddress;
      delete session.afterAddressAction;
      delete session.pendingTotal;
      delete session.pendingOrderId;
      await sessionRef.set({ ...session, updatedAt: Date.now() });

      if (next === 'place_order') {
        // Resume place order flow
        const cartDoc = await db.collection('carts').doc(from).get();
        const items = cartDoc.exists ? cartDoc.data().items : [];
        if (!items.length) {
          await sendMessage(from, 'Your cart is empty. Add items before placing order.');
          return;
        }
        let total = 0;
        for (const ci of items) {
          const mi = await db.collection('menu').doc(ci.itemId).get();
          if (mi.exists) total += (mi.data().price || 0) * (ci.qty || 1);
        }
        const totalToUse = pendingTotal || total;
        const orderId = uuidv4();
        // Save session for confirmation buttons
        const s2 = (await sessionRef.get()).data() || {};
        s2.step = 'confirming_order';
        s2.orderId = orderId;
        s2.orderTotal = totalToUse;
        await sessionRef.set({ ...s2, updatedAt: Date.now() });
        await sendOrderConfirmationButtons(from, orderId, totalToUse);
        return;
      }
      if (next === 'confirm_existing_order' && pendingOrderId) {
        // User pressed Yes earlier; now address is saved, instruct to press 4 again
        await sendMessage(from, 'Now press 4 again to continue order confirmation.');
        return;
      }
      return;
    }
    if (lowerText.startsWith('no')) {
      session.step = 'collecting_address';
      await sessionRef.set({ ...session, updatedAt: Date.now() });
      await sendMessage(from, 'Okay, please send the correct address.');
      return;
    }
    // If neither yes/no, nudge
    await sendMessage(from, 'Please reply "yes" to save this address or "no" to change it.');
    return;
  }

  // 4) NLP-lite add flow
  if (/i want|add|order|with|without/.test(lowerText)) {
    const { item, qty, customization } = extractOrderIntent(lowerText);
    if (item) {
      const itemsSnap = await db.collection('menu').where('available', '==', true).get();
      let found;
      itemsSnap.forEach((doc) => {
        if (doc.data().name?.toLowerCase() === item) found = doc;
      });
      if (!found) {
        await sendMessage(from, `Sorry, couldn't find "${item}" in menu. Reply "menu" for options.`);
        return;
      }
      const menuDoc = found.data();
      const customizations = menuDoc.customizations || [];
      if (customizations.length && !customization) {
        await sendMessage(from, `Would you like any of the following customizations: ${customizations.join(', ')}? Reply as "with <customization>".`);
        session.step = 'waiting_for_customization';
        session.tempItemId = found.id;
        session.qty = qty;
        await sessionRef.set({ ...session, updatedAt: Date.now() });
        return;
      }
      const cartRef = db.collection('carts').doc(from);
      const cartSnap = await cartRef.get();
      const cart = cartSnap.exists ? cartSnap.data() : { items: [] };
      cart.items.push({
        itemId: found.id,
        qty,
        customization: customization || '',
      });
      await cartRef.set(cart);
      await sendMessage(from, `✅ Added ${qty} x ${menuDoc.name}${customization ? ' with ' + customization : ''} to your cart!\nReply:\n1 - Show Menu\n2 - Show Cart\n4 - Place Order\nType "address" to set delivery address.`);
      session.step = '';
      await sessionRef.set({ ...session, updatedAt: Date.now() });
      return;
    }
  }

  if (session.step === 'waiting_for_customization' && session.tempItemId && lowerText.startsWith('with')) {
    const customization = lowerText.replace(/^with\s+/, '');
    const cartRef = db.collection('carts').doc(from);
    const cartSnap = await cartRef.get();
    const cart = cartSnap.exists ? cartSnap.data() : { items: [] };
    cart.items.push({
      itemId: session.tempItemId,
      qty: session.qty || 1,
      customization,
    });
    await cartRef.set(cart);
    await sendMessage(from, `✅ Added to your cart with customization: ${customization}\nReply:\n1 - Show Menu\n2 - Show Cart\n4 - Place Order`);
    session.step = '';
    delete session.tempItemId;
    delete session.qty;
    await sessionRef.set({ ...session, updatedAt: Date.now() });
    return;
  }

  // 5) Menu
  if (lowerText === '1' || lowerText === 'menu') {
    const snapshot = await db.collection('menu').where('available', '==', true).get();
    const menu = [];
    snapshot.forEach((doc) => menu.push({ id: doc.id, ...doc.data() }));
    if (!menu.length) {
      await sendMessage(from, 'Menu is empty right now. Please try later.');
    } else {
      await sendMenuList(from, menu);
    }
    session.step = '';
    await sessionRef.set({ ...session, updatedAt: Date.now() });
    return;
  }

  // 6) Cart
  if (lowerText === '2' || lowerText.includes('cart')) {
    await buildAndSendCartSummary(from);
    session.step = '';
    await sessionRef.set({ ...session, updatedAt: Date.now() });
    return;
  }

  // 7) Place order (requires address)
  if (lowerText === '4' || lowerText.includes('place order')) {
    const cartDoc = await db.collection('carts').doc(from).get();
    const items = cartDoc.exists ? cartDoc.data().items : [];
    if (!items.length) {
      await sendMessage(from, 'Your cart is empty. Add items before placing order.');
      return;
    }
    // Address check
    const profile = await getUserProfile(from);
    if (!profile.address) {
      await sendMessage(from, '📍 We need your delivery address first.\nPlease send your full address in one message.');
      session.step = 'collecting_address';
      session.afterAddressAction = 'place_order';
      // compute total now and keep
      let total = 0;
      for (const ci of items) {
        const mi = await db.collection('menu').doc(ci.itemId).get();
        if (mi.exists) total += (mi.data().price || 0) * (ci.qty || 1);
      }
      // Apply promo (optional, after address we’ll reuse this)
      const activePromo = await db.collection('promos').where('active', '==', true).limit(1).get();
      if (!activePromo.empty) {
        const promo = activePromo.docs[0].data();
        const discount = Math.round(total * (promo.percent / 100));
        total -= discount;
        await sendPromoCode(from, promo.code, `${promo.percent}% OFF (auto-applied)`);
      }
      session.pendingTotal = total;
      await sessionRef.set({ ...session, updatedAt: Date.now() });
      return;
    }

    // Compute total + promo
    let total = 0;
    for (const ci of items) {
      const mi = await db.collection('menu').doc(ci.itemId).get();
      if (mi.exists) total += (mi.data().price || 0) * (ci.qty || 1);
    }
    const activePromo = await db.collection('promos').where('active', '==', true).limit(1).get();
    if (!activePromo.empty) {
      const promo = activePromo.docs[0].data();
      const discount = Math.round(total * (promo.percent / 100));
      total -= discount;
      await sendPromoCode(from, promo.code, `${promo.percent}% OFF (auto-applied)`);
    }
    const orderId = uuidv4();
    session.step = 'confirming_order';
    session.orderId = orderId;
    session.orderTotal = total;
    await sessionRef.set({ ...session, updatedAt: Date.now() });
    await sendOrderConfirmationButtons(from, orderId, total);
    return;
  }

  // 8) Fallback text "yes" confirm
  if (session.step === 'confirming_order' && lowerText.startsWith('yes')) {
    const profile = await getUserProfile(from);
    if (!profile.address) {
      await sendMessage(from, '📍 Please share your delivery address before we confirm the order.');
      session.step = 'collecting_address';
      session.afterAddressAction = 'confirm_existing_order';
      session.pendingOrderId = session.orderId;
      await sessionRef.set({ ...session, updatedAt: Date.now() });
      return;
    }

    const cartDoc = await db.collection('carts').doc(from).get();
    const items = cartDoc.exists ? cartDoc.data().items : [];
    const order = {
      userId: from,
      items,
      total: session.orderTotal,
      status: 'pending_payment',
      createdAt: Date.now(),
      scheduledFor: session.scheduledFor || null,
      deliveryAddress: profile.address || '',
    };
    await db.collection('orders').doc(session.orderId).set(order);
    await db.collection('carts').doc(from).set({ items: [] });
    await sendMessage(from, `Please pay: https://your-payment-link.com/pay?order=${session.orderId}`);
    await sendMessage(from, `Once paid, reply "paid" to confirm or wait for auto-verification.`);
    session.step = '';
    await sessionRef.set({ ...session, updatedAt: Date.now() });
    return;
  }

  // 9) Payment simulation
  if (/\bpaid\b/.test(lowerText)) {
    try {
      const latest = await getLatestOrderForUser(from);
      if (latest) {
        await latest.ref.update({ status: 'confirmed', paidAt: Date.now() });
        await sendMessage(from, `✅ Payment received! Your order is confirmed. We'll notify you when it's out for delivery.`);
        // Live video link
        const liveUrl = buildLiveUrl(latest.id, from);
        await sendMessage(from, `🎥 Watch your food being prepared live:\n${liveUrl}`);
        await sendPromoCode(from, 'NEXT10', '10% OFF your next order');
      } else {
        await sendMessage(from, 'No recent orders found.');
      }
    } catch (e) {
      console.error('[Paid Handler Error]', e);
      await sendMessage(from, 'We could not verify payment right now. Please try again in a moment.');
    }
    return;
  }

  // 10) Live video request (manual)
  if (/live\s*video|preparation\s*video|show\s*(me\s*)?video|camera/.test(lowerText)) {
    const latest = await getLatestOrderForUser(from);
    if (!latest) {
      await sendMessage(from, "You don't have any recent orders eligible for live preparation video.");
      return;
    }
    const liveUrl = buildLiveUrl(latest.id, from);
    await sendMessage(from, `🎥 Live kitchen:\n${liveUrl}`);
    return;
  }

  // 11) Scheduling
  if (/deliver at|schedule for|at \d/.test(lowerText)) {
    const match = lowerText.match(/at (\d{1,2}(:\d{2})?\s*(am|pm)?)/);
    if (match) {
      session.scheduledFor = match[1];
      await sendMessage(from, `Order will be scheduled for delivery at ${match[1]}. Proceed to checkout.`);
      await sessionRef.set({ ...session, updatedAt: Date.now() });
      return;
    }
  }

  // 12) Tracking (3 or text)
  if (/track|status|where.*order/.test(lowerText) || lowerText === '3') {
    try {
      const latest = await getLatestOrderForUser(from);
      if (latest) {
        const o = latest.data;
        await sendMessage(from, `Order #${latest.id.slice(-5)} status: ${o.status}\nTotal: ₹${o.total}\nAddress: ${o.deliveryAddress || '-'}`);
      } else {
        await sendMessage(from, 'No recent orders found.');
      }
    } catch (e) {
      console.error('[Track Handler Error]', e);
      await sendMessage(from, 'Unable to get order status right now. Please try again.');
    }
    return;
  }

  // 13) Recent orders list (keyword "order")
  if (lowerText.includes('order')) {
    const orders = await db
      .collection('orders')
      .where('userId', '==', from)
      .orderBy('createdAt', 'desc')
      .limit(3)
      .get()
      .catch(async (e) => {
        const msg = String(e?.message || '');
        if (e?.code === 9 || msg.includes('index') || msg.toLowerCase().includes('failed_precondition')) {
          const s = await db.collection('orders').where('userId', '==', from).get();
          const arr = s.docs
            .map((d) => ({ id: d.id, ...d.data() }))
            .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
            .slice(0, 3);
          return { fallback: true, docs: arr };
        }
        throw e;
      });

    if (!orders) {
      await sendMessage(from, 'No orders yet. Reply "menu" to see menu.');
      return;
    }

    if (orders.fallback) {
      if (!orders.docs.length) {
        await sendMessage(from, 'No orders yet. Reply "menu" to see menu.');
        return;
      }
      let msg = '🧾 Your Recent Orders\n\n';
      orders.docs.forEach((o) => {
        msg += `Order #${String(o.id).slice(-5)} — Status: ${o.status}\nTotal: ₹${o.total || '-'}\nAddress: ${o.deliveryAddress || '-'}\n\n`;
      });
      await sendMessage(from, msg);
      return;
    }

    if (orders.empty) {
      await sendMessage(from, 'No orders yet. Reply "menu" to see menu.');
      return;
    }
    let msg = '🧾 Your Recent Orders\n\n';
    orders.forEach((doc) => {
      const o = doc.data();
      msg += `Order #${doc.id.slice(-5)} — Status: ${o.status}\nTotal: ₹${o.total || '-'}\nAddress: ${o.deliveryAddress || '-'}\n\n`;
    });
    await sendMessage(from, msg);
    return;
  }

  // 14) Help
  if (lowerText === '5' || lowerText.includes('help') || lowerText.includes('support')) {
    await sendMessage(
      from,
      `How can we help?\n- Type 1: Menu\n- Type 2: Cart\n- Type 3: Track Order\n- Type 4: Place Order\n- Type "address": View/Change address\n- Type "video": Live kitchen link`
    );
    return;
  }

  if (lowerText.includes('agent') || lowerText.includes('human')) {
    await sendMessage(from, `A human agent will reach out to you soon.`);
    return;
  }

  // 15) Privacy
  if (/delete.*data|remove.*account/.test(lowerText)) {
    await db.collection('users').doc(from).delete();
    await db.collection('carts').doc(from).delete();
    await db.collection('sessions').doc(from).delete();
    await sendMessage(from, 'Your data has been deleted as per your request.');
    return;
  }
  if (/export.*data|my.*data/.test(lowerText)) {
    const userData = {};
    const orders = await db.collection('orders').where('userId', '==', from).get();
    userData.orders = [];
    orders.forEach((doc) => userData.orders.push(doc.data()));
    await sendMessage(from, `Your data export:\n${JSON.stringify(userData, null, 2).slice(0, 4000)}`);
    return;
  }

  // 16) Default
  await sendMessage(
    from,
    `👋 Welcome to Cloud Kitchen!\nReply:\n1 - Menu\n2 - Cart\n3 - Track Order\n4 - Place Order\n5 - Help\nType "address" to set your delivery address.`
  );
  await sessionRef.set({ ...session, updatedAt: Date.now() });
}

module.exports = {
  handleIncoming,
  sendMenuList,
  sendOrderConfirmationButtons,
  sendMessage,
  sendVideoLink,
  clearExpiredSessions,
};