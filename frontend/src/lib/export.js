const when = (iso) => {
  try { return new Date(iso).toLocaleString() } catch { return String(iso) }
}
const indent = (text, pad) => String(text).split('\n').join(`\n${pad}`)
const has = (s) => Boolean(s && s.trim())

function thread(list) {
  const ids = new Set(list.map((c) => c.id))
  const kids = {}
  ;[...list]
    .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))
    .forEach((c) => {
      const key = c.parent_id && ids.has(c.parent_id) ? c.parent_id : 'root'
      ;(kids[key] = kids[key] || []).push(c)
    })
  const lines = []
  const walk = (key, depth) => {
    ;(kids[key] || []).forEach((c) => {
      const pad = '  '.repeat(depth)
      const body = has(c.body) ? c.body.trim() : ''
      const img = c.image_path ? ' [image attached]' : ''
      lines.push(`${pad}- ${c.author_name} (${when(c.created_at)}): ${indent(body, `${pad}  `)}${img}`.trimEnd())
      walk(c.id, depth + 1)
    })
  }
  walk('root', 0)
  return lines
}

export function buildMarkdown({ title, screens, links, issues, comments }) {
  const pageName = Object.fromEntries(screens.map((s) => [s.id, s.name]))
  const out = [`# ${title}`, '', `Exported ${when(new Date().toISOString())}`, '', '## Pages', '']

  if (!screens.length) out.push('No pages.')
  screens.forEach((s, i) => {
    out.push(`${i + 1}. ${s.name}`)
    if (has(s.note)) out.push(`   - Note: ${indent(s.note.trim(), '     ')}`)
  })

  out.push('', '## Wires', '')
  if (!links.length) out.push('No wires.')
  links.forEach((l) => {
    out.push(`- ${pageName[l.from_screen] || 'Removed page'} -> ${pageName[l.to_screen] || 'Removed page'}`)
    if (has(l.note)) out.push(`  - Note: ${indent(l.note.trim(), '    ')}`)
  })

  out.push('', '## Issues', '')
  if (!issues.length) out.push('No issues.')
  issues.forEach((i, idx) => {
    out.push(
      `### #${idx + 1} ${i.title}`,
      '',
      `- Status: ${i.status === 'resolved' ? 'Resolved' : 'Open'}`,
      `- Page: ${pageName[i.screen_id] || 'Removed page'}`,
      `- Reported by: ${i.author_name}, ${when(i.created_at)}`,
      ''
    )
    if (has(i.details)) out.push(i.details.trim(), '')
    if (has(i.fix)) out.push(`Suggested fix: ${i.fix.trim()}`, '')
    const mine = comments.filter((c) => c.issue_id === i.id)
    if (mine.length) {
      out.push('Replies:', '', ...thread(mine), '')
    }
  })
  return out.join('\n')
}

export function buildJson({ title, screens, links, issues, comments }) {
  return JSON.stringify(
    {
      app: 'tracewire',
      version: 1,
      exportedAt: new Date().toISOString(),
      title,
      pages: screens.map(({ id, name, note, x, y, w, h, position }) => ({ id, name, note, x, y, w, h, position })),
      wires: links.map(({ id, from_screen, from_x, from_y, to_screen, to_x, to_y, note }) => ({
        id, from_screen, from_x, from_y, to_screen, to_x, to_y, note,
      })),
      issues: issues.map(({ id, screen_id, title: t, details, fix, status, author_name, pin_x, pin_y, created_at }) => ({
        id, screen_id, title: t, details, fix, status, author_name, pin_x, pin_y, created_at,
      })),
      replies: comments.map(({ id, issue_id, parent_id, author_name, body, image_path, created_at, edited_at }) => ({
        id, issue_id, parent_id, author_name, body, has_image: Boolean(image_path), created_at, edited_at,
      })),
    },
    null,
    2
  )
}

export const safeFile = (t) => (t || 'wireframe').replace(/[^\w-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'wireframe'

export function download(filename, text, type) {
  const blob = new Blob([text], { type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}