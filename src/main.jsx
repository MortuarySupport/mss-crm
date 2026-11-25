import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import DrRefPage from './DrRef.jsx'
import CremPage from './Crem.jsx'
const qs = new URLSearchParams(window.location.search)
const drrefToken = qs.get('drref')
const cremToken = qs.get('crem')
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  drrefToken ? <DrRefPage token={drrefToken} /> : cremToken ? <CremPage token={cremToken} /> : <App />
)
