import React from 'react'
import ReactDOM from 'react-dom/client'
import '@fontsource-variable/inter'
import '@fontsource/jetbrains-mono/400.css'
import './styles.css'
import { App } from './App'
import { createBrowserPreviewApi } from './dev-api'

if (import.meta.env.DEV && !window.agentLab) window.agentLab = createBrowserPreviewApi()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
