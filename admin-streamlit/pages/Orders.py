import streamlit as st
import requests
import pandas as pd

API_BASE = st.secrets.get("API_BASE", "http://localhost:3000/api")

st.title("Orders")

@st.cache_data(ttl=15)
def get_orders():
  r = requests.get(f"{API_BASE}/orders", timeout=20)
  r.raise_for_status()
  return r.json().get("orders", [])

def refresh():
  st.cache_data.clear()

orders = get_orders()
if orders:
  df = pd.DataFrame(orders)
  st.dataframe(df, use_container_width=True)
else:
  st.info("No orders found.")

st.subheader("Update Order Status")
order_ids = [o["id"] for o in orders] if orders else []
sel = st.selectbox("Select Order ID", options=order_ids)
status = st.selectbox("New Status", options=["pending_payment","confirmed","preparing","out_for_delivery","delivered","cancelled"])
if st.button("Update Status") and sel:
  r = requests.patch(f"{API_BASE}/orders/{sel}", json={"status": status}, timeout=15)
  if r.ok:
    st.success("Updated")
    refresh()
  else:
    st.error(r.text)
