import streamlit as st

st.set_page_config(page_title="Cloud Kitchen Admin", layout="wide")
st.title("Cloud Kitchen Admin Dashboard")

st.sidebar.success("Use the pages on the left to navigate.")
st.markdown("""
This Streamlit admin UI connects to your Node backend APIs.
Update API_BASE in each page if your backend runs on a different host/port.
""")
