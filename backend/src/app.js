require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');

const webhookRouter = require('./api/webhook');
const menuRouter = require('./api/menu');
const cartRouter = require('./api/cart');
const ordersRouter = require('./api/orders');
const paymentRouter = require('./api/payment');
const addressRouter = require('./api/address');
const feedbackRouter = require('./api/feedback');
const inventoryRouter = require('./api/inventory');
const supportRouter = require('./api/support');
const analyticsRouter = require('./api/analytics');
const privacyRouter = require('./api/privacy');
const adminRouter = require('./api/admin');

const rateLimiter = require('./services/rateLimiter');

const app = express();

app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Health check
app.get('/', (req, res) => res.send('Cloud Kitchen WhatsApp Bot is running!'));

// Global rate limiter
app.use(rateLimiter);

// Webhook for WhatsApp
app.use('/webhook', webhookRouter);

// RESTful APIs
app.use('/api/menu', menuRouter);
app.use('/api/cart', cartRouter);
app.use('/api/orders', ordersRouter);
app.use('/api/payment', paymentRouter);
app.use('/api/address', addressRouter);
app.use('/api/feedback', feedbackRouter);
app.use('/api/inventory', inventoryRouter);
app.use('/api/support', supportRouter);
app.use('/api/analytics', analyticsRouter);
app.use('/api/privacy', privacyRouter);
app.use('/api/admin', adminRouter);

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
