import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Ask the browser not to evict IndexedDB (hand history) under storage pressure.
if (navigator.storage?.persist) {
  navigator.storage.persist()
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
