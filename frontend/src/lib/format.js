export function formatDateTime(iso) {
  try {
    return new Date(iso).toLocaleString(undefined, {
      day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit',
    })
  } catch {
    return ''
  }
}

export function formatDate(iso) {
  try {
    return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
  } catch {
    return ''
  }
}

export function baseName(name) {
  const clean = (name || 'Page').replace(/\.[^.]+$/, '').trim().slice(0, 60)
  return clean || 'Page'
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    try {
      const t = document.createElement('textarea')
      t.value = text
      t.style.position = 'fixed'
      t.style.opacity = '0'
      document.body.appendChild(t)
      t.select()
      const ok = document.execCommand('copy')
      t.remove()
      return ok
    } catch {
      return false
    }
  }
}

export function safeGet(key) {
  try { return localStorage.getItem(key) } catch { return null }
}

export function safeSet(key, value) {
  try { localStorage.setItem(key, value) } catch { /* ignore */ }
}