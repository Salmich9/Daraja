import React from 'react'
import { createRoot } from 'react-dom/client'
import './icons.css'
import './styles.css'
import App from './App.jsx'

document.addEventListener('gesturestart', e => e.preventDefault())
document.addEventListener('dblclick', e => e.preventDefault(), { passive: false })

createRoot(document.getElementById('root')).render(<App />)
