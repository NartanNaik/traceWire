import { useState } from 'react'
import { IconArrowLeft, IconCheck, IconClose, IconFlag, IconTrash } from './Icons.jsx'
import { formatDateTime } from '../lib/format.js'

export default function IssueDrawer({
  issues, numbers, pageNames, activeId, isOwner, userId, coarse,
  onSelect, onClose, onFocus, onToggle, onDelete,
}) {
  const [filter, setFilter] = useState('all')
  const active = issues.find((i) => i.id === activeId) || null
  const list = issues.filter((i) => filter === 'all' || i.status === filter)
  const openCount = issues.filter((i) => i.status === 'open').length

  return (
    <aside className="drawer" aria-label="Issues">
      <div className="drawer-head">
        {active ? (
          <button className="btn btn-ghost btn-sm" onClick={() => onSelect(null)}>
            <IconArrowLeft /> All issues
          </button>
        ) : (
          <h2>Issues <span className="muted small">{openCount} open</span></h2>
        )}
        <button className="icon-btn" onClick={onClose} aria-label="Close issues"><IconClose /></button>
      </div>

      <div className="drawer-body">
        {active ? (
          <div className="stack">
            <div className="issue-top">
              <span className={`pin-badge ${active.status === 'resolved' ? 'is-resolved' : ''}`}>{numbers[active.id]}</span>
              <span className={`pill ${active.status === 'resolved' ? 'pill-success' : 'pill-warn'}`}>
                {active.status === 'resolved' ? 'Resolved' : 'Open'}
              </span>
            </div>
            <h3 className="issue-title">{active.title}</h3>
            <dl className="issue-meta">
              <div><dt>Reported by</dt><dd>{active.author_name}</dd></div>
              <div><dt>Date and time</dt><dd>{formatDateTime(active.created_at)}</dd></div>
              <div><dt>Page</dt><dd>{pageNames[active.screen_id] || 'Removed page'}</dd></div>
            </dl>
            <div className="issue-block">
              <h4>Explanation</h4>
              <p>{active.details || 'No explanation given.'}</p>
            </div>
            <div className="issue-block">
              <h4>Suggested fix</h4>
              <p>{active.fix || 'No fix suggested.'}</p>
            </div>
            <div className="row wrap">
              <button className="btn btn-sm" onClick={() => onFocus(active)}><IconFlag /> Go to pin</button>
              {isOwner && (
                <button className="btn btn-sm" onClick={() => onToggle(active)}>
                  <IconCheck /> {active.status === 'resolved' ? 'Reopen' : 'Mark resolved'}
                </button>
              )}
              {(isOwner || active.author_id === userId) && (
                <button className="btn btn-sm btn-danger-ghost" onClick={() => onDelete(active)}><IconTrash /> Delete</button>
              )}
            </div>
          </div>
        ) : (
          <>
            <div className="chips" role="tablist" aria-label="Filter issues">
              {['all', 'open', 'resolved'].map((f) => (
                <button key={f} className={`chip ${filter === f ? 'is-on' : ''}`} onClick={() => setFilter(f)} role="tab" aria-selected={filter === f}>
                  {f[0].toUpperCase() + f.slice(1)}
                </button>
              ))}
            </div>
            {list.length === 0 ? (
              <p className="muted empty-note">
                {issues.length === 0
                  ? isOwner
                    ? 'No issues yet. Reviewers can report problems by right-clicking a page.'
                    : coarse
                      ? 'No issues yet. Long-press a page to report one.'
                      : 'No issues yet. Right-click a page to report one.'
                  : 'Nothing in this filter.'}
              </p>
            ) : (
              <ul className="issue-list">
                {list.map((i) => (
                  <li key={i.id}>
                    <button className="issue-row" onClick={() => onSelect(i.id)}>
                      <span className={`pin-badge ${i.status === 'resolved' ? 'is-resolved' : ''}`}>{numbers[i.id]}</span>
                      <span className="issue-row-text">
                        <strong>{i.title}</strong>
                        <span className="muted small">{i.author_name} - {formatDateTime(i.created_at)}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </aside>
  )
}