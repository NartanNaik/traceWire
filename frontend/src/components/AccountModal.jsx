import { useState } from 'react'
import Modal from './Modal.jsx'
import { useApp } from '../context.jsx'
import * as api from '../lib/api.js'

export default function AccountModal({ initialMode = 'link', onClose }) {
  const { account, station, userId, toast } = useApp()
  const [mode, setMode] = useState(initialMode)
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [confirmText, setConfirmText] = useState('')
  const [erasing, setErasing] = useState(false)

  const send = async (e) => {
    e.preventDefault()
    const value = email.trim().toLowerCase()
    if (!/^\S+@\S+\.\S+$/.test(value)) return setError('Enter a valid email address.')
    setBusy(true)
    setError('')
    try {
      if (mode === 'link') await api.linkEmail(value)
      else await api.signInWithEmail(value)
      setSent(value)
    } catch (err) {
      const exists = err && (err.code === 'email_exists' || /already been registered|already registered/i.test(err.message || ''))
      if (mode === 'link' && exists) {
        setMode('signin')
        setError('That email already has an account. Press Send link again to sign in with it.')
      } else {
        setError(api.friendly(err))
      }
    } finally {
      setBusy(false)
    }
  }

  const signOut = async () => {
    try {
      await api.signOut()
      window.location.reload()
    } catch (err) {
      toast(api.friendly(err), 'error')
    }
  }

  const erase = async () => {
    setErasing(true)
    try {
      await api.wipeWorkspace(station.id, userId)
      await api.signOut()
      try {
        Object.keys(localStorage).filter((k) => k.startsWith('tracewire.')).forEach((k) => localStorage.removeItem(k))
      } catch { /* ignore */ }
      window.location.reload()
    } catch (err) {
      toast(api.friendly(err), 'error')
      setErasing(false)
    }
  }

  return (
    <Modal title="Account" onClose={erasing ? undefined : onClose} footer={<button className="btn btn-primary" onClick={onClose} disabled={erasing}>Done</button>}>
      <div className="stack">
        {account.isAnonymous ? (
          <>
            <div className="callout">
              <strong>Your account lives only in this browser.</strong>
              <p className="muted small">
                Link an email to keep your wireframes, sign in on any device, and open wireframes that owners shared with that email.
              </p>
            </div>

            {sent ? (
              <p className="muted">
                {mode === 'link'
                  ? `We sent a confirmation link to ${sent}. Open it to finish linking. Then reload this page.`
                  : `We sent a sign-in link to ${sent}. Open it to continue.`}
              </p>
            ) : (
              <form className="stack" onSubmit={send}>
                <div className="chips" role="tablist" aria-label="Account action">
                  <button type="button" className={`chip ${mode === 'link' ? 'is-on' : ''}`} onClick={() => { setMode('link'); setError('') }} role="tab" aria-selected={mode === 'link'}>Link my email</button>
                  <button type="button" className={`chip ${mode === 'signin' ? 'is-on' : ''}`} onClick={() => { setMode('signin'); setError('') }} role="tab" aria-selected={mode === 'signin'}>Sign in on this device</button>
                </div>
                <p className="muted small">
                  {mode === 'link'
                    ? 'First time? Link the email you want to use. If someone invited you to a wireframe, use the exact email they invited. Your wireframes stay exactly as they are.'
                    : 'Already linked this email before? Sign in to load your wireframes here. Anything created in this browser stays with this browser only.'}
                </p>
                <label className="field">
                  <span>Email</span>
                  <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" disabled={busy} />
                </label>
                {error && <p className="form-error" role="alert">{error}</p>}
                <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? 'Sending...' : 'Send link'}</button>
              </form>
            )}
          </>
        ) : (
          <>
            <p>Signed in as <strong>{account.email}</strong>.</p>
            <p className="muted small">Your wireframes follow this email, and so does any wireframe shared with it. Sign in with it on any device.</p>
            <div><button className="btn btn-sm" onClick={signOut}>Sign out</button></div>
          </>
        )}

        <div className="danger-zone">
          <h3>Erase my data</h3>
          <p className="muted small">
            Permanently deletes every wireframe you own, with its images, wires, issues and replies, and everything you wrote on other people's wireframes. Then signs you out. This cannot be undone.
          </p>
          <label className="field">
            <span>Type DELETE to confirm</span>
            <input className="input" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} disabled={erasing} autoComplete="off" />
          </label>
          <div>
            <button className="btn btn-danger btn-sm" onClick={erase} disabled={erasing || confirmText !== 'DELETE'}>
              {erasing ? 'Erasing...' : 'Erase everything'}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  )
}