import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { bootstrap, renameStation, friendly } from './lib/api.js'
import { configured } from './lib/supabase.js'
import { Logo } from './components/Icons.jsx'

const Ctx = createContext(null)
export const useApp = () => useContext(Ctx)

function Splash() {
  return (
    <div className="splash">
      <Logo size={48} />
      <div className="spinner" role="status" aria-label="Loading" />
    </div>
  )
}

function ErrorScreen({ message }) {
  return (
    <div className="splash">
      <Logo size={48} />
      <div className="card error-card">
        <h2>Tracewire could not start</h2>
        <p className="muted">{message}</p>
        <button className="btn btn-primary" onClick={() => window.location.reload()}>Try again</button>
      </div>
    </div>
  )
}

export function AppProvider({ children }) {
  const [state, setState] = useState({ status: 'loading', station: null, userId: null, error: '' })
  const [toasts, setToasts] = useState([])
  const idRef = useRef(0)

  const toast = useCallback((message, tone = 'info') => {
    const id = ++idRef.current
    setToasts((t) => [...t, { id, message, tone }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200)
  }, [])

  useEffect(() => {
    if (!configured) {
      setState({
        status: 'error', station: null, userId: null,
        error: 'Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to your .env file, then restart npm run dev.',
      })
      return
    }
    let alive = true
    bootstrap()
      .then(({ session, station }) => {
        if (alive) setState({ status: 'ready', station, userId: session.user.id, error: '' })
      })
      .catch((err) => {
        if (alive) setState({ status: 'error', station: null, userId: null, error: friendly(err) })
      })
    return () => { alive = false }
  }, [])

  const updateStationName = useCallback(async (name) => {
    const row = await renameStation(state.station.id, name.trim())
    setState((s) => ({ ...s, station: row }))
  }, [state.station])

  if (state.status === 'loading') return <Splash />
  if (state.status === 'error') return <ErrorScreen message={state.error} />

  return (
    <Ctx.Provider value={{ station: state.station, userId: state.userId, toast, updateStationName }}>
      {children}
      <div className="toasts" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.tone}`}>{t.message}</div>
        ))}
      </div>
    </Ctx.Provider>
  )
}