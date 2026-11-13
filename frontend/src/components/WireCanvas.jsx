import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useApp } from '../context.jsx'
import * as api from '../lib/api.js'
import { supabase } from '../lib/supabase.js'
import { clamp, hitScreen, wirePath } from '../lib/geometry.js'
import { safeGet, safeSet } from '../lib/format.js'
import IssueForm from './IssueForm.jsx'
import IssueDrawer from './IssueDrawer.jsx'
import NoteModal from './NoteModal.jsx'
import { ConfirmModal } from './Modal.jsx'
import { IconClose, IconFit, IconImage, IconList, IconMinus, IconMove, IconNote, IconPlus, IconTrash } from './Icons.jsx'

const MIN_ZOOM = 0.1
const MAX_ZOOM = 3
const URL_REFRESH_MS = 40 * 60 * 1000
const isCoarse = () => typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(pointer: coarse)').matches
const hasNote = (n) => Boolean(n && n.trim())

function ScreenLabel({ screen, zoom, canEdit, onRename, onDelete, onNote }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(screen.name)
  useEffect(() => setValue(screen.name), [screen.name])

  const commit = () => {
    setEditing(false)
    if (value.trim() && value.trim() !== screen.name) onRename(screen.id, value)
    else setValue(screen.name)
  }

  const noted = hasNote(screen.note)

  return (
    <div className="screen-label" data-ui style={{ width: Math.max(screen.w * zoom, 150), transform: `scale(${1 / zoom})` }}>
      {editing ? (
        <input
          className="screen-input"
          value={value}
          autoFocus
          maxLength={60}
          onChange={(e) => setValue(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit()
            if (e.key === 'Escape') { setValue(screen.name); setEditing(false) }
          }}
        />
      ) : (
        <span
          className={`screen-name ${canEdit ? 'is-editable' : ''}`}
          title={canEdit ? 'Click to rename' : screen.name}
          onClick={() => canEdit && setEditing(true)}
        >
          {screen.name}
        </span>
      )}
      {(canEdit || noted) && (
        <span className="screen-actions">
          <button
            className={`icon-btn icon-btn-sm note-btn ${noted ? 'has-note' : ''}`}
            onClick={() => onNote(screen)}
            aria-label={noted ? `Note on ${screen.name}` : `Add note to ${screen.name}`}
            title={noted ? (canEdit ? 'Edit note' : 'Read note') : 'Add note'}
          >
            <IconNote width={15} height={15} />
          </button>
          {canEdit && (
            <button className="icon-btn icon-btn-sm" onClick={() => onDelete(screen)} aria-label={`Delete page ${screen.name}`} title="Delete page">
              <IconTrash width={15} height={15} />
            </button>
          )}
        </span>
      )}
    </div>
  )
}

export default function WireCanvas({ work, isOwner, userId }) {
  const { toast } = useApp()
  const vpRef = useRef(null)
  const fileRef = useRef(null)

  const [loading, setLoading] = useState(true)
  const [screens, setScreens] = useState([])
  const [links, setLinks] = useState([])
  const [issues, setIssues] = useState([])
  const [comments, setComments] = useState([])
  const [reactions, setReactions] = useState([])
  const [unread, setUnread] = useState(() => new Set())
  const [urls, setUrls] = useState({})
  const [view, setView] = useState({ x: work.view_x, y: work.view_y, zoom: work.view_zoom })
  const [pending, setPending] = useState(null)
  const [adjust, setAdjust] = useState(null)
  const [selectedLink, setSelectedLink] = useState(null)
  const [moveMode, setMoveMode] = useState(false)
  const [issueDraft, setIssueDraft] = useState(null)
  const [noteTarget, setNoteTarget] = useState(null)
  const [drawer, setDrawer] = useState(false)
  const [activeIssue, setActiveIssue] = useState(null)
  const [freshIssue, setFreshIssue] = useState(null)
  const [saveState, setSaveState] = useState('saved')
  const [uploading, setUploading] = useState(null)
  const [confirm, setConfirm] = useState(null)
  const [busy, setBusy] = useState(false)
  const [hintDismissed, setHintDismissed] = useState(() => safeGet('tracewire.hint') === '1')
  const coarse = isCoarse()

  const live = useRef({})
  live.current = { screens, links, view, pending, adjust, moveMode, isOwner, selectedLink, activeIssue, drawer }

  const pointers = useRef(new Map())
  const gesture = useRef(null)
  const press = useRef(null)
  const touchActive = useRef(false)
  const lastTouchEnd = useRef(0)
  const saveTimer = useRef(null)
  const saving = useRef(false)
  const dirty = useRef(new Set())
  const viewDirty = useRef(false)
  const fitted = useRef(false)
  const lastImgRefresh = useRef(0)

  /* ---------- saving ---------- */
  const flush = useCallback(async () => {
    if (!isOwner) return
    clearTimeout(saveTimer.current)
    const ids = [...dirty.current]
    if (!ids.length && !viewDirty.current) return
    dirty.current.clear()
    viewDirty.current = false
    setSaveState('saving')
    saving.current = true
    const l = live.current
    try {
      await Promise.all([
        ...ids.map((id) => {
          const s = l.screens.find((x) => x.id === id)
          return s ? api.updateScreen(id, { x: s.x, y: s.y }) : Promise.resolve()
        }),
        api.updateView(work.id, l.view),
      ])
      setSaveState(dirty.current.size || viewDirty.current ? 'dirty' : 'saved')
    } catch {
      ids.forEach((id) => dirty.current.add(id))
      viewDirty.current = true
      setSaveState('error')
      saveTimer.current = setTimeout(flush, 5000)
    } finally {
      saving.current = false
    }
  }, [isOwner, work.id])

  const scheduleSave = useCallback(() => {
    if (!isOwner) return
    setSaveState('dirty')
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(flush, 700)
  }, [isOwner, flush])

  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') flush()
    }
    window.addEventListener('pagehide', flush)
    document.addEventListener('visibilitychange', onHide)
    return () => {
      window.removeEventListener('pagehide', flush)
      document.removeEventListener('visibilitychange', onHide)
      flush()
    }
  }, [flush])

  const applyView = useCallback(
    (next) => {
      live.current.view = next
      setView(next)
      if (isOwner) {
        viewDirty.current = true
        scheduleSave()
      }
    },
    [isOwner, scheduleSave]
  )

  /* ---------- loading ---------- */
  const loadAll = useCallback(
    async (initial) => {
      try {
        const d = await api.fetchCanvas(work.id)
        const map = await api.signPaths(d.screens.map((s) => s.image_path))
        setUrls((u) => ({ ...u, ...map }))
        setScreens(d.screens)
        setLinks(d.links)
        setIssues(d.issues)
        setComments(d.comments)
        setReactions(d.reactions)
      } catch (err) {
        if (initial) toast(api.friendly(err), 'error')
      } finally {
        if (initial) setLoading(false)
      }
    },
    [work.id, toast]
  )

  useEffect(() => {
    loadAll(true)
  }, [loadAll])

  const refreshUnread = useCallback(() => {
    api.listUnread()
      .then((rows) => setUnread(new Set(rows.filter((r) => r.wireframe_id === work.id).map((r) => r.issue_id))))
      .catch(() => {})
  }, [work.id])

  useEffect(() => {
    refreshUnread()
  }, [refreshUnread])

  /* ---------- signed image links stay fresh ---------- */
  const refreshUrls = useCallback(async () => {
    const paths = live.current.screens.map((s) => s.image_path)
    if (!paths.length) return
    try {
      const map = await api.signPaths(paths, api.SCREEN_BUCKET, true)
      setUrls((u) => ({ ...u, ...map }))
    } catch {
      /* tried again later */
    }
  }, [])

  useEffect(() => {
    const t = setInterval(refreshUrls, URL_REFRESH_MS)
    return () => clearInterval(t)
  }, [refreshUrls])

  const onImgError = () => {
    if (Date.now() - lastImgRefresh.current < 30000) return
    lastImgRefresh.current = Date.now()
    refreshUrls()
  }

  // when you return to the tab: renew links, refresh unread, and re-sync the canvas if nothing is unsaved
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return
      refreshUrls()
      refreshUnread()
      const l = live.current
      const busyOwner = isOwner && (dirty.current.size || viewDirty.current || saving.current || l.adjust || l.pending)
      if (!busyOwner) loadAll(false)
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [isOwner, loadAll, refreshUrls, refreshUnread])

  /* ---------- realtime ---------- */
  useEffect(() => {
    const timers = []
    const debounced = (fn) => {
      let t
      return () => {
        clearTimeout(t)
        t = setTimeout(fn, 350)
        timers.push(t)
      }
    }
    const reloadDiscussion = debounced(() =>
      api.fetchDiscussion(work.id).then((d) => { setComments(d.comments); setReactions(d.reactions) }).catch(() => {})
    )
    const reloadIssues = debounced(() => api.listIssues(work.id).then(setIssues).catch(() => {}))
    const reloadEverything = debounced(() => loadAll(false))

    const notify = (table, row) => {
      if (!row || row.author_id === userId) return
      const l = live.current
      if (table === 'issues') {
        setUnread((s) => new Set(s).add(row.id))
        toast(`${row.author_name} reported a new issue.`, 'info')
      } else if (l.drawer && l.activeIssue === row.issue_id && document.visibilityState === 'visible') {
        api.markRead(row.issue_id).catch(() => {})
      } else {
        setUnread((s) => new Set(s).add(row.issue_id))
        toast(`${row.author_name} replied to an issue.`, 'info')
      }
    }

    const channel = supabase.channel(`work:${work.id}`)
    const filter = `wireframe_id=eq.${work.id}`
    const on = (table, reload) =>
      channel.on('postgres_changes', { event: '*', schema: 'public', table, filter }, (payload) => {
        if (payload.eventType === 'INSERT' && (table === 'issues' || table === 'issue_comments')) notify(table, payload.new)
        reload()
      })

    if (isOwner) {
      on('issues', reloadIssues)
    } else {
      on('issues', reloadEverything)
      on('screens', reloadEverything)
      on('links', reloadEverything)
    }
    on('issue_comments', reloadDiscussion)
    on('reactions', reloadDiscussion)

    channel.subscribe()
    return () => {
      timers.forEach(clearTimeout)
      supabase.removeChannel(channel)
    }
  }, [work.id, isOwner, loadAll, userId, toast])

  /* ---------- tab title shows unread ---------- */
  useEffect(() => {
    const n = unread.size
    document.title = `${n ? `(${n}) ` : ''}${work.title} - Tracewire`
    return () => { document.title = 'Tracewire' }
  }, [unread, work.title])

  /* ---------- view helpers ---------- */
  const toWorld = useCallback((cx, cy) => {
    const r = vpRef.current.getBoundingClientRect()
    const v = live.current.view
    return { x: (cx - r.left - v.x) / v.zoom, y: (cy - r.top - v.y) / v.zoom }
  }, [])

  const zoomAt = useCallback(
    (px, py, nextZoom) => {
      const v = live.current.view
      const z = clamp(nextZoom, MIN_ZOOM, MAX_ZOOM)
      const k = z / v.zoom
      applyView({ x: px - (px - v.x) * k, y: py - (py - v.y) * k, zoom: z })
    },
    [applyView]
  )

  const zoomBy = useCallback(
    (factor) => {
      const r = vpRef.current.getBoundingClientRect()
      zoomAt(r.width / 2, r.height / 2, live.current.view.zoom * factor)
    },
    [zoomAt]
  )

  const fit = useCallback(() => {
    const el = vpRef.current
    if (!el) return
    const list = live.current.screens
    if (!list.length) return applyView({ x: 40, y: 60, zoom: 1 })
    const minX = Math.min(...list.map((s) => s.x))
    const minY = Math.min(...list.map((s) => s.y))
    const maxX = Math.max(...list.map((s) => s.x + s.w))
    const maxY = Math.max(...list.map((s) => s.y + s.h))
    const bw = maxX - minX
    const bh = maxY - minY
    const r = el.getBoundingClientRect()
    const zoom = clamp(Math.min((r.width - 80) / bw, (r.height - 120) / bh, 1), MIN_ZOOM, MAX_ZOOM)
    applyView({
      zoom,
      x: (r.width - bw * zoom) / 2 - minX * zoom,
      y: (r.height - bh * zoom) / 2 - minY * zoom + 12,
    })
  }, [applyView])

  useEffect(() => {
    if (loading || fitted.current) return
    fitted.current = true
    if (work.view_x === 0 && work.view_y === 0 && work.view_zoom === 1 && live.current.screens.length) fit()
  }, [loading, fit, work.view_x, work.view_y, work.view_zoom])

  /* ---------- wheel (needs a non-passive native listener) ---------- */
  useEffect(() => {
    const el = vpRef.current
    const onWheel = (e) => {
      e.preventDefault()
      const v = live.current.view
      if (e.ctrlKey || e.metaKey) {
        const r = el.getBoundingClientRect()
        zoomAt(e.clientX - r.left, e.clientY - r.top, v.zoom * Math.exp(-e.deltaY * 0.0125))
      } else {
        const dx = e.shiftKey ? e.deltaY : e.deltaX
        const dy = e.shiftKey ? 0 : e.deltaY
        applyView({ ...v, x: v.x - dx, y: v.y - dy })
      }
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [zoomAt, applyView])

  /* ---------- wires ---------- */
  const createLink = async (payload) => {
    try {
      const row = await api.insertLink({ ...payload, wireframe_id: work.id, station_id: work.station_id })
      setLinks((l) => [...l, row])
      setSelectedLink(row.id)
    } catch (err) {
      toast(api.friendly(err), 'error')
    }
  }

  const saveLink = async (id, patch) => {
    const before = live.current.links.find((l) => l.id === id)
    setLinks((l) => l.map((x) => (x.id === id ? { ...x, ...patch } : x)))
    try {
      await api.updateLink(id, patch)
    } catch (err) {
      if (before) setLinks((l) => l.map((x) => (x.id === id ? before : x)))
      toast(api.friendly(err), 'error')
    }
  }

  const removeLink = async (id) => {
    const before = live.current.links
    setLinks((l) => l.filter((x) => x.id !== id))
    setSelectedLink(null)
    try {
      await api.deleteLink(id)
    } catch (err) {
      setLinks(before)
      toast(api.friendly(err), 'error')
    }
  }

  const dropPending = (cx, cy) => {
    const p = live.current.pending
    if (!p) return
    const w = toWorld(cx, cy)
    const target = hitScreen(live.current.screens, w.x, w.y, p.screenId)
    setPending(null)
    if (!target) {
      toast('Wire cancelled. Drop it on another page.', 'info')
      return
    }
    createLink({
      from_screen: p.screenId,
      from_x: p.fx,
      from_y: p.fy,
      to_screen: target.id,
      to_x: clamp((w.x - target.x) / target.w, 0, 1),
      to_y: clamp((w.y - target.y) / target.h, 0, 1),
    })
  }

  const adjustDown = (e, link, part) => {
    if (!live.current.isOwner) return
    e.stopPropagation()
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    const w = toWorld(e.clientX, e.clientY)
    setSelectedLink(link.id)
    setAdjust({ id: link.id, part, x: w.x, y: w.y })
  }

  const adjustMove = (e) => {
    if (!live.current.adjust) return
    const w = toWorld(e.clientX, e.clientY)
    setAdjust((a) => a && { ...a, x: w.x, y: w.y })
  }

  const adjustUp = (e, link) => {
    const a = live.current.adjust
    if (!a) return
    setAdjust(null)
    const w = toWorld(e.clientX, e.clientY)
    const exclude = a.part === 'from' ? link.to_screen : link.from_screen
    const target = hitScreen(live.current.screens, w.x, w.y, exclude)
    if (!target) {
      toast('Wire returned. Drop an end on a page to move it.', 'info')
      return
    }
    const rx = clamp((w.x - target.x) / target.w, 0, 1)
    const ry = clamp((w.y - target.y) / target.h, 0, 1)
    if (a.part === 'from') saveLink(link.id, { from_screen: target.id, from_x: rx, from_y: ry })
    else saveLink(link.id, { to_screen: target.id, to_x: rx, to_y: ry })
  }

  /* ---------- context action: right-click or long-press ---------- */
  const openContext = useCallback(
    (cx, cy, fromTouch) => {
      const l = live.current
      const w = toWorld(cx, cy)
      const s = hitScreen(l.screens, w.x, w.y)
      if (l.isOwner) {
        if (l.pending) return setPending(null)
        if (!s) return
        setSelectedLink(null)
        setPending({
          screenId: s.id,
          fx: clamp((w.x - s.x) / s.w, 0, 1),
          fy: clamp((w.y - s.y) / s.h, 0, 1),
          cx: w.x,
          cy: w.y,
          ox: cx,
          oy: cy,
          held: fromTouch,
        })
      } else if (s) {
        setIssueDraft({
          screenId: s.id,
          px: clamp((w.x - s.x) / s.w, 0, 1),
          py: clamp((w.y - s.y) / s.h, 0, 1),
        })
      }
    },
    [toWorld]
  )

  const clearPress = () => {
    if (press.current) {
      clearTimeout(press.current.timer)
      press.current = null
    }
  }

  /* ---------- pointer handling ---------- */
  const onContextMenu = (e) => {
    e.preventDefault()
    if (touchActive.current || Date.now() - lastTouchEnd.current < 800) return

    // right-click on a wire opens its note
    const wireEl = e.target.closest ? e.target.closest('[data-wire]') : null
    if (wireEl && !live.current.pending && !live.current.adjust) {
      const id = wireEl.getAttribute('data-wire')
      const link = live.current.links.find((x) => x.id === id)
      if (link && (live.current.isOwner || hasNote(link.note))) {
        setNoteTarget({ kind: 'link', id })
        return
      }
    }

    if (e.target.closest('[data-ui]')) return
    openContext(e.clientX, e.clientY, false)
  }

  // double-click on a page opens its note
  const onDoubleClick = (e) => {
    if (e.target.closest('[data-ui]') || e.target.closest('[data-wire]')) return
    const l = live.current
    if (l.pending || l.adjust) return
    const w = toWorld(e.clientX, e.clientY)
    const s = hitScreen(l.screens, w.x, w.y)
    if (!s) return
    if (l.isOwner || hasNote(s.note)) setNoteTarget({ kind: 'screen', id: s.id })
  }

  const onPointerDown = (e) => {
    if (e.target.closest('[data-ui]')) return
    if (e.button !== 0 && e.button !== 1) return
    if (e.button === 1) e.preventDefault()
    const l = live.current
    if (e.pointerType === 'touch') touchActive.current = true

    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    try { vpRef.current.setPointerCapture(e.pointerId) } catch { /* ignore */ }

    if (pointers.current.size === 2) {
      clearPress()
      setPending(null)
      const [a, b] = [...pointers.current.values()]
      gesture.current = {
        kind: 'pinch',
        d: Math.hypot(a.x - b.x, a.y - b.y) || 1,
        zoom: l.view.zoom,
        vx: l.view.x,
        vy: l.view.y,
        cx: (a.x + b.x) / 2,
        cy: (a.y + b.y) / 2,
      }
      return
    }
    if (pointers.current.size > 2) return

    if (l.pending && !l.pending.held && e.button === 0) {
      dropPending(e.clientX, e.clientY)
      gesture.current = null
      return
    }

    const w = toWorld(e.clientX, e.clientY)
    const s = hitScreen(l.screens, w.x, w.y)

    if (e.pointerType === 'touch') {
      press.current = {
        x: e.clientX,
        y: e.clientY,
        timer: setTimeout(() => {
          const p = press.current
          if (!p) return
          press.current = null
          gesture.current = null
          if (navigator.vibrate) navigator.vibrate(15)
          openContext(p.x, p.y, true)
        }, 520),
      }
    }

    if (l.isOwner && s && (e.button === 1 || l.moveMode)) {
      gesture.current = { kind: 'move', id: s.id, sx: e.clientX, sy: e.clientY, ox: s.x, oy: s.y, moved: false }
    } else {
      gesture.current = { kind: 'pan', sx: e.clientX, sy: e.clientY, ox: l.view.x, oy: l.view.y, moved: false }
    }
  }

  const onPointerMove = (e) => {
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    const l = live.current

    if (press.current && Math.hypot(e.clientX - press.current.x, e.clientY - press.current.y) > 10) clearPress()

    if (l.pending) {
      const w = toWorld(e.clientX, e.clientY)
      setPending((p) => p && { ...p, cx: w.x, cy: w.y })
    }

    const g = gesture.current
    if (!g) return

    if (g.kind === 'pinch') {
      if (pointers.current.size < 2) return
      const [a, b] = [...pointers.current.values()]
      const d = Math.hypot(a.x - b.x, a.y - b.y) || 1
      const cx = (a.x + b.x) / 2
      const cy = (a.y + b.y) / 2
      const z = clamp(g.zoom * (d / g.d), MIN_ZOOM, MAX_ZOOM)
      const r = vpRef.current.getBoundingClientRect()
      const wx = (g.cx - r.left - g.vx) / g.zoom
      const wy = (g.cy - r.top - g.vy) / g.zoom
      applyView({ zoom: z, x: cx - r.left - wx * z, y: cy - r.top - wy * z })
    } else if (g.kind === 'pan') {
      const dx = e.clientX - g.sx
      const dy = e.clientY - g.sy
      if (Math.abs(dx) + Math.abs(dy) > 3) g.moved = true
      applyView({ ...l.view, x: g.ox + dx, y: g.oy + dy })
    } else if (g.kind === 'move') {
      const dx = (e.clientX - g.sx) / l.view.zoom
      const dy = (e.clientY - g.sy) / l.view.zoom
      g.moved = true
      dirty.current.add(g.id)
      setScreens((list) => list.map((s) => (s.id === g.id ? { ...s, x: g.ox + dx, y: g.oy + dy } : s)))
    }
  }

  const endPointer = (e) => {
    pointers.current.delete(e.pointerId)
    if (e.pointerType === 'touch' && pointers.current.size === 0) {
      touchActive.current = false
      lastTouchEnd.current = Date.now()
    }
    clearPress()
    const l = live.current
    const g = gesture.current

    if (l.pending && l.pending.held) {
      gesture.current = null
      if (e.type === 'pointerup' && Math.hypot(e.clientX - l.pending.ox, e.clientY - l.pending.oy) > 30) {
        dropPending(e.clientX, e.clientY)
      } else {
        setPending((p) => p && { ...p, held: false })
      }
      return
    }

    if (g) {
      if (g.kind === 'pan') {
        if (!g.moved && e.type === 'pointerup') setSelectedLink(null)
      } else if (g.kind === 'move') {
        scheduleSave()
      }
    }
    if (!g || g.kind !== 'pinch' || pointers.current.size === 0) gesture.current = null
    try { vpRef.current.releasePointerCapture(e.pointerId) } catch { /* ignore */ }
  }

  /* ---------- keyboard ---------- */
  useEffect(() => {
    const onKey = (e) => {
      const t = e.target
      if (t && (/INPUT|TEXTAREA|SELECT/.test(t.tagName) || t.isContentEditable)) return
      if (document.querySelector('.modal')) return
      const l = live.current
      if (e.key === 'Escape') {
        setPending(null)
        setSelectedLink(null)
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && l.isOwner && l.selectedLink) {
        e.preventDefault()
        removeLink(l.selectedLink)
      } else if (e.key === '0') fit()
      else if (e.key === '+' || e.key === '=') zoomBy(1.2)
      else if (e.key === '-') zoomBy(1 / 1.2)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  /* ---------- pages ---------- */
  const onFiles = async (e) => {
    const files = [...e.target.files]
    e.target.value = ''
    if (!files.length) return
    setUploading({ done: 0, total: files.length })
    try {
      const rows = await api.addScreens({
        wireframeId: work.id,
        stationId: work.station_id,
        files,
        existing: live.current.screens,
        onProgress: (done, total) => setUploading({ done, total }),
      })
      const map = await api.signPaths(rows.map((r) => r.image_path))
      setUrls((u) => ({ ...u, ...map }))
      setScreens((s) => [...s, ...rows])
      toast(`${rows.length} ${rows.length === 1 ? 'page' : 'pages'} added.`, 'success')
    } catch (err) {
      toast(api.friendly(err), 'error')
    } finally {
      setUploading(null)
    }
  }

  const renameScreen = async (id, name) => {
    const clean = name.trim().slice(0, 60) || 'Page'
    setScreens((l) => l.map((s) => (s.id === id ? { ...s, name: clean } : s)))
    try {
      await api.updateScreen(id, { name: clean })
    } catch (err) {
      toast(api.friendly(err), 'error')
    }
  }

  /* ---------- notes ---------- */
  const saveNote = async (text) => {
    const t = noteTarget
    if (!t) return
    if (t.kind === 'link') {
      await api.updateLink(t.id, { note: text })
      setLinks((l) => l.map((x) => (x.id === t.id ? { ...x, note: text } : x)))
    } else {
      await api.updateScreen(t.id, { note: text })
      setScreens((l) => l.map((x) => (x.id === t.id ? { ...x, note: text } : x)))
    }
    setNoteTarget(null)
  }

  /* ---------- issues ---------- */
  const selectIssue = (id) => {
    setActiveIssue(id)
    if (!id) return
    setUnread((s) => {
      if (!s.has(id)) return s
      const next = new Set(s)
      next.delete(id)
      return next
    })
    api.markRead(id).catch(() => {})
  }

  const submitIssue = async (values) => {
    const row = await api.insertIssue({
      wireframe_id: work.id,
      station_id: work.station_id,
      screen_id: issueDraft.screenId,
      pin_x: issueDraft.px,
      pin_y: issueDraft.py,
      ...values,
    })
    setIssues((l) => (l.some((i) => i.id === row.id) ? l : [...l, row]))
    setIssueDraft(null)
    setFreshIssue(row.id)
    setTimeout(() => setFreshIssue(null), 2400)
    toast('Issue added.', 'success')
  }

  /* ---------- discussion ---------- */
  const postComment = async ({ issue, parentId, name, body, file }) => {
    const row = await api.postComment({ issue, parentId, name, body, file })
    setComments((l) => (l.some((c) => c.id === row.id) ? l : [...l, row]))
  }

  const editComment = async ({ id, body }) => {
    const row = await api.editComment(id, body)
    setComments((l) => l.map((c) => (c.id === id ? { ...c, body: row.body, edited_at: row.edited_at } : c)))
  }

  const removeComment = async ({ rootId, ids }) => {
    await api.deleteComment(rootId)
    setComments((l) => l.filter((c) => !ids.includes(c.id)))
    setReactions((l) => l.filter((r) => !r.comment_id || !ids.includes(r.comment_id)))
  }

  const react = async ({ issue, commentId, emoji }) => {
    const same = (r) =>
      r.user_id === userId && r.issue_id === issue.id && (r.comment_id || null) === (commentId || null) && r.emoji === emoji
    const existing = reactions.find(same)

    if (existing) {
      setReactions((l) => l.filter((r) => !same(r)))
      try {
        await api.removeReaction({ issueId: issue.id, commentId, emoji, userId })
      } catch (err) {
        setReactions((l) => [...l, existing])
        toast(api.friendly(err), 'error')
      }
      return
    }

    const temp = { id: `tmp-${Date.now()}`, issue_id: issue.id, comment_id: commentId || null, user_id: userId, emoji }
    setReactions((l) => [...l, temp])
    try {
      const row = await api.addReaction({ issue, commentId, emoji })
      setReactions((l) => l.map((r) => (r.id === temp.id ? row : r)))
    } catch (err) {
      setReactions((l) => l.filter((r) => r.id !== temp.id))
      if (err && err.code === '23505') {
        api.fetchDiscussion(work.id).then((d) => { setComments(d.comments); setReactions(d.reactions) }).catch(() => {})
        return
      }
      toast(api.friendly(err), 'error')
    }
  }

  const toggleResolved = async (issue) => {
    const status = issue.status === 'resolved' ? 'open' : 'resolved'
    setIssues((l) => l.map((i) => (i.id === issue.id ? { ...i, status } : i)))
    try {
      await api.updateIssue(issue.id, { status })
    } catch (err) {
      setIssues((l) => l.map((i) => (i.id === issue.id ? issue : i)))
      toast(api.friendly(err), 'error')
    }
  }

  const focusIssue = (issue) => {
    const s = live.current.screens.find((x) => x.id === issue.screen_id)
    const el = vpRef.current
    if (!s || !el) return
    const r = el.getBoundingClientRect()
    const z = Math.max(live.current.view.zoom, 0.8)
    const px = s.x + issue.pin_x * s.w
    const py = s.y + issue.pin_y * s.h
    const wide = window.innerWidth >= 720
    applyView({
      zoom: z,
      x: (wide && drawer ? (r.width - 380) / 2 : r.width / 2) - px * z,
      y: (wide ? r.height / 2 : r.height * 0.28) - py * z,
    })
    setFreshIssue(issue.id)
    setTimeout(() => setFreshIssue(null), 2400)
  }

  const doDelete = async () => {
    if (!confirm) return
    setBusy(true)
    try {
      if (confirm.kind === 'screen') {
        const id = confirm.item.id
        await api.deleteScreen(confirm.item)
        const goneIds = issues.filter((i) => i.screen_id === id).map((i) => i.id)
        setScreens((l) => l.filter((s) => s.id !== id))
        setLinks((l) => l.filter((k) => k.from_screen !== id && k.to_screen !== id))
        setIssues((l) => l.filter((i) => i.screen_id !== id))
        setComments((l) => l.filter((c) => !goneIds.includes(c.issue_id)))
        setReactions((l) => l.filter((r) => !goneIds.includes(r.issue_id)))
      } else {
        const id = confirm.item.id
        await api.deleteIssue(id)
        setIssues((l) => l.filter((i) => i.id !== id))
        setComments((l) => l.filter((c) => c.issue_id !== id))
        setReactions((l) => l.filter((r) => r.issue_id !== id))
        if (activeIssue === id) setActiveIssue(null)
      }
      setConfirm(null)
    } catch (err) {
      toast(api.friendly(err), 'error')
    } finally {
      setBusy(false)
    }
  }

  /* ---------- derived ---------- */
  const screenById = useMemo(() => Object.fromEntries(screens.map((s) => [s.id, s])), [screens])
  const numbers = useMemo(() => Object.fromEntries(issues.map((i, idx) => [i.id, idx + 1])), [issues])
  const pageNames = useMemo(() => Object.fromEntries(screens.map((s) => [s.id, s.name])), [screens])

  const adjustLink = adjust ? links.find((l) => l.id === adjust.id) : null
  const cursorWorld = pending ? { x: pending.cx, y: pending.cy } : adjust ? { x: adjust.x, y: adjust.y } : null
  const excludeId = pending ? pending.screenId : adjustLink ? (adjust.part === 'from' ? adjustLink.to_screen : adjustLink.from_screen) : null
  const dropTarget = cursorWorld ? hitScreen(screens, cursorWorld.x, cursorWorld.y, excludeId) : null

  const noteItem = noteTarget
    ? noteTarget.kind === 'link'
      ? links.find((l) => l.id === noteTarget.id)
      : screens.find((s) => s.id === noteTarget.id)
    : null

  let noteTitle = ''
  let noteSubtitle = ''
  if (noteItem) {
    if (noteTarget.kind === 'link') {
      noteTitle = 'Wire note'
      noteSubtitle = `${pageNames[noteItem.from_screen] || 'Page'} to ${pageNames[noteItem.to_screen] || 'Page'}`
    } else {
      noteTitle = 'Page note'
      noteSubtitle = `Page: ${noteItem.name}`
    }
  }

  let hint = null
  if (pending) hint = coarse ? 'Tap a page to drop the wire. Tap empty space to cancel.' : 'Left-click a page to drop the wire. Esc or a click on empty space cancels it.'
  else if (adjust) hint = 'Release over a page to move this end. Release anywhere else to cancel.'
  else if (!hintDismissed) {
    if (isOwner) hint = coarse ? 'Long-press a page to start a wire. Tap a wire to add a note. Pinch to zoom.' : 'Right-click a page to start a wire. Right-click a wire or double-click a page to add a note. Middle-drag moves an image.'
    else hint = coarse ? 'Long-press where you see a problem to report it. Pinch to zoom.' : 'Right-click where you see a problem to report it. Scroll pans, Ctrl + scroll zooms.'
  }

  const saveLabel = { saved: 'Saved', dirty: 'Unsaved changes', saving: 'Saving...', error: 'Save failed, retrying' }[saveState]

  const renderWire = (link) => {
    const a = screenById[link.from_screen]
    const b = screenById[link.to_screen]
    if (!a || !b) return null
    let sx = a.x + link.from_x * a.w
    let sy = a.y + link.from_y * a.h
    let ex = b.x + link.to_x * b.w
    let ey = b.y + link.to_y * b.h
    if (adjust && adjust.id === link.id) {
      if (adjust.part === 'from') { sx = adjust.x; sy = adjust.y } else { ex = adjust.x; ey = adjust.y }
    }
    const { d, angle, mid } = wirePath(sx, sy, ex, ey)
    const selected = selectedLink === link.id
    const noted = hasNote(link.note)
    const inv = 1 / view.zoom
    const openNote = () => setNoteTarget({ kind: 'link', id: link.id })

    return (
      <g key={link.id} className={`wire ${selected ? 'is-selected' : ''}`}>
        <path
          className="wire-hit"
          d={d}
          data-wire={link.id}
          onPointerDown={(e) => {
            if (e.button !== 0) return
            e.stopPropagation()
            setSelectedLink(link.id)
          }}
        />
        <path className="wire-line" d={d} />
        <g transform={`translate(${ex} ${ey}) rotate(${angle}) scale(${inv})`}>
          <path className="wire-arrow" d="M0 0 L-14 -7 L-14 7 Z" />
          <circle
            className="wire-handle"
            data-ui
            cx={-6}
            cy={0}
            r={16}
            onPointerDown={(e) => adjustDown(e, link, 'to')}
            onPointerMove={adjustMove}
            onPointerUp={(e) => adjustUp(e, link)}
            onPointerCancel={() => setAdjust(null)}
          />
        </g>
        <g transform={`translate(${sx} ${sy}) scale(${inv})`}>
          <circle className="wire-ball" r={6} />
          <circle
            className="wire-handle"
            data-ui
            r={16}
            onPointerDown={(e) => adjustDown(e, link, 'from')}
            onPointerMove={adjustMove}
            onPointerUp={(e) => adjustUp(e, link)}
            onPointerCancel={() => setAdjust(null)}
          />
        </g>
        {!adjust && selected && isOwner && (
          <g data-ui transform={`translate(${mid.x} ${mid.y}) scale(${inv})`}>
            <g className="wire-note" transform="translate(-18 0)" onClick={openNote}>
              <title>{noted ? 'Edit note' : 'Add note'}</title>
              <circle r={13} className={noted ? 'has-note' : ''} />
              <path d="M-5 -3h10M-5 1.5h6" />
            </g>
            <g className="wire-del" transform="translate(18 0)" onClick={() => removeLink(link.id)}>
              <title>Remove wire</title>
              <circle r={13} />
              <path d="M-4.5 -4.5L4.5 4.5M4.5 -4.5L-4.5 4.5" />
            </g>
          </g>
        )}
        {!adjust && !(selected && isOwner) && noted && (
          <g className="wire-note" data-ui transform={`translate(${mid.x} ${mid.y}) scale(${inv})`} onClick={openNote}>
            <title>Read note</title>
            <circle r={13} className="has-note" />
            <path d="M-5 -3h10M-5 1.5h6" />
          </g>
        )}
      </g>
    )
  }

  const pendingShape = (() => {
    if (!pending) return null
    const a = screenById[pending.screenId]
    if (!a) return null
    const sx = a.x + pending.fx * a.w
    const sy = a.y + pending.fy * a.h
    const { d, angle } = wirePath(sx, sy, pending.cx, pending.cy)
    const inv = 1 / view.zoom
    return (
      <g className="wire is-pending">
        <path className="wire-line" d={d} />
        <g transform={`translate(${pending.cx} ${pending.cy}) rotate(${angle}) scale(${inv})`}>
          <path className="wire-arrow" d="M0 0 L-14 -7 L-14 7 Z" />
        </g>
        <g transform={`translate(${sx} ${sy}) scale(${inv})`}>
          <circle className="wire-ball" r={6} />
        </g>
      </g>
    )
  })()

  return (
    <div className={`work ${isOwner ? 'is-owner' : 'is-viewer'}`}>
      <div className="toolbar">
        <div className="toolbar-group">
          {isOwner && (
            <>
              <button className="btn btn-sm" onClick={() => fileRef.current && fileRef.current.click()} disabled={Boolean(uploading)}>
                <IconPlus />
                <span>{uploading ? `Uploading ${Math.min(uploading.done + 1, uploading.total)}/${uploading.total}` : 'Add images'}</span>
              </button>
              <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={onFiles} />
              <button
                className={`btn btn-sm ${moveMode ? 'btn-active' : ''}`}
                aria-pressed={moveMode}
                onClick={() => setMoveMode((v) => !v)}
                title="When on, left-drag (or touch-drag) moves images. Middle-drag always works."
              >
                <IconMove />
                <span>Move images</span>
              </button>
            </>
          )}
          <button className="btn btn-sm" onClick={fit} title="Fit everything (0)">
            <IconFit />
            <span className="hide-sm">Fit</span>
          </button>
        </div>
        <div className="toolbar-group">
          {isOwner && <span className={`save-state save-${saveState}`} role="status">{saveLabel}</span>}
          <button className={`btn btn-sm ${drawer ? 'btn-active' : ''}`} onClick={() => setDrawer((v) => !v)}>
            <IconList />
            <span>Issues</span>
            <span className="count">{issues.length}</span>
            {unread.size > 0 && <span className="unread-dot" title={`${unread.size} with new activity`} />}
          </button>
        </div>
      </div>

      <div className="stage-wrap">
        <div
          ref={vpRef}
          className={`viewport ${pending ? 'is-wiring' : ''} ${moveMode ? 'is-moving' : ''}`}
          style={{
            backgroundSize: `${24 * view.zoom}px ${24 * view.zoom}px`,
            backgroundPosition: `${view.x}px ${view.y}px`,
          }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endPointer}
          onPointerCancel={endPointer}
          onContextMenu={onContextMenu}
          onDoubleClick={onDoubleClick}
          onMouseDown={(e) => { if (e.button === 1) e.preventDefault() }}
          onAuxClick={(e) => e.preventDefault()}
        >
          <div className="stage" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})` }}>
            {screens.map((s) => (
              <div
                key={s.id}
                className={`screen ${dropTarget && dropTarget.id === s.id ? 'is-target' : ''}`}
                style={{ left: s.x, top: s.y, width: s.w, height: s.h }}
              >
                <ScreenLabel
                  screen={s}
                  zoom={view.zoom}
                  canEdit={isOwner}
                  onRename={renameScreen}
                  onDelete={(item) => setConfirm({ kind: 'screen', item })}
                  onNote={(item) => setNoteTarget({ kind: 'screen', id: item.id })}
                />
                {urls[s.image_path] ? (
                  <img src={urls[s.image_path]} alt={s.name} draggable="false" onError={onImgError} />
                ) : (
                  <div className="screen-missing"><IconImage width={26} height={26} /></div>
                )}
              </div>
            ))}

            <svg className="wires" width="1" height="1">
              {links.map(renderWire)}
              {pendingShape}
            </svg>

            <div className="pins">
              {issues.map((i) => {
                const s = screenById[i.screen_id]
                if (!s) return null
                return (
                  <button
                    key={i.id}
                    data-ui
                    className={`pin ${i.status === 'resolved' ? 'is-resolved' : ''} ${freshIssue === i.id ? 'is-fresh' : ''} ${activeIssue === i.id ? 'is-active' : ''}`}
                    style={{ left: s.x + i.pin_x * s.w, top: s.y + i.pin_y * s.h, transform: `translate(-50%, -100%) scale(${1 / view.zoom})` }}
                    onClick={() => { selectIssue(i.id); setDrawer(true) }}
                    aria-label={`Issue ${numbers[i.id]}: ${i.title}`}
                    title={`${i.title} - ${i.author_name}`}
                  >
                    <span className="pin-head">{numbers[i.id]}</span>
                    <span className="pin-tip" />
                  </button>
                )
              })}
            </div>
          </div>

          {loading && <div className="canvas-overlay"><div className="spinner" role="status" aria-label="Loading canvas" /></div>}

          {!loading && screens.length === 0 && (
            <div className="canvas-overlay" data-ui>
              <div className="card empty-card">
                <IconImage width={30} height={30} />
                <h3>No pages yet</h3>
                <p className="muted">{isOwner ? 'Add images to start wiring them together.' : 'The owner has not added any pages.'}</p>
                {isOwner && <button className="btn btn-primary" onClick={() => fileRef.current && fileRef.current.click()}><IconPlus /> Add images</button>}
              </div>
            </div>
          )}

          {hint && (
            <div className="hint-strip" data-ui>
              <span>{hint}</span>
              {!pending && !adjust && (
                <button className="icon-btn icon-btn-sm" onClick={() => { setHintDismissed(true); safeSet('tracewire.hint', '1') }} aria-label="Dismiss hint">
                  <IconClose width={14} height={14} />
                </button>
              )}
            </div>
          )}

          <div className="zoom-box" data-ui>
            <button className="icon-btn icon-btn-sm" onClick={() => zoomBy(1 / 1.2)} aria-label="Zoom out"><IconMinus width={16} height={16} /></button>
            <span className="zoom-val">{Math.round(view.zoom * 100)}%</span>
            <button className="icon-btn icon-btn-sm" onClick={() => zoomBy(1.2)} aria-label="Zoom in"><IconPlus width={16} height={16} /></button>
          </div>
        </div>

        {drawer && (
          <IssueDrawer
            issues={issues}
            numbers={numbers}
            pageNames={pageNames}
            activeId={activeIssue}
            isOwner={isOwner}
            userId={userId}
            ownerId={work.stations.owner_id}
            coarse={coarse}
            comments={comments}
            reactions={reactions}
            unread={unread}
            defaultName={isOwner ? work.stations.display_name || 'Owner' : ''}
            onSelect={selectIssue}
            onClose={() => { setDrawer(false); setActiveIssue(null) }}
            onFocus={focusIssue}
            onToggle={toggleResolved}
            onDelete={(item) => setConfirm({ kind: 'issue', item })}
            onPostComment={postComment}
            onEditComment={editComment}
            onDeleteComment={removeComment}
            onReact={react}
          />
        )}
      </div>

      {issueDraft && (
        <IssueForm pageName={pageNames[issueDraft.screenId] || 'Page'} onSubmit={submitIssue} onClose={() => setIssueDraft(null)} />
      )}

      {noteItem && (
        <NoteModal
          key={`${noteTarget.kind}-${noteTarget.id}`}
          title={noteTitle}
          subtitle={noteSubtitle}
          note={noteItem.note || ''}
          canEdit={isOwner}
          onSave={saveNote}
          onClose={() => setNoteTarget(null)}
        />
      )}

      {confirm && (
        <ConfirmModal
          title={confirm.kind === 'screen' ? 'Delete this page?' : 'Delete this issue?'}
          message={
            confirm.kind === 'screen'
              ? 'The image, its wires, issues and replies are permanently removed from the database.'
              : 'This issue and its replies are permanently removed from the database.'
          }
          busy={busy}
          onConfirm={doDelete}
          onClose={() => setConfirm(null)}
        />
      )}
    </div>
  )
}