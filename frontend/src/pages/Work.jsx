import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useApp } from '../context.jsx'
import * as api from '../lib/api.js'
import WireCanvas from '../components/WireCanvas.jsx'
import ShareModal from '../components/ShareModal.jsx'
import { IconArrowLeft, IconLink } from '../components/Icons.jsx'

export default function Work() {
  const { workId } = useParams()
  const { userId } = useApp()
  const [work, setWork] = useState(undefined)
  const [share, setShare] = useState(false)

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
          <p className="muted">It may have been deleted, or you need to enter its code first.</p>
          <Link to="/" className="btn btn-primary">Back home</Link>
        </div>
      </div>
    )
  }

  const isOwner = work.stations.owner_id === userId
  const stationName = work.stations.display_name || 'a shared station'

  return (
    <div className="work-page">
      <div className="work-top">
        <Link className="btn btn-ghost btn-sm" to="/">
          <IconArrowLeft />
          <span>Back</span>
        </Link>
        <div className="work-title">
          <h1>{work.title}</h1>
          <span className={`pill ${isOwner ? 'pill-accent' : 'pill-warn'}`}>{isOwner ? 'Your wireframe' : `Reviewing ${stationName}`}</span>
        </div>
        {isOwner && (
          <button className="btn btn-sm" onClick={() => setShare(true)}>
            <IconLink />
            <span>Share</span>
          </button>
        )}
      </div>
      <WireCanvas key={work.id} work={work} isOwner={isOwner} userId={userId} />
      {share && (
        <ShareModal
          work={work}
          onClose={() => setShare(false)}
          onRegenerated={(id, code) => setWork((w) => ({ ...w, code }))}
        />
      )}
    </div>
  )
}