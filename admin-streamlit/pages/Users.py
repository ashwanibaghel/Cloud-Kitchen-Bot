import streamlit as st
import requests
import pandas as pd

API_BASE = st.secrets.get("API_BASE", "http://localhost:3000/api")

st.title("Users & Privacy")

@st.cache_data(ttl=15)
def get_users():
  r = requests.get(f"{API_BASE}/admin/users", timeout=20)
  r.raise_for_status()
  return r.json().get("users", [])

def refresh():
  st.cache_data.clear()

users = get_users()
if users:
  st.dataframe(pd.DataFrame(users), use_container_width=True)
else:
  st.info("No users found.")

st.subheader("Privacy Actions")
user_ids = [u["id"] for u in users] if users else []
sel = st.selectbox("Select User", options=user_ids)
cols = st.columns(2)
if cols[0].button("Export Data") and sel:
  r = requests.get(f"{API_BASE}/privacy/export/{sel}", timeout=20)
  if r.ok:
    st.code(r.text, language="json")
  else:
    st.error(r.text)
if cols[1].button("Delete Data") and sel:
  r = requests.post(f"{API_BASE}/privacy/delete", json={"userId": sel}, timeout=20)
  if r.ok:
    st.success("Deleted")
    refresh()
  else:
    st.error(r.text)
