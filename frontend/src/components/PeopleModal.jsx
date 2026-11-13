import { useCallback, useEffect, useState } from 'react'
import Modal from './Modal.jsx'
import { useApp } from '../context.jsx'
import * as api from '../lib/api.js'
import { formatDate } from '../lib/format.js'

export default function PeopleModal({ work, onClose }) {
  const { toast } = useApp()
  const [people, setPeople] = useState(null)
  const [busyId, setBusyId] = useState(null)

  const load = useCallback(
    () => api.listReviewers(work.id).then(setPeople).catch((e) => { setPeople([]); toast(api.friendly(e), 'error') }),
    [work.id, toast]
  )

  useEffect(() => { load() }, [load])

  const change = async (p, allow) => {
    setBusyId(p.user_id)
    try {
      await api.setReviewerAccess(work.id, p.user_id, allow)
      await load()
    } catch (err) {
      toast(api.friendly(err), 'error')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <Modal title="People with access" onClose={onClose} footer={<button className="btn btn-primary" onClick={onClose}>Done</button>}>
      <div className="stack">
        <p className="muted small">
          Removing someone blocks them from this wireframe even if they still have the code. To cut off everyone at once, generate a new code from Share.
        </p>
        {people === null ? (
          <div className="center"><div className="spinner" role="status" aria-label="Loading" /></div>
        ) : people.length === 0 ? (
          <p className="muted empty-note">Nobody has joined this wireframe yet.</p>
        ) : (
          <ul className="people">
            {people.map((p) => (
              <li key={p.user_id} className="person">
                <div className="person-text">
                  <strong>{p.names.length ? p.names.join(', ') : 'Has not written anything yet'}</strong>
                  <span className="muted small">
                    {p.blocked ? 'Removed' : `Joined ${formatDate(p.joined_at)}`} - {p.issue_count} {Number(p.issue_count) === 1 ? 'issue' : 'issues'} - {p.reply_count} {Number(p.reply_count) === 1 ? 'reply' : 'replies'}
                  </span>
                </div>
                {p.blocked ? (
                  <button className="btn btn-sm" onClick={() => change(p, true)} disabled={busyId === p.user_id}>Restore</button>
                ) : (
                  <button className="btn btn-sm btn-danger-ghost" onClick={() => change(p, false)} disabled={busyId === p.user_id}>Remove</button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  )
}