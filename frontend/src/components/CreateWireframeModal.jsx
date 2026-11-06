import { useEffect, useRef, useState } from 'react'
import Modal from './Modal.jsx'
import { IconClose, IconUpload } from './Icons.jsx'
import { useApp } from '../context.jsx'
import * as api from '../lib/api.js'

export default function CreateWireframeModal({ stationId, existingTitles = [], onClose, onCreated }) {
  const { toast } = useApp()
  const [title, setTitle] = useState('')
  const [items, setItems] = useState([])
  const [drag, setDrag] = useState(false)
  const [progress, setProgress] = useState(null)
  const [error, setError] = useState('')
  const inputRef = useRef(null)
  const itemsRef = useRef([])
  itemsRef.current = items

  useEffect(() => () => itemsRef.current.forEach((i) => URL.revokeObjectURL(i.url)), [])

  const clean = title.trim().toLowerCase()
  const duplicate = clean.length > 0 && existingTitles.some((t) => t.trim().toLowerCase() === clean)

  const addFiles = (list) => {
    const images = [...list].filter((f) => f.type.startsWith('image/'))
    if (images.length !== list.length) toast('Some files were skipped because they are not images.', 'info')
    setItems((prev) => [
      ...prev,
      ...images.map((file) => ({ id: crypto.randomUUID(), file, url: URL.createObjectURL(file) })),
    ])
  }

  const remove = (id) => {
    setItems((prev) => {
      const gone = prev.find((i) => i.id === id)
      if (gone) URL.revokeObjectURL(gone.url)
      return prev.filter((i) => i.id !== id)
    })
  }

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    if (!title.trim()) return setError('Give the wireframe a title.')
    if (duplicate) return setError('You already have a wireframe with that name.')
    if (!items.length) return setError('Add at least one image.')
    setProgress({ done: 0, total: items.length })
    try {
      const wf = await api.createWireframe({
        stationId,
        title: title.trim(),
        files: items.map((i) => i.file),
        onProgress: (done, total) => setProgress({ done, total }),
      })
      onCreated(wf)
    } catch (err) {
      setError(api.friendly(err))
      setProgress(null)
    }
  }

  const busy = Boolean(progress)

  return (
    <Modal
      title="Create wireframe"
      wide
      onClose={busy ? undefined : onClose}
      footer={
        <>
          <button className="btn" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="btn btn-primary" type="submit" form="create-form" disabled={busy || duplicate}>
            {busy ? `Uploading ${progress.done} of ${progress.total}...` : 'Create wireframe'}
          </button>
        </>
      }
    >
      <form id="create-form" onSubmit={submit} className="stack">
        <label className="field">
          <span>Title</span>
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder="Checkout flow v2" autoFocus disabled={busy} />
          {duplicate && <p className="form-error" role="alert">You already have a wireframe with that name. Choose a different one.</p>}
        </label>

        <div
          className={`dropzone ${drag ? 'is-drag' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setDrag(true) }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); if (!busy) addFiles(e.dataTransfer.files) }}
        >
          <IconUpload width={26} height={26} />
          <p><strong>Drop images here</strong> or choose them from your device</p>
          <p className="muted small">Select one or many. You can add more after creating.</p>
          <button type="button" className="btn btn-sm" onClick={() => inputRef.current && inputRef.current.click()} disabled={busy}>Choose images</button>
          <input ref={inputRef} type="file" accept="image/*" multiple hidden onChange={(e) => { addFiles(e.target.files); e.target.value = '' }} />
        </div>

        {items.length > 0 && (
          <ul className="previews">
            {items.map((i) => (
              <li key={i.id} className="preview">
                <img src={i.url} alt={i.file.name} draggable="false" />
                <button type="button" className="preview-x" onClick={() => remove(i.id)} aria-label={`Remove ${i.file.name}`} disabled={busy}>
                  <IconClose width={14} height={14} />
                </button>
              </li>
            ))}
          </ul>
        )}

        {busy && (
          <div className="progress" aria-hidden="true">
            <div className="progress-bar" style={{ width: `${(progress.done / progress.total) * 100}%` }} />
          </div>
        )}
        {error && <p className="form-error" role="alert">{error}</p>}
      </form>
    </Modal>
  )
}