import streamlit as st
import requests
import pandas as pd

API_BASE = st.secrets.get("API_BASE", "http://localhost:3000/api")

st.title("Inventory")

@st.cache_data(ttl=15)
def get_inventory():
  r = requests.get(f"{API_BASE}/inventory", timeout=15)
  r.raise_for_status()
  return r.json().get("inventory", [])

def refresh():
  st.cache_data.clear()

items = get_inventory()
if items:
  st.dataframe(pd.DataFrame(items), use_container_width=True)
else:
  st.info("No inventory items.")

st.subheader("Update Item")
ids = [i["id"] for i in items] if items else []
sel = st.selectbox("Inventory ID", options=ids)
field = st.text_input("Field to update (e.g., stock, threshold)")
value = st.text_input("New value")
if st.button("Update") and sel and field:
  payload = { field: value }
  r = requests.patch(f"{API_BASE}/inventory/{sel}", json=payload, timeout=15)
  if r.ok:
    st.success("Updated")
    refresh()
  else:
    st.error(r.text)
