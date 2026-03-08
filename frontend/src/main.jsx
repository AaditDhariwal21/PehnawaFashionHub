import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { GoogleOAuthProvider } from "@react-oauth/google"

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <GoogleOAuthProvider clientId='80575999079-4ot9ns9rv0i5l0oa3cep9a8lu9db0is8.apps.googleusercontent.com'>
      <App />
    </GoogleOAuthProvider>

  </StrictMode>,
)
