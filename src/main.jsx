import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import DrRefPage from './DrRef.jsx'
const drrefToken = new URLSearchParams(window.location.search).get('drref')
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  drrefToken ? <DrRefPage token={drrefToken} /> : <App />
)
