import { useCallback, useEffect, useState } from 'react'
import Modal from './Modal.jsx'
import { IconCopy, IconLink, IconTrash } from './Icons.jsx'
import { useApp } from '../context.jsx'
import * as api from '../lib/api.js'
import { copyText, formatDate } from '../lib/format.js'
import { ROLES, roleLabel } from '../lib/roles.js'

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

function RoleSelect({ value, onChange, disabled, label }) {
  return (
    <select className="input select" value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled} aria-label={label}>
      {ROLES.map((r) => (
        <option key={r.value} value={r.value}>{r.label}</option>
      ))}
    </select>
  )
}

export default function ShareModal({ work, onClose, onChanged }) {
  const { toast } = useApp()
  const [invites, setInvites] = useState(null)
  const [joined, setJoined] = useState(null)
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('commenter')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [rowBusy, setRowBusy] = useState(null)
  const [confirmingCode, setConfirmingCode] = useState(false)

  const anyone = work.general_access === 'anyone'
  const pageLink = `${window.location.origin}/work/${work.id}`
  const codeLink = `${window.location.origin}/?code=${work.code}`

  const loadPeople = useCallback(() => {
    api.listInvites(work.id).then(setInvites).catch(() => setInvites([]))
    api.listReviewers(work.id).then(setJoined).catch(() => setJoined([]))
  }, [work.id])

  useEffect(() => { loadPeople() }, [loadPeople])

  const copy = async (text, label) => {
    const ok = await copyText(text)
    toast(ok ? `${label} copied.` : 'Could not copy. Select it manually.', ok ? 'success' : 'error')
  }

  const invite = async (e) => {
    e.preventDefault()
    const value = email.trim().toLowerCase()
    if (!EMAIL_RE.test(value)) return setError('Enter a valid email address.')
    setBusy(true)
    setError('')
    try {
      await api.addInvite(work.id, value, role)
      setEmail('')
      loadPeople()
      toast('Invited. Send them the link below.', 'success')
    } catch (err) {
      setError(api.friendly(err))
    } finally {
      setBusy(false)
    }
  }

  const changeInviteRole = async (item, next) => {
    setRowBusy(item.email)
    try {
      await api.setInviteRole(work.id, item.email, next)
      setInvites((l) => l.map((i) => (i.email === item.email ? { ...i, role: next } : i)))
    } catch (err) {
      toast(api.friendly(err), 'error')
    } finally {
      setRowBusy(null)
    }
  }

  const removeInvite = async (item) => {
    setRowBusy(item.email)
    try {
      await api.removeInvite(work.id, item.email)
      setInvites((l) => l.filter((i) => i.email !== item.email))
    } catch (err) {
      toast(api.friendly(err), 'error')
    } finally {
      setRowBusy(null)
    }
  }

  const changeGeneral = async (patch) => {
    setRowBusy('general')
    try {
      await api.updateSharing(work.id, patch)
      onChanged(patch)
    } catch (err) {
      toast(api.friendly(err), 'error')
    } finally {
      setRowBusy(null)
    }
  }

  const changeJoined = async (p, allow) => {
    setRowBusy(p.user_id)
    try {
      await api.setReviewerAccess(work.id, p.user_id, allow)
      loadPeople()
    } catch (err) {
      toast(api.friendly(err), 'error')
    } finally {
      setRowBusy(null)
    }
  }

  const regenerate = async () => {
    setRowBusy('code')
    try {
      const code = await api.regenerateCode(work.id)
      onChanged({ code })
      setConfirmingCode(false)
      loadPeople()
      toast('New code created. The old code no longer works.', 'success')
    } catch (err) {
      toast(api.friendly(err), 'error')
    } finally {
      setRowBusy(null)
    }
  }

  const mailto = () => {
    const to = (invites || []).map((i) => i.email).join(',')
    const subject = encodeURIComponent(`Tracewire: ${work.title}`)
    const body = encodeURIComponent(
      `I shared a wireframe with you on Tracewire.\n\nOpen it here: ${pageLink}\n\nSign in with this email address to see it.`
    )
    return `mailto:${to}?subject=${subject}&body=${body}`
  }

  return (
    <Modal title={`Share "${work.title}"`} wide onClose={onClose} footer={<button className="btn btn-primary" onClick={onClose}>Done</button>}>
      <div className="stack">
        <section className="share-section">
          <h3>Add people</h3>
          <form className="invite-form" onSubmit={invite}>
            <input
              className="input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@example.com"
              autoComplete="off"
              aria-label="Email to invite"
              disabled={busy}
            />
            <RoleSelect value={role} onChange={setRole} disabled={busy} label="Role for the new person" />
            <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? 'Inviting...' : 'Invite'}</button>
          </form>
          <p className="muted small">They must sign in with this exact email. The app does not send emails, so copy the link below or use the email button.</p>
          {error && <p className="form-error" role="alert">{error}</p>}
        </section>

        <section className="share-section">
          <h3>People with access</h3>
          <ul className="access-list">
            <li className="access-row">
              <div className="access-text">
                <strong>You</strong>
                <span className="muted small">Owner</span>
              </div>
            </li>

            {invites === null ? (
              <li className="muted small">Loading...</li>
            ) : (
              invites.map((i) => (
                <li key={i.email} className="access-row">
                  <div className="access-text">
                    <strong>{i.email}</strong>
                    <span className="muted small">Invited {formatDate(i.created_at)}</span>
                  </div>
                  <div className="access-actions">
                    <RoleSelect value={i.role} onChange={(r) => changeInviteRole(i, r)} disabled={rowBusy === i.email} label={`Role for ${i.email}`} />
                    <button className="icon-btn" onClick={() => removeInvite(i)} disabled={rowBusy === i.email} aria-label={`Remove ${i.email}`} title="Remove access">
                      <IconTrash />
                    </button>
                  </div>
                </li>
              ))
            )}

            {(joined || []).map((p) => (
              <li key={p.user_id} className="access-row">
                <div className="access-text">
                  <strong>{p.names.length ? p.names.join(', ') : 'Joined with the code'}</strong>
                  <span className="muted small">
                    {p.blocked ? 'Removed' : !anyone ? 'Code access is off' : `${roleLabel(work.general_role)} via code`} - Joined {formatDate(p.joined_at)} - {p.issue_count} {Number(p.issue_count) === 1 ? 'issue' : 'issues'}, {p.reply_count} {Number(p.reply_count) === 1 ? 'reply' : 'replies'}
                  </span>
                </div>
                <div className="access-actions">
                  {p.blocked ? (
                    <button className="btn btn-sm" onClick={() => changeJoined(p, true)} disabled={rowBusy === p.user_id}>Restore</button>
                  ) : (
                    <button className="btn btn-sm btn-danger-ghost" onClick={() => changeJoined(p, false)} disabled={rowBusy === p.user_id}>Remove</button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className="share-section">
          <h3>General access</h3>
          <div className="general-row">
            <select
              className="input select"
              value={work.general_access}
              onChange={(e) => changeGeneral({ general_access: e.target.value })}
              disabled={rowBusy === 'general'}
              aria-label="General access"
            >
              <option value="restricted">Restricted: only invited people</option>
              <option value="anyone">Anyone with the code</option>
            </select>
            {anyone && (
              <RoleSelect value={work.general_role} onChange={(r) => changeGeneral({ general_role: r })} disabled={rowBusy === 'general'} label="Role for anyone with the code" />
            )}
          </div>
          <p className="muted small">
            {anyone
              ? `Anyone who has the code or the invite link can open this wireframe. They get the role "${ROLES.find((r) => r.value === work.general_role).label}".`
              : 'Only the people listed above can open this wireframe, and only while signed in with their invited email.'}
          </p>
        </section>

        <section className="share-section">
          <h3>Links</h3>
          <div className="link-row">
            <button className="btn btn-sm" onClick={() => copy(pageLink, 'Link')}><IconLink /> Copy link</button>
            <a className="btn btn-sm" href={mailto()}>Email the link</a>
          </div>
          <p className="muted small">This link opens the wireframe for people who already have access.</p>

          {anyone && (
            <>
              <code className="code" aria-label="Wireframe code">{work.code}</code>
              <div className="link-row">
                <button className="btn btn-sm" onClick={() => copy(work.code, 'Code')}><IconCopy /> Copy code</button>
                <button className="btn btn-sm" onClick={() => copy(codeLink, 'Invite link')}><IconLink /> Copy invite link</button>
              </div>
              {confirmingCode ? (
                <div className="row wrap">
                  <span className="muted small">This removes everyone who joined with the old code.</span>
                  <button className="btn btn-danger btn-sm" onClick={regenerate} disabled={rowBusy === 'code'}>{rowBusy === 'code' ? 'Working...' : 'Yes, generate new code'}</button>
                  <button className="btn btn-sm" onClick={() => setConfirmingCode(false)} disabled={rowBusy === 'code'}>Cancel</button>
                </div>
              ) : (
                <div><button className="btn btn-sm" onClick={() => setConfirmingCode(true)}>Generate new code</button></div>
              )}
            </>
          )}
        </section>
      <p className="muted small">The Tracewire administrator can also open every wireframe, for support and moderation.</p>
      </div>
    </Modal>
  )
}