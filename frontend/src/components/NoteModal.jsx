import { useState } from 'react'
import Modal from './Modal.jsx'
import { friendly } from '../lib/api.js'

export default function NoteModal({ title, subtitle, note, canEdit, onSave, onClose }) {
  const [text, setText] = useState(note || '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const save = async (value) => {
    setBusy(true)
    setError('')
    try {
      await onSave(value.trim())
    } catch (err) {
      setError(friendly(err))
      setBusy(false)
    }
  }

  const submit = (e) => {
    e.preventDefault()
    save(text)
  }

  return (
    <Modal
      title={title}
      onClose={busy ? undefined : onClose}
      footer={
        canEdit ? (
          <>
            {note && note.trim() && (
              <button className="btn btn-danger-ghost note-remove" type="button" onClick={() => save('')} disabled={busy}>Remove note</button>
            )}
            <button className="btn" type="button" onClick={onClose} disabled={busy}>Cancel</button>
            <button className="btn btn-primary" type="submit" form="note-form" disabled={busy}>
              {busy ? 'Saving...' : 'Save note'}
            </button>
          </>
        ) : (
          <button className="btn btn-primary" type="button" onClick={onClose}>Close</button>
        )
      }
    >
      {canEdit ? (
        <form id="note-form" className="stack" onSubmit={submit}>
          {subtitle && <p className="muted small">{subtitle}</p>}
          <label className="field">
            <span>Note</span>
            <textarea
              className="input textarea"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                  e.preventDefault()
                  save(text)
                }
              }}
              maxLength={2000}
              rows={6}
              placeholder="What should anyone looking at this know?"
              autoFocus
              disabled={busy}
            />
          </label>
          <p className="muted small">{text.length} / 2000. Anyone with this wireframe's code can read it.</p>
          {error && <p className="form-error" role="alert">{error}</p>}
        </form>
      ) : (
        <div className="stack">
          {subtitle && <p className="muted small">{subtitle}</p>}
          <p className="note-read">{note}</p>
        </div>
      )}
    </Modal>
  )
}