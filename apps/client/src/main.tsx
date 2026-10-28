import { createRoot } from 'react-dom/client'
import { App } from './App'
import './ui/styles.css'
import { useApp } from './state/app'
import { useSettings, isMobileDevice } from './state/settings'
import { useTools } from './features/tools'

// A build-time entry for the self-contained Pages demo; the official runtime stays intact.
if (import.meta.env.VITE_OBORO_DEMO === '1') {
  const base = new URL(import.meta.env.BASE_URL, location.origin)
  useApp.getState().setScreen({ kind: 'dev', worldUrl: new URL('../world/', base).href })
  useTools.setState({ faceMirror: false })
  try {
    if (!localStorage.getItem('ttv.settings.v1')) {
      const mobile=isMobileDevice()
      useSettings.getState().set({ quality: mobile?'low':'medium', renderScale: mobile?.85:1, shadows: !mobile })
    }
  } catch { /* Storage may be unavailable; current in-memory defaults still work. */ }
  useSettings.getState().set({ autoEnterVR: false, startMuted: true })
}

createRoot(document.getElementById('root')!).render(<App />)
