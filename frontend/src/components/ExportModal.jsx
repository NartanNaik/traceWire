import { useState } from 'react'
import Modal from './Modal.jsx'
import { useApp } from '../context.jsx'
import * as api from '../lib/api.js'
import { buildJson, buildMarkdown, download, safeFile } from '../lib/export.js'

export default function ExportModal({ work, onClose }) {
  const { toast } = useApp()
  const [busy, setBusy] = useState(false)

  const run = async (kind) => {
    setBusy(true)
    try {
      const d = await api.fetchCanvas(work.id)
      const data = { title: work.title, ...d }
      const base = safeFile(work.title)
      if (kind === 'md') download(`${base}.md`, buildMarkdown(data), 'text/markdown;charset=utf-8')
      else download(`${base}.json`, buildJson(data), 'application/json')
      toast('Export downloaded.', 'success')
    } catch (err) {
      toast(api.friendly(err), 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title="Export" onClose={busy ? undefined : onClose} footer={<button className="btn" onClick={onClose} disabled={busy}>Close</button>}>
      <div className="stack">
        <p className="muted small">
          Downloads the pages, wires, notes, issues and all replies. Images are not included, and the share code is never exported.
        </p>
        <div className="export-actions">
          <button className="btn btn-primary" onClick={() => run('md')} disabled={busy}>Download report (Markdown)</button>
          <button className="btn" onClick={() => run('json')} disabled={busy}>Download data (JSON)</button>
        </div>
      </div>
    </Modal>
  )
}