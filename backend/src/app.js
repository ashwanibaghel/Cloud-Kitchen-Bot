require('dotenv').config(); // Load env before anything else

const express = require('express');
const cors = require('cors');
const limiter = require('./services/rateLimiter');

const app = express();

// IMPORTANT: trust proxy (for ngrok/any reverse proxy)
app.set('trust proxy', 1);

// Core middleware
app.use(express.json({ limit: '1mb' }));
app.use(cors({
  origin: ['http://localhost:8501', 'http://127.0.0.1:8501'],
}));

// Rate limit
app.use(limiter);

// Small helper: always pick an express router/function from module
function getRouter(modulePath) {
  const mod = require(modulePath);
  const picked = mod?.default || mod?.router || mod;
  if (typeof picked !== 'function') {
    // Helpful debug so we can see what came back
    // eslint-disable-next-line no-console
    console.error('Invalid router export from', modulePath, 'typeof=', typeof picked, 'keys=', Object.keys(mod || {}));
    throw new TypeError(`Router.use() requires a middleware function from ${modulePath}`);
  }
  return picked;
}

// Health root
app.get('/', (req, res) => {
  res.type('text').send('Cloud Kitchen WhatsApp Bot is running!');
});

// API routers (use getRouter to be robust against default/{router}/function exports)
app.use('/api/menu', getRouter('./api/menu'));
app.use('/api/cart', getRouter('./api/cart'));
app.use('/api/orders', getRouter('./api/orders')); // NOTE: plural 'orders'
app.use('/api/address', getRouter('./api/address'));
app.use('/api/payment', getRouter('./api/payment'));
app.use('/api/support', getRouter('./api/support'));
app.use('/api/inventory', getRouter('./api/inventory'));
app.use('/api/analytics', getRouter('./api/analytics'));
app.use('/api/admin', getRouter('./api/admin'));
app.use('/api/feedback', getRouter('./api/feedback'));
app.use('/api/subscriptions', getRouter('./api/subscriptions'));

// WhatsApp webhook (GET verify + POST handler)
app.use('/webhook', getRouter('./api/webhook'));

// 404 JSON
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Generic error handler
app.use((err, req, res, next) => {
  console.error('[error]', err && err.stack ? err.stack : err.message || err);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
const PORT = process.env.PORT || 3000;
if (!module.parent) {
  app.listen(PORT, () => {
    console.log(`Server listening on http://localhost:${PORT}`);
  });
}

module.exports = app;