# Cloud Kitchen Bot (Backend + Streamlit Admin)

A complete Cloud Kitchen WhatsApp Bot with REST API backend and Streamlit Admin interface.

## Quick Start

### 1) Backend Setup
```bash
cd backend
cp .env.example .env
# Edit .env with your Firebase and WhatsApp credentials
npm install
npm run dev
```
Backend runs at http://localhost:3000

### 2) WhatsApp Webhook Setup
Set Facebook/WhatsApp webhook to: `http://<your-host>:3000/webhook`

### 3) Streamlit Admin Setup
```bash
cd admin-streamlit
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
streamlit run app.py
```

For Admin UI to work, set API_BASE in `.streamlit/secrets.toml`:
```toml
API_BASE = "http://localhost:3000/api"
```

## API Endpoints

All API endpoints are available under `/api` prefix:

### Menu Management
- `GET /api/menu` - List all menu items
- `POST /api/menu` - Create menu item `{ name, price, description?, available?, customizations[], imageUrl? }`
- `PATCH /api/menu/:id` - Update menu item (e.g., toggle available)
- `DELETE /api/menu/:id` - Delete menu item

### Order Management
- `GET /api/orders` - List all orders (desc by createdAt)
- `GET /api/orders/:userId` - List user's orders (desc by createdAt)
- `POST /api/orders` - Create order `{ userId, items[], total, status?, deliveryAddress?, scheduledFor? }`
- `PATCH /api/orders/:id` - Update order status or fields

### Admin Functions
- `GET /api/admin/users` - List all users
- `PATCH /api/admin/user/:userId` - Update user
- `GET /api/admin/promos` - List all promos
- `POST /api/admin/promos` - Create promo `{ code, percent, active, description? }`
- `PATCH /api/admin/promos/:id` - Update promo
- `DELETE /api/admin/promos/:id` - Delete promo

### Inventory Management
- `GET /api/inventory` - List inventory items
- `POST /api/inventory` - Create inventory item
- `PATCH /api/inventory/:id` - Update inventory item

### Address Management
- `GET /api/address/:userId` - Get user address `{ address? }`
- `POST /api/address/:userId` - Set user address `{ address }`
- `PATCH /api/address/:userId` - Update user address

### Support System
- `GET /api/support` - List support tickets
- `POST /api/support` - Create ticket `{ userId, message, orderId? }`
- `PATCH /api/support/:id` - Update ticket (returns updated document)

### Analytics
- `GET /api/analytics/bestsellers` - Returns `[{ name, itemId, sold }]`
- `GET /api/analytics/orders-per-day` - Returns `{ "YYYY-MM-DD": count }`

### Payment
- `POST /api/payment/webhook` - Payment confirmation `{ orderId, status }`
- `POST /api/payment/confirm` - Manual payment confirmation
- `POST /api/payment/refund` - Process refund

### Other APIs
- `GET /api/cart/:userId` - Get user cart
- `POST /api/cart/:userId` - Update user cart
- `GET /api/feedback` - List feedback
- `POST /api/feedback` - Create feedback

## Environment Variables

Required environment variables (see `backend/.env.example`):

### WhatsApp Cloud API
- `WHATSAPP_TOKEN` - Your WhatsApp API token
- `WHATSAPP_PHONE_ID` - Your phone number ID
- `WHATSAPP_VERIFY_TOKEN` - Webhook verify token
- `WA_API_VERSION` - API version (e.g., v17.0)

### Firebase Admin SDK
- `FIREBASE_PROJECT_ID` - Your Firebase project ID
- `FIREBASE_CLIENT_EMAIL` - Service account email
- `FIREBASE_PRIVATE_KEY` - Service account private key (with escaped \\n)

### Server Configuration
- `PORT` - Server port (default: 3000)
- `SESSION_TIMEOUT_MINUTES` - WhatsApp session timeout (default: 30)
- `LIVE_VIDEO_BASE_URL` - Base URL for live video links

## Firestore Collections

Required Firestore collections:
- `menu` - Menu items
- `orders` - Customer orders 
- `carts` - User shopping carts
- `users` - User profiles and addresses
- `promos` - Promotional codes
- `feedback` - Customer feedback
- `support` - Support tickets
- `sessions` - WhatsApp user sessions
- `inventory` - Inventory management
- `addresses` - User addresses (legacy)

### Important: Firestore Indexes

For optimal performance, create these indexes in Firestore:

1. **orders collection**: 
   - Fields: `userId` (Ascending), `createdAt` (Descending)
   - Query scope: Collection

This index enables efficient user order history queries. The code includes fallback logic for missing indexes.

## Features

### Backend
- ✅ Complete REST API for all operations
- ✅ WhatsApp Bot integration with menu, cart, orders
- ✅ Promotional code system
- ✅ Live video links for order tracking
- ✅ Session management with timeouts
- ✅ Rate limiting and error handling
- ✅ CORS enabled for Streamlit integration

### Admin UI (Streamlit)
- ✅ Menu management (CRUD operations)
- ✅ Order tracking and status updates
- ✅ User management
- ✅ Promotional code management
- ✅ Inventory tracking
- ✅ Support ticket management
- ✅ Analytics dashboard
- ✅ Real-time data with caching

### WhatsApp Bot
- ✅ Natural language menu browsing
- ✅ Cart management
- ✅ Order placement and confirmation
- ✅ Address collection and validation
- ✅ Promotional code application
- ✅ Live order tracking links
- ✅ Support ticket creation

## Development

The backend exports the Express app for testing:
```javascript
const app = require('./backend/src/app');
// Use app for testing
```

Error handling:
- All routes return JSON with `{ error: "message" }` format
- 404 handler for unknown API routes
- Global error handler (no stack traces in production)
- Rate limiting with sensible defaults
