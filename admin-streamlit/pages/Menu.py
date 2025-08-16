import streamlit as st
import requests
import pandas as pd

API_BASE = st.secrets.get("API_BASE", "http://localhost:3000/api")

st.title("Menu Management")

@st.cache_data(ttl=15)
def get_menu():
  r = requests.get(f"{API_BASE}/menu", timeout=15)
  r.raise_for_status()
  return r.json().get("menu", [])

def refresh():
  st.cache_data.clear()

menu = get_menu()
if menu:
  df = pd.DataFrame(menu)
  st.dataframe(df)
else:
  st.info("No menu items yet.")

with st.expander("Add New Item"):
  with st.form("add_menu"):
    name = st.text_input("Name", "")
    price = st.number_input("Price (₹)", min_value=0, step=1)
    description = st.text_area("Description", "")
    available = st.checkbox("Available", True)
    customizations = st.text_input("Customizations (comma-separated)", "")
    imageUrl = st.text_input("Image URL", "")
    submitted = st.form_submit_button("Add")
    if submitted and name and price >= 0:
      payload = {
        "name": name, "price": price, "description": description,
        "available": available,
        "customizations": [c.strip() for c in customizations.split(",") if c.strip()],
        "imageUrl": imageUrl
      }
      r = requests.post(f"{API_BASE}/menu", json=payload, timeout=20)
      if r.ok:
        st.success("Item added")
        refresh()
      else:
        st.error(r.text)

st.subheader("Delete / Update")
for item in menu:
  cols = st.columns([3,1,1])
  cols[0].markdown(f"**{item.get('name')}** — ₹{item.get('price')} | {item.get('description','')}")
  if cols[1].button("Delete", key=f"del_{item['id']}"):
    r = requests.delete(f"{API_BASE}/menu/{item['id']}", timeout=15)
    if r.ok:
      st.success("Deleted")
      refresh()
    else:
      st.error(r.text)
  if cols[2].button("Toggle Available", key=f"tog_{item['id']}"):
    r = requests.patch(f"{API_BASE}/menu/{item['id']}", json={"available": not item.get("available", True)}, timeout=15)
    if r.ok:
      st.success("Updated")
      refresh()
    else:
      st.error(r.text)
