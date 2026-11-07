import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { loadSiteConfig } from './utils/siteConfig'

// Fetch storefront settings (e.g. guest checkout on/off) as early as possible.
loadSiteConfig()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
