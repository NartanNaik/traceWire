import { useEffect, useRef, useState } from 'react'
import { REACTIONS } from '../lib/emoji.js'
import { IconSmile } from './Icons.jsx'

export default function ReactionBar({ reactions, userId, onToggle, readOnly = false }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    const close = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('pointerdown', close)
    const pop = ref.current && ref.current.querySelector('.emoji-pop')
    if (pop && pop.scrollIntoView) pop.scrollIntoView({ block: 'nearest' })
    return () => document.removeEventListener('pointerdown', close)
  }, [open])

  const groups = {}
  reactions.forEach((r) => {
    const g = groups[r.emoji] || (groups[r.emoji] = { count: 0, mine: false })
    g.count += 1
    if (r.user_id === userId) g.mine = true
  })
  const order = Object.keys(groups).sort((a, b) => REACTIONS.indexOf(a) - REACTIONS.indexOf(b))

  if (readOnly && order.length === 0) return null

  return (
    <div className="reactions" ref={ref}>
      {order.map((emoji) =>
        readOnly ? (
          <span key={emoji} className={`react-chip is-static ${groups[emoji].mine ? 'is-on' : ''}`} aria-label={`${emoji} ${groups[emoji].count}`}>
            <span>{emoji}</span>
            <span>{groups[emoji].count}</span>
          </span>
        ) : (
          <button
            key={emoji}
            type="button"
            className={`react-chip ${groups[emoji].mine ? 'is-on' : ''}`}
            aria-pressed={groups[emoji].mine}
            aria-label={`${emoji} ${groups[emoji].count}`}
            onClick={() => onToggle(emoji)}
          >
            <span>{emoji}</span>
            <span>{groups[emoji].count}</span>
          </button>
        )
      )}
      {!readOnly && (
        <button type="button" className="react-chip react-add" onClick={() => setOpen((v) => !v)} aria-label="Add reaction" aria-expanded={open}>
          <IconSmile width={16} height={16} />
        </button>
      )}
      {open && (
        <div className="emoji-pop react-pop" role="menu">
          {REACTIONS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              className="emoji-btn"
              role="menuitem"
              onClick={() => {
                setOpen(false)
                onToggle(emoji)
              }}
            >
              {emoji}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}