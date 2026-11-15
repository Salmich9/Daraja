import React from 'react'
import { createRoot } from 'react-dom/client'
import './icons.css'
import './styles.css'
import './utils.css'
import App from './App.jsx'
import { reportError } from './lib'

window.addEventListener('error', e => reportError(e.message || 'Erreur', 'page', (e.filename || '') + ':' + (e.lineno || '') + ' ' + (e.error?.stack || '')))
window.addEventListener('unhandledrejection', e => { const r = e.reason; if (!/^(session|forbidden)/.test(r?.message || '')) reportError(r?.message || String(r), 'promesse', r?.stack || '') })

class SafeScreen extends React.Component {
  constructor(p) { super(p); this.state = { broken: false } }
  static getDerivedStateFromError() { return { broken: true } }
  componentDidCatch(err, info) { reportError(err?.message || String(err), 'écran', (err?.stack || '') + '\n' + (info?.componentStack || '')) }
  render() {
    if (!this.state.broken) return this.props.children
    return (
      <div className="app t-baro"><div className="page u-ta-center u-pt-90" >
        <img src="/icons/logo.svg" alt="" width="84" height="84" className="u-d-block u-m-0-auto-14px" />
        <h1>Oups, petit souci</h1>
        <div className="sub u-m-8px-0-22px" >L'erreur a été envoyée à la direction. Recharge pour reprendre où tu en étais.</div>
        <button className="btn" onClick={() => location.reload()}>Recharger</button>
      </div></div>
    )
  }
}

document.addEventListener('gesturestart', e => e.preventDefault())
document.addEventListener('dblclick', e => e.preventDefault(), { passive: false })

createRoot(document.getElementById('root')).render(<SafeScreen><App /></SafeScreen>)
