import { formatDate } from '../lib/format.js'
import { IconImage, IconLink, IconTrash } from './Icons.jsx'

export default function WorkCard({ work, onOpen, onShare, onDelete }) {
  return (
    <article className="work-card">
      <button className="work-open" onClick={() => onOpen(work)} aria-label={`Open ${work.title}`}>
        <div className="thumb">
          {work.thumb ? <img src={work.thumb} alt="" loading="lazy" draggable="false" /> : <IconImage width={28} height={28} />}
        </div>
        <div className="work-meta">
          <h3>{work.title}</h3>
          <p className="muted small">
            {work.count} {work.count === 1 ? 'page' : 'pages'} - Updated {formatDate(work.updated_at)}
          </p>
        </div>
      </button>
      {(onShare || onDelete) && (
        <div className="work-actions">
          {onShare && (
            <button className="icon-btn work-act" onClick={() => onShare(work)} aria-label={`Share ${work.title}`} title="Share code">
              <IconLink />
            </button>
          )}
          {onDelete && (
            <button className="icon-btn work-act is-danger" onClick={() => onDelete(work)} aria-label={`Delete ${work.title}`} title="Delete wireframe">
              <IconTrash />
            </button>
          )}
        </div>
      )}
    </article>
  )
}