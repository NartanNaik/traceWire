import { useEffect, useRef, useState } from 'react'
import { EMOJI_GRID } from '../lib/emoji.js'
import { friendly } from '../lib/api.js'
import { safeGet, safeSet } from '../lib/format.js'
import { IconClose, IconImage, IconSmile } from './Icons.jsx'

const MAX_IMAGE = 25 * 1024 * 1024

export default function Composer({ defaultName, placeholder, submitLabel, autoFocus, onSubmit, onCancel }) {
  const [name, setName] = useState(() => safeGet('tracewire.name') || defaultName || '')
  const [body, setBody] = useState('')
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState(null)
  const [picker, setPicker] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const taRef = useRef(null)
  const fileRef = useRef(null)
  const toolsRef = useRef(null)

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview) }, [preview])

  useEffect(() => {
    if (!picker) return
    const close = (e) => {
      if (toolsRef.current && !toolsRef.current.contains(e.target)) setPicker(false)
    }
    document.addEventListener('pointerdown', close)
    const pop = toolsRef.current && toolsRef.current.querySelector('.emoji-pop')
    if (pop && pop.scrollIntoView) pop.scrollIntoView({ block: 'nearest' })
    return () => document.removeEventListener('pointerdown', close)
  }, [picker])

  const attach = (f) => {
    if (!f) return
    if (!f.type.startsWith('image/')) return setError('Only images can be attached.')
    if (f.size > MAX_IMAGE) return setError('That image is larger than 25 MB.')
    setError('')
    setFile(f)
    setPreview(URL.createObjectURL(f))
  }

  const removeFile = () => {
    setFile(null)
    setPreview(null)
  }

  const insertEmoji = (emoji) => {
    const ta = taRef.current
    const start = ta ? ta.selectionStart : body.length
    const end = ta ? ta.selectionEnd : body.length
    setBody((body.slice(0, start) + emoji + body.slice(end)).slice(0, 4000))
    requestAnimationFrame(() => {
      if (!ta) return
      ta.focus()
      const pos = start + emoji.length
      ta.setSelectionRange(pos, pos)
    })
  }

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    if (!name.trim()) return setError('Enter your name.')
    if (!body.trim() && !file) return setError('Write something or attach an image.')
    safeSet('tracewire.name', name.trim())
    setBusy(true)
    try {
      await onSubmit({ name: name.trim(), body: body.trim(), file })
      setBody('')
      setFile(null)
      setPreview(null)
    } catch (err) {
      setError(friendly(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="composer" onSubmit={submit}>
      <label className="composer-name">
        <span>Posting as</span>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} autoComplete="name" disabled={busy} />
      </label>

      <textarea
        ref={taRef}
        className="input textarea"
        rows={3}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        maxLength={4000}
        placeholder={placeholder}
        autoFocus={autoFocus}
        disabled={busy}
        onPaste={(e) => {
          const img = [...(e.clipboardData ? e.clipboardData.files : [])].find((f) => f.type.startsWith('image/'))
          if (img) {
            e.preventDefault()
            attach(img)
          }
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault()
            e.currentTarget.form.requestSubmit()
          }
        }}
      />

      {preview && (
        <div className="attach">
          <img src={preview} alt="Attachment preview" draggable="false" />
          <button type="button" className="preview-x" onClick={removeFile} aria-label="Remove image" disabled={busy}>
            <IconClose width={14} height={14} />
          </button>
        </div>
      )}

      <div className="composer-bar">
        <div className="composer-tools" ref={toolsRef}>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPicker((v) => !v)} aria-label="Insert emoji" aria-expanded={picker} disabled={busy}>
            <IconSmile />
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => fileRef.current && fileRef.current.click()} aria-label="Attach image" disabled={busy}>
            <IconImage />
          </button>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { attach(e.target.files[0]); e.target.value = '' }} />
          {picker && (
            <div className="emoji-pop emoji-grid" role="menu">
              {EMOJI_GRID.map((emoji, i) => (
                <button key={`${emoji}-${i}`} type="button" className="emoji-btn" role="menuitem" onClick={() => insertEmoji(emoji)}>
                  {emoji}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="row">
          {onCancel && <button type="button" className="btn btn-sm" onClick={onCancel} disabled={busy}>Cancel</button>}
          <button type="submit" className="btn btn-primary btn-sm" disabled={busy}>{busy ? 'Posting...' : submitLabel}</button>
        </div>
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
    </form>
  )
}