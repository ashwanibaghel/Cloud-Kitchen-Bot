import streamlit as st
import requests
import pandas as pd

API_BASE = st.secrets.get("API_BASE", "http://localhost:3000/api")

st.title("Analytics")

col1, col2 = st.columns(2)

with col1:
  st.subheader("Bestsellers")
  r = requests.get(f"{API_BASE}/analytics/bestsellers", timeout=20)
  if r.ok:
    data = r.json().get("bestsellers", [])
    if data:
      df = pd.DataFrame(data)
      st.bar_chart(df.set_index("name")["sold"])
    else:
      st.info("No data")

with col2:
  st.subheader("Orders per day")
  r = requests.get(f"{API_BASE}/analytics/orders-per-day", timeout=20)
  if r.ok:
    data = r.json().get("ordersPerDay", {})
    if data:
      df = pd.DataFrame({"date": list(data.keys()), "orders": list(data.values())}).set_index("date")
      st.line_chart(df)
    else:
      st.info("No data")
