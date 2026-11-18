// Automatic, readable layout for a wireframe (a layered flow-chart layout).
//
// Input:  pages { id, w, h, position } and wires { from_screen, to_screen, from_y, to_y }.
// Output: Map of page id -> { x, y }.
//
// Page sizes are never changed. Wires keep their anchor points, because an anchor is stored
// as a fraction of its own page (0 to 1), not as a canvas position. Moving a page therefore
// moves both ends of its wires with it and leaves them on the same spot of the image.

const H_GAP = 180 // between columns
const V_GAP = 90 // between pages in a column (leaves room for the page name above)
const WIRE_GAP = 36 // between a page and a wire lane
const COMPONENT_GAP = 220 // between separate groups of connected pages
const GRID_GAP_X = 80
const GRID_GAP_Y = 110
const GRID_WIDTH = 3000
const DUMMY_H = 44 // height reserved for a long wire passing through a column
const DUMMY_BUDGET = 4000 // cap on reserved lanes so huge graphs stay fast
const SWEEPS = 8
const ITERATIONS = 10

const num = (v, fallback) => (Number.isFinite(v) ? v : fallback)
const mean = (list) => list.reduce((a, b) => a + b, 0) / list.length
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0)

// Places items top to bottom with minimum gaps, as close as possible to their desired centers.
// (Isotonic regression: pool adjacent violators.)
function separate(items, desired) {
  const n = items.length
  if (!n) return []
  const off = new Array(n)
  off[0] = 0
  for (let i = 1; i < n; i++) {
    const a = items[i - 1]
    const b = items[i]
    const gap = a.real && b.real ? V_GAP : WIRE_GAP
    off[i] = off[i - 1] + a.h / 2 + gap + b.h / 2
  }
  const blocks = []
  for (let i = 0; i < n; i++) {
    blocks.push({ sum: desired[i] - off[i], count: 1 })
    while (blocks.length > 1) {
      const b = blocks[blocks.length - 1]
      const a = blocks[blocks.length - 2]
      if (a.sum / a.count <= b.sum / b.count) break
      a.sum += b.sum
      a.count += b.count
      blocks.pop()
    }
  }
  const out = []
  let idx = 0
  for (const b of blocks) {
    const v = b.sum / b.count
    for (let j = 0; j < b.count; j++) out.push(v + off[idx++])
  }
  return out
}

function layoutComponent(pages, edges, rank) {
  const ids = pages.map((p) => p.id)
  const page = new Map(pages.map((p) => [p.id, p]))
  const out = new Map(ids.map((id) => [id, []]))
  const inn = new Map(ids.map((id) => [id, []]))
  edges.forEach((e, i) => {
    out.get(e.from).push(i)
    inn.get(e.to).push(i)
  })

  // 1. break cycles: a depth-first search from the pages nothing points to, in page order
  const state = new Map()
  const reversed = new Set()
  const starts = [...ids.filter((id) => inn.get(id).length === 0), ...ids]
  for (const s of starts) {
    if (state.get(s)) continue
    state.set(s, 1)
    const stack = [{ id: s, i: 0 }]
    while (stack.length) {
      const top = stack[stack.length - 1]
      const outs = out.get(top.id)
      if (top.i < outs.length) {
        const ei = outs[top.i++]
        const to = edges[ei].to
        const st = state.get(to)
        if (!st) {
          state.set(to, 1)
          stack.push({ id: to, i: 0 })
        } else if (st === 1) {
          reversed.add(ei)
        }
      } else {
        state.set(top.id, 2)
        stack.pop()
      }
    }
  }

  // the wires as an acyclic graph (a looping wire is reversed for layering only)
  const dag = edges.map((e, i) =>
    reversed.has(i) ? { a: e.to, b: e.from, ay: e.ty, by: e.fy } : { a: e.from, b: e.to, ay: e.fy, by: e.ty }
  )
  const dagOut = new Map(ids.map((id) => [id, []]))
  const dagIn = new Map(ids.map((id) => [id, []]))
  dag.forEach((d, i) => {
    dagOut.get(d.a).push(i)
    dagIn.get(d.b).push(i)
  })

  // 2. columns: the longest path from the start of the flow
  const indeg = new Map(ids.map((id) => [id, dagIn.get(id).length]))
  const queue = ids.filter((id) => indeg.get(id) === 0)
  const layer = new Map(ids.map((id) => [id, 0]))
  const topo = []
  for (let qi = 0; qi < queue.length; qi++) {
    const id = queue[qi]
    topo.push(id)
    for (const di of dagOut.get(id)) {
      const b = dag[di].b
      layer.set(b, Math.max(layer.get(b), layer.get(id) + 1))
      indeg.set(b, indeg.get(b) - 1)
      if (indeg.get(b) === 0) queue.push(b)
    }
  }
  // pull each starting page next to the pages it points to, so its wires stay short
  for (let i = topo.length - 1; i >= 0; i--) {
    const id = topo[i]
    if (dagIn.get(id).length === 0 && dagOut.get(id).length) {
      layer.set(id, Math.min(...dagOut.get(id).map((di) => layer.get(dag[di].b))) - 1)
    }
  }

  // 3. nodes: real pages, plus a thin placeholder wherever a long wire crosses a column
  const nodes = new Map()
  ids.forEach((id) => {
    const p = page.get(id)
    nodes.set(id, { key: id, real: true, w: p.w, h: p.h, layer: layer.get(id), ord: rank.get(id) })
  })
  const nb = new Map(ids.map((id) => [id, { prev: [], next: [] }]))
  const connect = (u, uFrac, v, vFrac) => {
    nb.get(u).next.push({ other: v, mine: uFrac, theirs: vFrac })
    nb.get(v).prev.push({ other: u, mine: vFrac, theirs: uFrac })
  }
  let dummies = 0
  let budget = DUMMY_BUDGET
  dag.forEach((d) => {
    const la = layer.get(d.a)
    const lb = layer.get(d.b)
    const span = lb - la
    if (span > 1 && budget >= span - 1) {
      budget -= span - 1
      let prevKey = d.a
      let prevFrac = d.ay
      for (let l = la + 1; l < lb; l++) {
        const key = `~${dummies++}`
        nodes.set(key, { key, real: false, w: 0, h: DUMMY_H, layer: l, ord: rank.get(d.a) + 0.5 })
        nb.set(key, { prev: [], next: [] })
        connect(prevKey, prevFrac, key, 0.5)
        prevKey = key
        prevFrac = 0.5
      }
      connect(prevKey, prevFrac, d.b, d.by)
    } else {
      connect(d.a, d.ay, d.b, d.by)
    }
  })

  const layerCount = Math.max(...ids.map((id) => layer.get(id))) + 1
  const layers = Array.from({ length: layerCount }, () => [])
  nodes.forEach((n) => layers[n.layer].push(n.key))
  layers.forEach((L) => L.sort((a, b) => nodes.get(a).ord - nodes.get(b).ord || cmp(a, b)))

  // 4. order inside each column to reduce crossings (barycenter sweeps)
  const pos = new Map()
  const reindex = (l) => layers[l].forEach((k, i) => pos.set(k, i))
  layers.forEach((_, l) => reindex(l))

  const reorder = (l, dir) => {
    const L = layers[l]
    const keyed = L.map((k, i) => {
      const list = dir === 'down' ? nb.get(k).prev : nb.get(k).next
      let b = (i + 0.5) / L.length
      if (list.length) {
        b = mean(list.map((n) => (pos.get(n.other) + 0.5) / layers[nodes.get(n.other).layer].length))
      }
      return { k, i, b }
    })
    keyed.sort((p, q) => p.b - q.b || p.i - q.i)
    layers[l] = keyed.map((x) => x.k)
    reindex(l)
  }
  for (let sw = 0; sw < SWEEPS; sw++) {
    if (sw % 2 === 0) for (let l = 1; l < layers.length; l++) reorder(l, 'down')
    else for (let l = layers.length - 2; l >= 0; l--) reorder(l, 'up')
  }

  // 5. vertical placement: line up the two ends of each wire, keeping pages apart
  const cy = new Map()
  layers.forEach((L) => {
    let y = 0
    L.forEach((k) => {
      const n = nodes.get(k)
      cy.set(k, y + n.h / 2)
      y += n.h + V_GAP
    })
  })
  const place = (l) => {
    const L = layers[l]
    const items = L.map((k) => nodes.get(k))
    const desired = L.map((k) => {
      const n = nodes.get(k)
      const list = [...nb.get(k).prev, ...nb.get(k).next]
      if (!list.length) return cy.get(k)
      return mean(
        list.map((e) => {
          const o = nodes.get(e.other)
          return cy.get(e.other) + (e.theirs - 0.5) * o.h - (e.mine - 0.5) * n.h
        })
      )
    })
    const centers = separate(items, desired)
    L.forEach((k, i) => cy.set(k, centers[i]))
  }
  for (let it = 0; it < ITERATIONS; it++) {
    for (let l = 0; l < layers.length; l++) place(l)
    for (let l = layers.length - 1; l >= 0; l--) place(l)
  }

  // 6. final coordinates
  const layerW = layers.map((L) => Math.max(40, ...L.map((k) => (nodes.get(k).real ? nodes.get(k).w : 0))))
  const layerX = []
  let x = 0
  layerW.forEach((w, i) => {
    layerX[i] = x
    x += w + H_GAP
  })

  let minTop = Infinity
  let maxBottom = -Infinity
  ids.forEach((id) => {
    const n = nodes.get(id)
    minTop = Math.min(minTop, cy.get(id) - n.h / 2)
    maxBottom = Math.max(maxBottom, cy.get(id) + n.h / 2)
  })
  const result = new Map()
  ids.forEach((id) => {
    const n = nodes.get(id)
    result.set(id, {
      x: layerX[n.layer] + (layerW[n.layer] - n.w) / 2,
      y: cy.get(id) - n.h / 2 - minTop,
    })
  })
  return { pos: result, width: x - H_GAP, height: maxBottom - minTop }
}

export function formatLayout(pages, wires) {
  const result = new Map()
  if (!pages.length) return result

  const order = [...pages].sort((a, b) => num(a.position, 0) - num(b.position, 0) || cmp(String(a.id), String(b.id)))
  const rank = new Map(order.map((p, i) => [p.id, i]))
  const known = new Set(order.map((p) => p.id))

  // one edge per pair of pages, with its anchors averaged
  const merged = new Map()
  for (const w of wires) {
    if (!known.has(w.from_screen) || !known.has(w.to_screen) || w.from_screen === w.to_screen) continue
    const key = `${w.from_screen}|${w.to_screen}`
    let e = merged.get(key)
    if (!e) {
      e = { from: w.from_screen, to: w.to_screen, fy: [], ty: [] }
      merged.set(key, e)
    }
    e.fy.push(num(w.from_y, 0.5))
    e.ty.push(num(w.to_y, 0.5))
  }
  const edges = [...merged.values()].map((e) => ({ from: e.from, to: e.to, fy: mean(e.fy), ty: mean(e.ty) }))

  // groups of connected pages
  const parent = new Map(order.map((p) => [p.id, p.id]))
  const find = (id) => {
    let r = id
    while (parent.get(r) !== r) r = parent.get(r)
    let c = id
    while (parent.get(c) !== r) {
      const next = parent.get(c)
      parent.set(c, r)
      c = next
    }
    return r
  }
  edges.forEach((e) => {
    const a = find(e.from)
    const b = find(e.to)
    if (a !== b) parent.set(a, b)
  })

  const groups = new Map()
  order.forEach((p) => {
    const r = find(p.id)
    if (!groups.has(r)) groups.set(r, [])
    groups.get(r).push(p)
  })
  const groupEdges = new Map()
  edges.forEach((e) => {
    const r = find(e.from)
    if (!groupEdges.has(r)) groupEdges.set(r, [])
    groupEdges.get(r).push(e)
  })

  let yCursor = 0
  let widest = 0
  const lonely = []
  groups.forEach((list, root) => {
    const es = groupEdges.get(root)
    if (!es) {
      lonely.push(...list)
      return
    }
    const laid = layoutComponent(list, es, rank)
    laid.pos.forEach((p, id) => result.set(id, { x: Math.round(p.x), y: Math.round(p.y + yCursor) }))
    yCursor += laid.height + COMPONENT_GAP
    widest = Math.max(widest, laid.width)
  })

  // pages with no wires go in a tidy grid below, in their original order
  const rowWidth = Math.max(GRID_WIDTH, widest)
  let gx = 0
  let gy = yCursor
  let rowH = 0
  lonely.forEach((p) => {
    if (gx > 0 && gx + p.w > rowWidth) {
      gx = 0
      gy += rowH + GRID_GAP_Y
      rowH = 0
    }
    result.set(p.id, { x: Math.round(gx), y: Math.round(gy) })
    gx += p.w + GRID_GAP_X
    rowH = Math.max(rowH, p.h)
  })

  return result
}