import streamlit as st
import requests
import pandas as pd

API_BASE = st.secrets.get("API_BASE", "http://localhost:3000/api")

st.title("Feedback")

r = requests.get(f"{API_BASE}/feedback", timeout=20)
if r.ok:
  fb = r.json().get("feedback", [])
  if fb:
    st.dataframe(pd.DataFrame(fb), use_container_width=True)
  else:
    st.info("No feedback yet.")
else:
  st.error(r.text)
