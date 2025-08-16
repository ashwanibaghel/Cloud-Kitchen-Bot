import streamlit as st
import requests
import pandas as pd

API_BASE = st.secrets.get("API_BASE", "http://localhost:3000/api")

st.title("Support Tickets")

def refresh():
  st.cache_data.clear()

@st.cache_data(ttl=15)
def get_tickets():
  r = requests.get(f"{API_BASE}/support", timeout=20)
  r.raise_for_status()
  return r.json().get("tickets", [])

tickets = get_tickets()
if tickets:
  st.dataframe(pd.DataFrame(tickets), use_container_width=True)
else:
  st.info("No tickets.")

st.subheader("Update Ticket")
ids = [t["id"] for t in tickets] if tickets else []
sel = st.selectbox("Ticket ID", options=ids)
status = st.selectbox("Status", options=["open","in_progress","resolved","closed"])
if st.button("Update"):
  r = requests.patch(f"{API_BASE}/support/{sel}", json={"status": status}, timeout=15)
  if r.ok:
    st.success("Updated")
    refresh()
  else:
    st.error(r.text)
