import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useApp } from '../context.jsx'
import * as api from '../lib/api.js'
import { supabase } from '../lib/supabase.js'
import { roleLabel } from '../lib/roles.js'
import WireCanvas from '../components/WireCanvas.jsx'
import ShareModal from '../components/ShareModal.jsx'
import ExportModal from '../components/ExportModal.jsx'
import { IconArrowLeft, IconDownload, IconLink } from '../components/Icons.jsx'

export default function Work() {
  const { workId } = useParams()
  const { userId, toast, account, openAccount } = useApp()
  const [state, setState] = useState({ status: 'loading', work: null, role: null })
  const [dialog, setDialog] = useState(null)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')

  const load = useCallback(async () => {
    try {
      const [work, role] = await Promise.all([api.getWork(workId), api.getRole(workId)])
      if (!work || !role) setState({ status: 'denied', work: null, role: null })
      else setState({ status: 'ready', work, role })
    } catch {
      setState((s) => (s.status === 'ready' ? s : { status: 'error', work: null, role: null }))
    }
  }, [workId])

  useEffect(() => {
    setState({ status: 'loading', work: null, role: null })
    load()
  }, [load])

  // keep the role and sharing settings current: poll, refresh on focus, and listen for changes
  useEffect(() => {
    const t = setInterval(load, 60000)
    const onVisible = () => { if (document.visibilityState === 'visible') load() }
    document.addEventListener('visibilitychange', onVisible)
    const channel = supabase
      .channel(`meta:${workId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'wireframes', filter: `id=eq.${workId}` }, () => load())
      .subscribe()
    return () => {
      clearInterval(t)
      document.removeEventListener('visibilitychange', onVisible)
      supabase.removeChannel(channel)
    }
  }, [workId, load])

  if (state.status === 'loading') return <div className="center"><div className="spinner" role="status" aria-label="Loading" /></div>

  if (state.status === 'error') {
    return (
      <div className="page">
        <div className="card empty-card">
          <h2>Could not open this wireframe</h2>
          <p className="muted">Check your connection and try again.</p>
          <button className="btn btn-primary" onClick={() => { setState({ status: 'loading', work: null, role: null }); load() }}>Try again</button>
        </div>
      </div>
    )
  }

  if (state.status === 'denied') {
    return (
      <div className="page">
        <div className="card empty-card">
          <h2>You need access</h2>
          <p className="muted">
            This wireframe is private, was deleted, or your access was removed.
          </p>
          {account.isAnonymous ? (
            <>
              <p className="muted">If the owner invited your email, link or sign in with that email to open it.</p>
              <button className="btn btn-primary" onClick={() => openAccount('link')}>Use my email</button>
            </>
          ) : (
            <>
              <p className="muted">You are signed in as <strong>{account.email}</strong>. Ask the owner to invite this email, or sign in with a different one.</p>
              <button className="btn btn-primary" onClick={() => openAccount('signin')}>Switch account</button>
            </>
          )}
          <Link to="/" className="btn">Back home</Link>
        </div>
      </div>
    )
  }

  const { work, role } = state
    const isOwner = role === 'owner' || role === 'admin'
  const stationName = work.stations.display_name || 'a shared workspace'

  const patchWork = (patch) => setState((s) => ({ ...s, work: { ...s.work, ...patch } }))

  const commitTitle = async () => {
    setEditing(false)
    const t = draft.trim()
    if (!t || t === work.title) return
    try {
      const row = await api.renameWireframe(work.id, t)
      patchWork({ title: row.title })
    } catch (err) {
      toast(api.friendly(err), 'error')
    }
  }

  return (
    <div className="work-page">
      <div className="work-top">
        <Link className="btn btn-ghost btn-sm" to="/">
          <IconArrowLeft />
          <span className="hide-sm">Back</span>
        </Link>
        <div className="work-title">
          {isOwner && editing ? (
            <input
              className="input title-input"
              value={draft}
              maxLength={120}
              autoFocus
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commitTitle}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur()
                if (e.key === 'Escape') { setDraft(work.title); setEditing(false) }
              }}
              aria-label="Wireframe title"
            />
          ) : isOwner ? (
            <h1>
              <button className="title-btn" onClick={() => { setDraft(work.title); setEditing(true) }} title="Click to rename">{work.title}</button>
            </h1>
          ) : (
            <h1>{work.title}</h1>
          )}
          <span className={`pill ${isOwner ? 'pill-accent' : role === 'editor' ? 'pill-success' : 'pill-warn'}`}>
            {role === 'admin' ? `Admin access - ${stationName}` : isOwner ? 'Your wireframe' : `${roleLabel(role)} - ${stationName}`}
          </span>
        </div>
        <button className="btn btn-sm" onClick={() => setDialog('export')} title="Export">
          <IconDownload />
          <span className="hide-sm">Export</span>
        </button>
        {isOwner && (
          <button className="btn btn-sm" onClick={() => setDialog('share')}>
            <IconLink />
            <span className="hide-sm">Share</span>
          </button>
        )}
      </div>

      <WireCanvas key={work.id} work={work} role={role} userId={userId} />

      {dialog === 'share' && <ShareModal work={work} onClose={() => setDialog(null)} onChanged={patchWork} />}
      {dialog === 'export' && <ExportModal work={work} onClose={() => setDialog(null)} />}
    </div>
  )
}