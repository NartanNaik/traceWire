import { useEffect, useState } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { AppProvider } from './context.jsx'
import Header from './components/Header.jsx'
import HintsPanel from './components/HintsPanel.jsx'
import Home from './pages/Home.jsx'
import Work from './pages/Work.jsx'

export default function App() {
  const [hints, setHints] = useState(false)

  useEffect(() => {
    const onKey = (e) => {
      const tag = (e.target && e.target.tagName) || ''
      if (e.key === '?' && !/INPUT|TEXTAREA|SELECT/.test(tag)) setHints((v) => !v)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const closeHints = () => {
    try { localStorage.setItem('tracewire.seen', '1') } catch { /* ignore */ }
    setHints(false)
  }

  return (
    <AppProvider>
      <div className="app">
        <Header onHints={() => setHints(true)} />
        <main className="main">
          <Routes>
            <Route path="/" element={<Home openHints={() => setHints(true)} />} />
            <Route path="/work/:workId" element={<Work />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
        {hints && <HintsPanel onClose={closeHints} />}
      </div>
    </AppProvider>
  )
}