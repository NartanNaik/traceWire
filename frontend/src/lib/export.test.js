import { describe, expect, it } from 'vitest'
import { buildMarkdown } from './export.js'

const screens = [
  { id: 's1', name: 'Home', note: 'Landing page' },
  { id: 's2', name: 'Checkout', note: '' },
]
const links = [{ id: 'l1', from_screen: 's1', to_screen: 's2', note: '' }]
const issues = [
  { id: 'i1', screen_id: 's1', title: 'Button is hidden', details: 'Hard to see', fix: 'Make it bigger', status: 'open', author_name: 'Sam', created_at: '2026-11-13T10:00:00Z' },
]
const comments = [
  { id: 'c1', issue_id: 'i1', parent_id: null, author_name: 'Sam', body: 'Any update?', image_path: null, created_at: '2026-11-13T11:00:00Z' },
  { id: 'c2', issue_id: 'i1', parent_id: 'c1', author_name: 'Owner', body: 'Fixed', image_path: null, created_at: '2026-11-13T12:00:00Z' },
]

describe('buildMarkdown', () => {
  const md = buildMarkdown({ title: 'Demo', screens, links, issues, comments })

  it('includes the title, pages and wires', () => {
    expect(md).toContain('# Demo')
    expect(md).toContain('Landing page')
    expect(md).toContain('Home -> Checkout')
  })

  it('includes the issue and its replies', () => {
    expect(md).toContain('Button is hidden')
    expect(md).toContain('Any update?')
    expect(md).toContain('Fixed')
  })

  it('nests a reply under its parent', () => {
    const lines = md.split('\n')
    const parent = lines.find((l) => l.includes('Any update?'))
    const child = lines.find((l) => l.includes('Fixed'))
    const depth = (l) => l.length - l.trimStart().length
    expect(depth(child)).toBeGreaterThan(depth(parent))
  })
})