import { useState } from 'react'
import Modal from './Modal.jsx'
import { IconCopy, IconLink } from './Icons.jsx'
import { useApp } from '../context.jsx'
import * as api from '../lib/api.js'
import { copyText } from '../lib/format.js'

export default function ShareModal({ work, onClose, onRegenerated }) {
  const { toast } = useApp()
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const link = `${window.location.origin}/?code=${work.code}`

  const copy = async (text, label) => {
    const ok = await copyText(text)
    toast(ok ? `${label} copied.` : 'Could not copy. Select it manually.', ok ? 'success' : 'error')
  }

  const regenerate = async () => {
    setBusy(true)
    try {
      const code = await api.regenerateCode(work.id)
      onRegenerated(work.id, code)
      setConfirming(false)
      toast('New code created. The old code no longer works.', 'success')
    } catch (err) {
      toast(api.friendly(err), 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      title={`Share "${work.title}"`}
      onClose={busy ? undefined : onClose}
      footer={<button className="btn btn-primary" onClick={onClose} disabled={busy}>Done</button>}
    >
      <div className="stack">
        <p className="muted">
          Only people who have this code can open this wireframe. Your other wireframes stay private.
        </p>
        <code className="code" aria-label="Wireframe code">{work.code}</code>
        <div className="row wrap">
          <button className="btn btn-primary btn-sm" onClick={() => copy(work.code, 'Code')}><IconCopy /> Copy code</button>
          <button className="btn btn-sm" onClick={() => copy(link, 'Invite link')}><IconLink /> Copy invite link</button>
        </div>

        <div className="danger-zone">
          <h3>Stop sharing</h3>
          <p className="muted small">
            Generating a new code removes access for everyone who joined with the old one. You can then send the new code to the people you choose.
          </p>
          {confirming ? (
            <div className="row wrap">
              <button className="btn btn-danger btn-sm" onClick={regenerate} disabled={busy}>{busy ? 'Working...' : 'Yes, generate new code'}</button>
              <button className="btn btn-sm" onClick={() => setConfirming(false)} disabled={busy}>Cancel</button>
            </div>
          ) : (
            <button className="btn btn-sm" onClick={() => setConfirming(true)}>Generate new code</button>
          )}
        </div>
      </div>
    </Modal>
  )
}