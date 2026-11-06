import { supabase } from './supabase.js'
import { prepareImage } from './image.js'
import { baseName } from './format.js'

const BUCKET = 'screens'
const URL_TTL = 6 * 60 * 60
const CONCURRENCY = 3
const EXT = { 'image/webp': 'webp', 'image/jpeg': 'jpg', 'image/png': 'png' }
const urlCache = new Map()
let bootPromise = null

export function friendly(err) {
  const msg = (err && err.message) || String(err || '')
  if (/wireframes_station_title_key/.test(msg)) return 'You already have a wireframe with that name. Choose a different name.'
  if (/wireframes_code_key/.test(msg)) return 'Could not create a unique code. Please try again.'
  if (/code_not_found/.test(msg)) return 'No wireframe matches that code.'
  if (/anonymous/i.test(msg) && /disabled|not enabled/i.test(msg)) {
    return 'Anonymous sign-ins are disabled. Enable them in Supabase under Authentication, Sign In / Providers.'
  }
  if (/Failed to fetch|NetworkError|Load failed/i.test(msg)) return 'Network problem. Check your connection and try again.'
  if (/row-level security|permission denied|not_allowed/i.test(msg)) return 'You do not have permission to do that.'
  return msg || 'Something went wrong.'
}

async function run(query) {
  const { data, error } = await query
  if (error) throw error
  return data
}

async function doBootstrap() {
  let {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session) {
    const { data, error } = await supabase.auth.signInAnonymously()
    if (error) throw error
    session = data.session
  }
  const station = await run(supabase.rpc('ensure_station'))
  return { session, station }
}

export function bootstrap() {
  if (!bootPromise) {
    bootPromise = doBootstrap().catch((err) => {
      bootPromise = null
      throw err
    })
  }
  return bootPromise
}

/* ---------- signed image urls ---------- */
export async function signPaths(paths) {
  const now = Date.now()
  const need = [...new Set(paths)].filter((p) => {
    const c = urlCache.get(p)
    return !c || c.exp < now + 60000
  })
  if (need.length) {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrls(need, URL_TTL)
    if (error) throw error
    data.forEach((d) => {
      if (d.signedUrl) urlCache.set(d.path, { url: d.signedUrl, exp: now + URL_TTL * 1000 })
    })
  }
  return Object.fromEntries(paths.map((p) => [p, (urlCache.get(p) || {}).url || null]))
}

async function removeFiles(paths) {
  for (let i = 0; i < paths.length; i += 100) {
    const { error } = await supabase.storage.from(BUCKET).remove(paths.slice(i, i + 100))
    if (error) throw error
  }
}

async function runPool(items, limit, worker) {
  const results = new Array(items.length)
  let next = 0
  let failure = null
  const lane = async () => {
    while (!failure && next < items.length) {
      const i = next++
      try {
        results[i] = await worker(items[i], i)
      } catch (err) {
        failure = failure || err
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, lane))
  if (failure) throw failure
  return results
}

/* ---------- joining shared wireframes ---------- */
export const joinWireframe = (code) => run(supabase.rpc('join_wireframe', { p_code: code }))

export const regenerateCode = (wireframeId) => run(supabase.rpc('regenerate_wireframe_code', { p_id: wireframeId }))

export async function leaveWireframe(wireframeId) {
  await run(supabase.from('wireframe_access').delete().eq('wireframe_id', wireframeId))
}

export async function listShared() {
  const rows = await run(
    supabase
      .from('wireframe_access')
      .select('created_at,wireframes(id,title,stations(display_name))')
      .order('created_at', { ascending: false })
  )
  return rows
    .filter((r) => r.wireframes)
    .map((r) => ({
      id: r.wireframes.id,
      title: r.wireframes.title,
      owner: r.wireframes.stations ? r.wireframes.stations.display_name : null,
      joined_at: r.created_at,
    }))
}

/* ---------- station ---------- */
export const renameStation = (id, name) =>
  run(supabase.from('stations').update({ display_name: name || null }).eq('id', id).select().single())

/* ---------- wireframes ---------- */
export async function listWireframes(stationId) {
  const rows = await run(
    supabase
      .from('wireframes')
      .select('id,title,code,created_at,updated_at,screens(image_path,position)')
      .eq('station_id', stationId)
      .order('updated_at', { ascending: false })
  )
  const firsts = rows.map((r) => {
    const sorted = [...(r.screens || [])].sort((a, b) => a.position - b.position)
    return sorted[0] ? sorted[0].image_path : null
  })
  const urls = firsts.filter(Boolean).length ? await signPaths(firsts.filter(Boolean)) : {}
  return rows.map((r, i) => ({
    id: r.id,
    title: r.title,
    code: r.code,
    created_at: r.created_at,
    updated_at: r.updated_at,
    count: (r.screens || []).length,
    thumb: firsts[i] ? urls[firsts[i]] : null,
  }))
}

export const getWork = (id) =>
  run(supabase.from('wireframes').select('*,stations(id,code,display_name,owner_id)').eq('id', id).maybeSingle())

export async function addScreens({ wireframeId, stationId, files, existing = [], onProgress }) {
  const uploaded = []
  const total = files.length
  let finished = 0
  if (onProgress) onProgress(0, total)

  try {
    const results = await runPool(files, CONCURRENCY, async (file) => {
      const { blob, width, height } = await prepareImage(file)
      const ext = EXT[blob.type] || 'webp'
      const path = `${stationId}/${wireframeId}/${crypto.randomUUID()}.${ext}`
      const { error } = await supabase.storage
        .from(BUCKET)
        .upload(path, blob, { contentType: blob.type, cacheControl: '3600' })
      if (error) throw error
      uploaded.push(path)
      finished += 1
      if (onProgress) onProgress(finished, total)
      return { path, width, height, name: baseName(file.name) }
    })

    let x = existing.length ? Math.max(...existing.map((s) => s.x + s.w)) + 80 : 0
    const y = existing.length ? Math.min(...existing.map((s) => s.y)) : 0
    let position = existing.length ? Math.max(...existing.map((s) => s.position)) + 1 : 0

    const rows = results.map((r) => {
      const w = Math.round(Math.min(r.width, r.width > r.height ? 640 : 360))
      const h = Math.round((w * r.height) / r.width)
      const row = {
        wireframe_id: wireframeId,
        station_id: stationId,
        name: r.name,
        image_path: r.path,
        x,
        y,
        w,
        h,
        position: position++,
      }
      x += w + 80
      return row
    })
    return await run(supabase.from('screens').insert(rows).select())
  } catch (err) {
    if (uploaded.length) {
      try { await removeFiles(uploaded) } catch { /* ignore */ }
    }
    throw err
  }
}

export async function createWireframe({ stationId, title, files, onProgress }) {
  // inserted first so a duplicate name fails before any image is uploaded
  const wf = await run(supabase.from('wireframes').insert({ station_id: stationId, title }).select().single())
  try {
    await addScreens({ wireframeId: wf.id, stationId, files, existing: [], onProgress })
  } catch (err) {
    await supabase.from('wireframes').delete().eq('id', wf.id)
    throw err
  }
  return wf
}

export async function deleteWireframe(id) {
  const shots = await run(supabase.from('screens').select('image_path').eq('wireframe_id', id))
  await run(supabase.from('wireframes').delete().eq('id', id))
  await removeFiles(shots.map((s) => s.image_path))
}

export const updateView = (id, v) =>
  run(supabase.from('wireframes').update({ view_x: v.x, view_y: v.y, view_zoom: v.zoom }).eq('id', id))

/* ---------- canvas data ---------- */
export const listIssues = (wireframeId) =>
  run(supabase.from('issues').select('*').eq('wireframe_id', wireframeId).order('created_at', { ascending: true }))

export async function fetchCanvas(id) {
  const [screens, links, issues] = await Promise.all([
    run(supabase.from('screens').select('*').eq('wireframe_id', id).order('position', { ascending: true })),
    run(supabase.from('links').select('*').eq('wireframe_id', id).order('created_at', { ascending: true })),
    listIssues(id),
  ])
  return { screens, links, issues }
}

export const updateScreen = (id, patch) => run(supabase.from('screens').update(patch).eq('id', id))

export async function deleteScreen(screen) {
  await run(supabase.from('screens').delete().eq('id', screen.id))
  await removeFiles([screen.image_path])
}

export const insertLink = (payload) => run(supabase.from('links').insert(payload).select().single())
export const updateLink = (id, patch) => run(supabase.from('links').update(patch).eq('id', id))
export const deleteLink = (id) => run(supabase.from('links').delete().eq('id', id))

export const insertIssue = (payload) => run(supabase.from('issues').insert(payload).select().single())
export const updateIssue = (id, patch) => run(supabase.from('issues').update(patch).eq('id', id))
export const deleteIssue = (id) => run(supabase.from('issues').delete().eq('id', id))