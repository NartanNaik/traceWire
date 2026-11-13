import { useMemo, useState } from 'react'
import { IconArrowLeft, IconCheck, IconClose, IconFlag, IconTrash } from './Icons.jsx'
import { formatDateTime } from '../lib/format.js'
import Discussion from './Discussion.jsx'

export default function IssueDrawer({
  issues, numbers, pageNames, activeId, isOwner, userId, ownerId, coarse,
  comments, reactions, unread, defaultName,
  onSelect, onClose, onFocus, onToggle, onDelete,
  onPostComment, onEditComment, onDeleteComment, onReact,
}) {
  const [filter, setFilter] = useState('all')
  const [query, setQuery] = useState('')
  const active = issues.find((i) => i.id === activeId) || null
  const openCount = issues.filter((i) => i.status === 'open').length

  const q = query.trim().toLowerCase()
  const list = issues.filter((i) => {
    if (filter !== 'all' && i.status !== filter) return false
    if (!q) return true
    return [i.title, i.details, i.fix, i.author_name].some((t) => (t || '').toLowerCase().includes(q))
  })

  const counts = useMemo(() => {
    const m = {}
    comments.forEach((c) => { m[c.issue_id] = (m[c.issue_id] || 0) + 1 })
    return m
  }, [comments])

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

            <Discussion
              key={active.id}
              issue={active}
              comments={comments}
              reactions={reactions}
              userId={userId}
              ownerId={ownerId}
              isOwner={isOwner}
              defaultName={defaultName}
              onPost={onPostComment}
              onEdit={onEditComment}
              onDelete={onDeleteComment}
              onReact={onReact}
            />
          </div>
        ) : (
          <>
            {issues.length > 3 && (
              <input
                className="input search"
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search issues"
                aria-label="Search issues"
              />
            )}
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
                  : 'Nothing matches.'}
              </p>
            ) : (
              <ul className="issue-list">
                {list.map((i) => (
                  <li key={i.id}>
                    <button className="issue-row" onClick={() => onSelect(i.id)}>
                      <span className={`pin-badge ${i.status === 'resolved' ? 'is-resolved' : ''}`}>{numbers[i.id]}</span>
                      <span className="issue-row-text">
                        <strong>{i.title}</strong>
                        <span className="muted small">
                          {i.author_name} - {formatDateTime(i.created_at)}
                          {counts[i.id] ? ` - ${counts[i.id]} ${counts[i.id] === 1 ? 'reply' : 'replies'}` : ''}
                        </span>
                      </span>
                      {unread.has(i.id) && <span className="unread-dot" title="New activity" aria-label="New activity" />}
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