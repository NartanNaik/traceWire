import { useEffect, useMemo, useState } from 'react'
import { useApp } from '../context.jsx'
import * as api from '../lib/api.js'
import { formatDateTime } from '../lib/format.js'
import ReactionBar from './ReactionBar.jsx'
import Composer from './Composer.jsx'
import { ConfirmModal } from './Modal.jsx'
import { IconChevronDown, IconEdit, IconReply, IconTrash } from './Icons.jsx'

function descendants(tree, id) {
  const out = []
  const walk = (cid) => {
    ;(tree.get(cid) || []).forEach((k) => {
      out.push(k)
      walk(k.id)
    })
  }
  walk(id)
  return out
}

function EditBox({ initial, onSave, onCancel }) {
  const [text, setText] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const save = async () => {
    setBusy(true)
    setError('')
    try {
      await onSave(text.trim())
    } catch (err) {
      setError(api.friendly(err))
      setBusy(false)
    }
  }

  return (
    <div className="edit-box">
      <textarea
        className="input textarea"
        rows={3}
        value={text}
        onChange={(e) => setText(e.target.value)}
        maxLength={4000}
        autoFocus
        disabled={busy}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault()
            save()
          }
          if (e.key === 'Escape') onCancel()
        }}
      />
      <div className="row">
        <button type="button" className="btn btn-primary btn-xs" onClick={save} disabled={busy}>{busy ? 'Saving...' : 'Save'}</button>
        <button type="button" className="btn btn-xs" onClick={onCancel} disabled={busy}>Cancel</button>
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
    </div>
  )
}

function Node({ c, depth, ctx }) {
  const kids = ctx.tree.get(c.id) || []
  const collapsed = ctx.collapsed.has(c.id)
  const mine = c.author_id === ctx.userId
  const byOwner = c.author_id === ctx.ownerId
  const hidden = collapsed ? descendants(ctx.tree, c.id).length : 0
  const url = c.image_path ? ctx.urls[c.image_path] : null
  const editing = ctx.editId === c.id

  return (
    <li className="comment">
      <div className="comment-head">
        <button
          type="button"
          className={`collapse-btn ${collapsed ? 'is-closed' : ''}`}
          onClick={() => ctx.toggle(c.id)}
          aria-expanded={!collapsed}
          aria-label={collapsed ? 'Expand thread' : 'Collapse thread'}
        >
          <IconChevronDown width={14} height={14} />
        </button>
        <strong className="comment-author">{c.author_name}</strong>
        {byOwner && <span className="pill pill-accent">Owner</span>}
        {mine && <span className="pill">You</span>}
        <span className="muted small">{formatDateTime(c.created_at)}</span>
        {c.edited_at && <span className="muted small edited" title={formatDateTime(c.edited_at)}>edited</span>}
      </div>

      {collapsed ? (
        <p className="muted small comment-collapsed">
          {hidden ? `${hidden} ${hidden === 1 ? 'reply' : 'replies'} hidden` : 'Hidden'}
        </p>
      ) : (
        <div className="comment-main">
          {editing ? (
            <EditBox initial={c.body} onSave={(text) => ctx.edit(c, text)} onCancel={() => ctx.setEditId(null)} />
          ) : (
            c.body && <p className="comment-body">{c.body}</p>
          )}
          {c.image_path &&
            (url ? (
              <a className="comment-img" href={url} target="_blank" rel="noreferrer" title="Open full size">
                <img src={url} alt="Attached to this reply" loading="lazy" />
              </a>
            ) : (
              <div className="comment-img is-loading" />
            ))}

          <div className="comment-actions">
            <ReactionBar
              reactions={ctx.byComment[c.id] || []}
              userId={ctx.userId}
              onToggle={(emoji) => ctx.onReact({ commentId: c.id, emoji })}
            />
            <button type="button" className="btn btn-ghost btn-xs" onClick={() => ctx.setReplyTo(ctx.replyTo === c.id ? null : c.id)}>
              <IconReply width={14} height={14} /> Reply
            </button>
            {mine && !editing && (
              <button type="button" className="btn btn-ghost btn-xs" onClick={() => ctx.setEditId(c.id)}>
                <IconEdit width={14} height={14} /> Edit
              </button>
            )}
            {(mine || ctx.isOwner) && (
              <button type="button" className="btn btn-ghost btn-xs btn-danger-ghost" onClick={() => ctx.askDelete(c)}>
                <IconTrash width={14} height={14} /> Delete
              </button>
            )}
          </div>

          {ctx.replyTo === c.id && (
            <div className="reply-box">
              <Composer
                defaultName={ctx.defaultName}
                placeholder={`Reply to ${c.author_name}`}
                submitLabel="Reply"
                autoFocus
                onCancel={() => ctx.setReplyTo(null)}
                onSubmit={async (v) => {
                  await ctx.post({ parentId: c.id, ...v })
                  ctx.setReplyTo(null)
                }}
              />
            </div>
          )}

          {kids.length > 0 && (
            <ul className={`replies ${depth >= 3 ? 'is-flat' : ''}`}>
              {kids.map((k) => (
                <Node key={k.id} c={k} depth={depth + 1} ctx={ctx} />
              ))}
            </ul>
          )}
        </div>
      )}
    </li>
  )
}

export default function Discussion({ issue, comments, reactions, userId, ownerId, isOwner, defaultName, onPost, onEdit, onDelete, onReact }) {
  const { toast } = useApp()
  const [replyTo, setReplyTo] = useState(null)
  const [editId, setEditId] = useState(null)
  const [collapsed, setCollapsed] = useState(() => new Set())
  const [urls, setUrls] = useState({})
  const [toDelete, setToDelete] = useState(null)
  const [deleting, setDeleting] = useState(false)

  const mineComments = useMemo(() => comments.filter((c) => c.issue_id === issue.id), [comments, issue.id])

  const tree = useMemo(() => {
    const ids = new Set(mineComments.map((c) => c.id))
    const map = new Map()
    const sorted = [...mineComments].sort((a, b) => a.created_at.localeCompare(b.created_at))
    sorted.forEach((c) => {
      const key = c.parent_id && ids.has(c.parent_id) ? c.parent_id : 'root'
      if (!map.has(key)) map.set(key, [])
      map.get(key).push(c)
    })
    return map
  }, [mineComments])

  const { issueReactions, byComment } = useMemo(() => {
    const out = { issueReactions: [], byComment: {} }
    reactions.forEach((r) => {
      if (r.issue_id !== issue.id) return
      if (r.comment_id) (out.byComment[r.comment_id] = out.byComment[r.comment_id] || []).push(r)
      else out.issueReactions.push(r)
    })
    return out
  }, [reactions, issue.id])

  // signed image links are refreshed well before they expire
  const imageKey = mineComments.map((c) => c.image_path).filter(Boolean).join('|')
  useEffect(() => {
    if (!imageKey) return undefined
    let alive = true
    const sign = (force) =>
      api
        .signPaths(imageKey.split('|'), api.COMMENT_BUCKET, force)
        .then((m) => alive && setUrls((u) => ({ ...u, ...m })))
        .catch(() => {})
    sign(false)
    const t = setInterval(() => sign(true), 40 * 60 * 1000)
    return () => {
      alive = false
      clearInterval(t)
    }
  }, [imageKey])

  const toggle = (id) =>
    setCollapsed((s) => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const askDelete = (c) => {
    const sub = descendants(tree, c.id)
    setToDelete({ c, replies: sub.length, ids: [c.id, ...sub.map((k) => k.id)] })
  }

  const confirmDelete = async () => {
    setDeleting(true)
    try {
      await onDelete({ rootId: toDelete.c.id, ids: toDelete.ids })
      setToDelete(null)
    } catch (err) {
      toast(api.friendly(err), 'error')
    } finally {
      setDeleting(false)
    }
  }

  const ctx = {
    tree,
    collapsed,
    toggle,
    replyTo,
    setReplyTo,
    editId,
    setEditId,
    userId,
    ownerId,
    isOwner,
    urls,
    byComment,
    defaultName,
    askDelete,
    onReact: ({ commentId, emoji }) => onReact({ issue, commentId, emoji }),
    post: (v) => onPost({ issue, ...v }),
    edit: async (c, text) => {
      if (text === c.body) return setEditId(null)
      if (!text && !c.image_path) throw new Error('A reply needs text or an image.')
      await onEdit({ id: c.id, body: text })
      setEditId(null)
    },
  }

  const roots = tree.get('root') || []
  const count = mineComments.length

  return (
    <section className="discussion" aria-label="Discussion">
      <div className="discussion-head">
        <h4>Discussion</h4>
        <span className="muted small">{count} {count === 1 ? 'reply' : 'replies'}</span>
      </div>

      <ReactionBar reactions={issueReactions} userId={userId} onToggle={(emoji) => onReact({ issue, commentId: null, emoji })} />

      {roots.length ? (
        <ul className="comments">
          {roots.map((c) => (
            <Node key={c.id} c={c} depth={0} ctx={ctx} />
          ))}
        </ul>
      ) : (
        <p className="muted small">No replies yet. Start the conversation below.</p>
      )}

      <Composer
        defaultName={defaultName}
        placeholder="Write a reply. Paste or attach an image, or add emojis."
        submitLabel="Reply"
        onSubmit={(v) => onPost({ issue, parentId: null, ...v })}
      />

      {toDelete && (
        <ConfirmModal
          title="Delete this reply?"
          message={`This reply${toDelete.replies ? ` and its ${toDelete.replies} ${toDelete.replies === 1 ? 'reply' : 'replies'}` : ''} will be permanently removed, including any attached images.`}
          busy={deleting}
          onConfirm={confirmDelete}
          onClose={() => setToDelete(null)}
        />
      )}
    </section>
  )
}