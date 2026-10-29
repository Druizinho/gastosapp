import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/inter'
import './index.css'
import App from './App.tsx'
import ErrorBoundary from './components/ErrorBoundary.tsx'
import { CurrencyPreferenceProvider } from './context/CurrencyPreferenceContext.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <CurrencyPreferenceProvider>
        <App />
      </CurrencyPreferenceProvider>
    </ErrorBoundary>
  </StrictMode>,
)

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    const swUrl = import.meta.env.DEV ? '/dev-sw.js?dev-sw' : '/sw.js';
    navigator.serviceWorker
      .register(swUrl, { type: 'classic' })
      .catch((err) => {
        console.warn('Service Worker registration warning:', err);
      });
  });
}

