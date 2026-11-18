import { describe, expect, it } from 'vitest'
import { formatLayout } from './layout.js'

const page = (id, position, w = 100, h = 100) => ({ id, position, w, h })
const wire = (a, b, fy = 0.5, ty = 0.5) => ({ from_screen: a, to_screen: b, from_y: fy, to_y: ty })

function overlaps(a, b, result, pages) {
  const pa = pages.find((p) => p.id === a)
  const pb = pages.find((p) => p.id === b)
  const ra = result.get(a)
  const rb = result.get(b)
  return ra.x < rb.x + pb.w && rb.x < ra.x + pa.w && ra.y < rb.y + pb.h && rb.y < ra.y + pa.h
}

function noOverlaps(pages, result) {
  for (let i = 0; i < pages.length; i++) {
    for (let j = i + 1; j < pages.length; j++) {
      if (overlaps(pages[i].id, pages[j].id, result, pages)) return false
    }
  }
  return true
}

describe('formatLayout', () => {
  it('returns nothing for no pages', () => {
    expect(formatLayout([], []).size).toBe(0)
  })

  it('lays a chain out from left to right', () => {
    const pages = [page('a', 0), page('b', 1), page('c', 2)]
    const r = formatLayout(pages, [wire('a', 'b'), wire('b', 'c')])
    expect(r.get('a').x).toBeLessThan(r.get('b').x)
    expect(r.get('b').x).toBeLessThan(r.get('c').x)
    expect(r.get('a').y).toBe(r.get('b').y)
  })

  it('lines the two ends of a wire up at the same height', () => {
    const pages = [page('a', 0, 100, 200), page('b', 1, 100, 100)]
    const r = formatLayout(pages, [wire('a', 'b', 0.5, 0.5)])
    // centers match, so the shorter page sits 50 lower
    expect(r.get('b').y - r.get('a').y).toBe(50)
  })

  it('aligns top anchors when both wires end at the top of their pages', () => {
    const pages = [page('a', 0, 100, 300), page('b', 1, 100, 120)]
    const r = formatLayout(pages, [wire('a', 'b', 0, 0)])
    expect(r.get('a').y).toBe(r.get('b').y)
  })

  it('handles wires that loop back without failing', () => {
    const pages = [page('a', 0), page('b', 1), page('c', 2)]
    const r = formatLayout(pages, [wire('a', 'b'), wire('b', 'c'), wire('c', 'a')])
    expect(r.size).toBe(3)
    expect(noOverlaps(pages, r)).toBe(true)
  })

  it('ignores wires to pages that no longer exist and wires to the same page', () => {
    const pages = [page('a', 0), page('b', 1)]
    const r = formatLayout(pages, [wire('a', 'gone'), wire('a', 'a'), wire('a', 'b')])
    expect(r.size).toBe(2)
    expect(r.get('a').x).toBeLessThan(r.get('b').x)
  })

  it('puts pages without wires in a grid, in their original order', () => {
    const pages = Array.from({ length: 12 }, (_, i) => page(`p${i}`, i, 400, 600))
    const r = formatLayout(pages, [])
    expect(r.size).toBe(12)
    expect(noOverlaps(pages, r)).toBe(true)
    expect(r.get('p0').x).toBeLessThan(r.get('p1').x)
  })

  it('keeps separate groups of pages from overlapping', () => {
    const pages = [page('a', 0), page('b', 1), page('c', 2), page('d', 3), page('e', 4)]
    const r = formatLayout(pages, [wire('a', 'b'), wire('c', 'd')])
    expect(r.size).toBe(5)
    expect(noOverlaps(pages, r)).toBe(true)
  })

  it('never overlaps pages in a large, tangled wireframe', () => {
    let seed = 12345
    const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296
    const pages = Array.from({ length: 60 }, (_, i) => page(`p${i}`, i, 200 + Math.floor(rnd() * 440), 300 + Math.floor(rnd() * 400)))
    const wires = []
    for (let i = 0; i < 110; i++) {
      wires.push(wire(`p${Math.floor(rnd() * 60)}`, `p${Math.floor(rnd() * 60)}`, rnd(), rnd()))
    }
    const r = formatLayout(pages, wires)
    expect(r.size).toBe(60)
    expect(noOverlaps(pages, r)).toBe(true)
  })

  it('gives the same result every time', () => {
    const pages = [page('a', 0), page('b', 1), page('c', 2), page('d', 3)]
    const wires = [wire('a', 'b'), wire('a', 'c'), wire('b', 'd'), wire('c', 'd')]
    const one = [...formatLayout(pages, wires)]
    const two = [...formatLayout(pages, wires)]
    expect(one).toEqual(two)
  })
})