# Cloud Kitchen Bot (Backend + Streamlit Admin)

Steps:
1) Backend
   - cd backend
   - cp .env.example .env (or edit .env)
   - npm install
   - npm run dev
   - Exposes APIs at http://localhost:3000

2) WhatsApp Webhook
   - Set Facebook/WhatsApp webhook to http://<host>:3000/webhook

3) Streamlit Admin
   - cd admin-streamlit
   - python -m venv .venv && source .venv/bin/activate
   - pip install -r requirements.txt
   - streamlit run app.py
   - Set API_BASE via .streamlit/secrets.toml if needed.

Collections to create (Firestore):
- menu, orders, carts, users, promos, feedback, support, sessions, inventory, addresses
