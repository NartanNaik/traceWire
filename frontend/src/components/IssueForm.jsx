import { useState } from 'react'
import Modal from './Modal.jsx'
import { friendly } from '../lib/api.js'
import { safeGet, safeSet } from '../lib/format.js'

export default function IssueForm({ pageName, onSubmit, onClose }) {
  const [name, setName] = useState(() => safeGet('tracewire.name') || '')
  const [title, setTitle] = useState('')
  const [details, setDetails] = useState('')
  const [fix, setFix] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    if (!name.trim()) return setError('Enter your name.')
    if (!title.trim()) return setError('Enter a problem title.')
    if (!details.trim()) return setError('Explain the problem.')
    safeSet('tracewire.name', name.trim())
    setBusy(true)
    try {
      await onSubmit({ author_name: name.trim(), title: title.trim(), details: details.trim(), fix: fix.trim() })
    } catch (err) {
      setError(friendly(err))
      setBusy(false)
    }
  }

  return (
    <Modal
      title="Report an issue"
      onClose={busy ? undefined : onClose}
      footer={
        <>
          <button className="btn" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="btn btn-primary" type="submit" form="issue-form" disabled={busy}>
            {busy ? 'Submitting...' : 'Submit issue'}
          </button>
        </>
      }
    >
      <form id="issue-form" className="stack" onSubmit={submit}>
        <p className="muted small">On page: <strong>{pageName}</strong>. A pin will be added where you clicked.</p>
        <label className="field">
          <span>Your name</span>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} autoComplete="name" disabled={busy} />
        </label>
        <label className="field">
          <span>Problem title</span>
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={140} placeholder="Button is hard to find" autoFocus disabled={busy} />
        </label>
        <label className="field">
          <span>Explanation</span>
          <textarea className="input textarea" value={details} onChange={(e) => setDetails(e.target.value)} maxLength={4000} rows={4} placeholder="What is wrong, and why does it matter?" disabled={busy} />
        </label>
        <label className="field">
          <span>Suggested fix <em className="muted">(optional)</em></span>
          <textarea className="input textarea" value={fix} onChange={(e) => setFix(e.target.value)} maxLength={4000} rows={3} placeholder="How would you change it?" disabled={busy} />
        </label>
        {error && <p className="form-error" role="alert">{error}</p>}
      </form>
    </Modal>
  )
}