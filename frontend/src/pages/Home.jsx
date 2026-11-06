import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useApp } from '../context.jsx'
import * as api from '../lib/api.js'
import WorkCard from '../components/WorkCard.jsx'
import CreateWireframeModal from '../components/CreateWireframeModal.jsx'
import ShareModal from '../components/ShareModal.jsx'
import { ConfirmModal } from '../components/Modal.jsx'
import { IconPlus, IconTrash } from '../components/Icons.jsx'

export default function Home({ openHints }) {
  const { station, toast, updateStationName } = useApp()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()

  const [works, setWorks] = useState(null)
  const [shared, setShared] = useState([])
  const [code, setCode] = useState(params.get('code') || '')
  const [codeError, setCodeError] = useState('')
  const [joining, setJoining] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [shareWork, setShareWork] = useState(null)
  const [toDelete, setToDelete] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [name, setName] = useState(station.display_name || '')
  const autoJoined = useRef(false)

  const load = useCallback(() => {
    api.listWireframes(station.id).then(setWorks).catch((e) => { setWorks([]); toast(api.friendly(e), 'error') })
    api.listShared().then(setShared).catch(() => {})
  }, [station.id, toast])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    try {
      if (!localStorage.getItem('tracewire.seen')) openHints()
    } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const join = useCallback(
    async (raw) => {
      const value = raw.trim()
      if (!value) return setCodeError('Paste a code first.')
      setJoining(true)
      setCodeError('')
      try {
        const wf = await api.joinWireframe(value)
        if (wf.station_id === station.id) {
          setCodeError('That is the code of your own wireframe. Send it to a reviewer instead.')
          return
        }
        navigate(`/work/${wf.id}`)
      } catch (err) {
        setCodeError(api.friendly(err))
      } finally {
        setJoining(false)
      }
    },
    [navigate, station.id]
  )

  useEffect(() => {
    const incoming = params.get('code')
    if (incoming && !autoJoined.current) {
      autoJoined.current = true
      setParams({}, { replace: true })
      join(incoming)
    }
  }, [params, setParams, join])

  const saveName = async () => {
    if (name.trim() === (station.display_name || '')) return
    try { await updateStationName(name) } catch (err) { toast(api.friendly(err), 'error') }
  }

  const confirmDelete = async () => {
    setDeleting(true)
    try {
      await api.deleteWireframe(toDelete.id)
      setWorks((w) => w.filter((x) => x.id !== toDelete.id))
      setToDelete(null)
      toast('Wireframe deleted.', 'success')
    } catch (err) {
      toast(api.friendly(err), 'error')
    } finally {
      setDeleting(false)
    }
  }

  const removeShared = async (id) => {
    try {
      await api.leaveWireframe(id)
      setShared((r) => r.filter((x) => x.id !== id))
    } catch (err) {
      toast(api.friendly(err), 'error')
    }
  }

  const codeChanged = (id, newCode) => {
    setWorks((list) => list.map((w) => (w.id === id ? { ...w, code: newCode } : w)))
    setShareWork((w) => (w && w.id === id ? { ...w, code: newCode } : w))
  }

  return (
    <div className="page">
      <section className="card">
        <div className="hero-copy">
          <span className="eyebrow">Your workspace</span>
          <input
            className="station-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={saveName}
            onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
            placeholder="Name your workspace"
            maxLength={40}
            aria-label="Workspace name"
          />
          <p className="muted">Each wireframe has its own code. Share a wireframe to get its code, and only people with that code can see it.</p>
        </div>
      </section>

      <section>
        <div className="section-head">
          <h2 className="h2">Your wireframes</h2>
          <button className="btn btn-primary" onClick={() => setCreateOpen(true)}><IconPlus /> Create wireframe</button>
        </div>
        {works === null ? (
          <div className="grid">{[0, 1, 2].map((i) => <div key={i} className="work-card skeleton" />)}</div>
        ) : works.length === 0 ? (
          <div className="empty">
            <svg width="120" height="64" viewBox="0 0 120 64" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
              <rect x="2" y="10" width="30" height="44" rx="4" />
              <rect x="88" y="10" width="30" height="44" rx="4" />
              <circle cx="22" cy="24" r="3" fill="currentColor" />
              <path d="M25 24C50 24 60 44 86 40" />
              <path d="M80 35l7 5-8 4" />
            </svg>
            <h3>No wireframes yet</h3>
            <p className="muted">Upload your screens, wire them together and share a wireframe's code with a reviewer.</p>
            <button className="btn btn-primary" onClick={() => setCreateOpen(true)}><IconPlus /> Create wireframe</button>
          </div>
        ) : (
          <div className="grid">
            {works.map((w) => (
              <WorkCard key={w.id} work={w} onOpen={(x) => navigate(`/work/${x.id}`)} onShare={setShareWork} onDelete={setToDelete} />
            ))}
          </div>
        )}
      </section>

      <section className="card">
        <h2 className="h2">Open a shared wireframe</h2>
        <p className="muted">Paste a code you received to review that wireframe.</p>
        <form className="join-form" onSubmit={(e) => { e.preventDefault(); join(code) }}>
          <input
            className="input input-code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="TW-XXXXX-XXXXX"
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck="false"
            aria-label="Wireframe code"
          />
          <button className="btn btn-primary" type="submit" disabled={joining}>{joining ? 'Opening...' : 'Open'}</button>
        </form>
        {codeError && <p className="form-error" role="alert">{codeError}</p>}
      </section>

      {shared.length > 0 && (
        <section>
          <h2 className="h2">Shared with you</h2>
          <ul className="recent">
            {shared.map((r) => (
              <li key={r.id} className="recent-row">
                <div className="recent-text">
                  <strong>{r.title}</strong>
                  <span className="code-sm">from {r.owner || 'a shared workspace'}</span>
                </div>
                <div className="row">
                  <button className="btn btn-sm" onClick={() => navigate(`/work/${r.id}`)}>Open</button>
                  <button className="icon-btn" onClick={() => removeShared(r.id)} aria-label={`Remove ${r.title} from my list`} title="Remove from my list">
                    <IconTrash />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {createOpen && (
        <CreateWireframeModal
          stationId={station.id}
          existingTitles={(works || []).map((w) => w.title)}
          onClose={() => setCreateOpen(false)}
          onCreated={(wf) => { setCreateOpen(false); navigate(`/work/${wf.id}`) }}
        />
      )}

      {shareWork && (
        <ShareModal work={shareWork} onClose={() => setShareWork(null)} onRegenerated={codeChanged} />
      )}

      {toDelete && (
        <ConfirmModal
          title="Delete this wireframe?"
          message={`"${toDelete.title}" and all of its images, wires and issues will be permanently removed from the database.`}
          busy={deleting}
          onConfirm={confirmDelete}
          onClose={() => setToDelete(null)}
        />
      )}
    </div>
  )
}