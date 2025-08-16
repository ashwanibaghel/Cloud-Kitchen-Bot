import streamlit as st
import requests
import pandas as pd

API_BASE = st.secrets.get("API_BASE", "http://localhost:3000/api")

st.title("Promos")

@st.cache_data(ttl=15)
def get_promos():
  r = requests.get(f"{API_BASE}/admin/promos", timeout=15)
  r.raise_for_status()
  return r.json().get("promos", [])

def refresh():
  st.cache_data.clear()

promos = get_promos()
if promos:
  st.dataframe(pd.DataFrame(promos), use_container_width=True)
else:
  st.info("No promos")

with st.expander("Create Promo"):
  with st.form("add_promo"):
    code = st.text_input("Code")
    percent = st.number_input("Percent OFF", min_value=1, max_value=100, value=10)
    active = st.checkbox("Active", True)
    description = st.text_input("Description", "")
    sub = st.form_submit_button("Create")
    if sub and code:
      r = requests.post(f"{API_BASE}/admin/promos", json={"code": code, "percent": percent, "active": active, "description": description}, timeout=15)
      if r.ok:
        st.success("Promo created")
        refresh()
      else:
        st.error(r.text)
