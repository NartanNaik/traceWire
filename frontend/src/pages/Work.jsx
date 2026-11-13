import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useApp } from '../context.jsx'
import * as api from '../lib/api.js'
import WireCanvas from '../components/WireCanvas.jsx'
import ShareModal from '../components/ShareModal.jsx'
import PeopleModal from '../components/PeopleModal.jsx'
import ExportModal from '../components/ExportModal.jsx'
import { IconArrowLeft, IconDownload, IconLink, IconUsers } from '../components/Icons.jsx'

export default function Work() {
  const { workId } = useParams()
  const { userId, toast } = useApp()
  const [work, setWork] = useState(undefined)
  const [dialog, setDialog] = useState(null)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')

  useEffect(() => {
    let alive = true
    setWork(undefined)
    api.getWork(workId)
      .then((w) => alive && setWork(w))
      .catch(() => alive && setWork(null))
    return () => { alive = false }
  }, [workId])

  if (work === undefined) return <div className="center"><div className="spinner" role="status" aria-label="Loading" /></div>

  if (!work) {
    return (
      <div className="page">
        <div className="card empty-card">
          <h2>Wireframe not found</h2>
          <p className="muted">It may have been deleted, you may have been removed, or you need to enter its code first.</p>
          <Link to="/" className="btn btn-primary">Back home</Link>
        </div>
      </div>
    )
  }

  const isOwner = work.stations.owner_id === userId
  const stationName = work.stations.display_name || 'a shared station'

  const commitTitle = async () => {
    setEditing(false)
    const t = draft.trim()
    if (!t || t === work.title) return
    try {
      const row = await api.renameWireframe(work.id, t)
      setWork((w) => ({ ...w, title: row.title }))
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
          <span className={`pill ${isOwner ? 'pill-accent' : 'pill-warn'}`}>{isOwner ? 'Your wireframe' : `Reviewing ${stationName}`}</span>
        </div>
        <button className="btn btn-sm" onClick={() => setDialog('export')} title="Export">
          <IconDownload />
          <span className="hide-sm">Export</span>
        </button>
        {isOwner && (
          <>
            <button className="btn btn-sm" onClick={() => setDialog('people')} title="People with access">
              <IconUsers />
              <span className="hide-sm">People</span>
            </button>
            <button className="btn btn-sm" onClick={() => setDialog('share')}>
              <IconLink />
              <span className="hide-sm">Share</span>
            </button>
          </>
        )}
      </div>

      <WireCanvas key={work.id} work={work} isOwner={isOwner} userId={userId} />

      {dialog === 'share' && (
        <ShareModal work={work} onClose={() => setDialog(null)} onRegenerated={(id, code) => setWork((w) => ({ ...w, code }))} />
      )}
      {dialog === 'people' && <PeopleModal work={work} onClose={() => setDialog(null)} />}
      {dialog === 'export' && <ExportModal work={work} onClose={() => setDialog(null)} />}
    </div>
  )
}