import { supabase } from './supabase.js'
import { prepareImage } from './image.js'
import { baseName } from './format.js'

export const SCREEN_BUCKET = 'screens'
export const COMMENT_BUCKET = 'comment-images'
export const MAX_PAGES = 60
const URL_TTL = 2 * 60 * 60
const CONCURRENCY = 3
const PAGE = 1000
const SCREEN_MAX_UPLOAD = 10 * 1024 * 1024
const EXT = { 'image/webp': 'webp', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif' }
const urlCache = new Map()
let bootPromise = null

export function friendly(err) {
  const msg = (err && err.message) || String(err || '')
  if (/wireframes_station_title_key/.test(msg)) return 'You already have a wireframe with that name. Choose a different name.'
  if (/wireframes_code_key/.test(msg)) return 'Could not create a unique code. Please try again.'
  if (/code_not_found/.test(msg)) return 'No wireframe matches that code.'
  if (/access_blocked/.test(msg)) return 'The owner has removed your access to this wireframe.'
  if (/rate_limited/.test(msg)) return 'You are doing that too quickly. Wait a moment and try again.'
  const lim = msg.match(/limit_reached: (.+)/)
  if (lim) return lim[1]
  if (/inconsistent_reference|screens_size|links_coords|issues_pin/.test(msg)) return 'That change was rejected because the data was not valid.'
  if (/anonymous/i.test(msg) && /disabled|not enabled/i.test(msg)) {
    return 'Anonymous sign-ins are disabled. Enable them in Supabase under Authentication, Sign In / Providers.'
  }
  if (/rate limit/i.test(msg) && /email/i.test(msg)) return 'Too many emails were requested. Wait a few minutes and try again.'
  if (/signups not allowed|user not found/i.test(msg)) return 'No account uses that email. Link your email on your original device first.'
  if (/Failed to fetch|NetworkError|Load failed/i.test(msg)) return 'Network problem. Check your connection and try again.'
  if (/row-level security|permission denied|not_allowed/i.test(msg)) return 'You do not have permission to do that.'
  return msg || 'Something went wrong.'
}

async function run(query) {
  const { data, error } = await query
  if (error) throw error
  return data
}

// Reads every row, one page at a time, so the 1000-row server cap never hides data.
async function fetchAll(build) {
  const out = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build().range(from, from + PAGE - 1)
    if (error) throw error
    out.push(...data)
    if (data.length < PAGE) break
  }
  return out
}

/* ---------- session and account ---------- */
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

export async function linkEmail(email) {
  const { error } = await supabase.auth.updateUser({ email }, { emailRedirectTo: window.location.origin })
  if (error) throw error
}

export async function signInWithEmail(email) {
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: false, emailRedirectTo: window.location.origin },
  })
  if (error) throw error
}

export async function signOut() {
  const { error } = await supabase.auth.signOut()
  if (error) throw error
}

/* ---------- signed image urls ---------- */
export async function signPaths(paths, bucket = SCREEN_BUCKET, force = false) {
  const now = Date.now()
  const key = (p) => `${bucket}/${p}`
  const need = [...new Set(paths)].filter((p) => {
    const c = urlCache.get(key(p))
    return force || !c || c.exp < now + 60000
  })
  if (need.length) {
    const { data, error } = await supabase.storage.from(bucket).createSignedUrls(need, URL_TTL)
    if (error) throw error
    data.forEach((d) => {
      if (d.signedUrl) urlCache.set(key(d.path), { url: d.signedUrl, exp: now + URL_TTL * 1000 })
    })
  }
  return Object.fromEntries(paths.map((p) => [p, (urlCache.get(key(p)) || {}).url || null]))
}

async function removeFiles(paths, bucket = SCREEN_BUCKET) {
  for (let i = 0; i < paths.length; i += 100) {
    const { error } = await supabase.storage.from(bucket).remove(paths.slice(i, i + 100))
    if (error) throw error
  }
}

/* ---------- guaranteed file cleanup ----------
   Deleting a page or reply queues its file in storage_trash (a database trigger).
   The owner's app empties the queue, so files are removed even if a reviewer did the delete
   or the browser closed halfway through. */
async function sweepOnce() {
  const rows = await run(supabase.from('storage_trash').select('id,bucket,path').order('id', { ascending: true }).limit(200))
  if (!rows.length) return 0
  const byBucket = {}
  rows.forEach((r) => { (byBucket[r.bucket] = byBucket[r.bucket] || []).push(r.path) })
  for (const [bucket, paths] of Object.entries(byBucket)) {
    const { error } = await supabase.storage.from(bucket).remove(paths)
    if (error) throw error
  }
  await run(supabase.from('storage_trash').delete().in('id', rows.map((r) => r.id)))
  return rows.length
}

export async function sweepTrash() {
  try {
    for (let i = 0; i < 20; i++) {
      if ((await sweepOnce()) < 200) break
    }
  } catch {
    /* tried again next time */
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

/* ---------- reviewers, unread ---------- */
export const listReviewers = (wireframeId) => run(supabase.rpc('list_reviewers', { p_id: wireframeId }))
export const setReviewerAccess = (wireframeId, userId, allow) =>
  run(supabase.rpc('set_reviewer_access', { p_id: wireframeId, p_user: userId, p_allow: allow }))
export const listUnread = () => run(supabase.rpc('unread_issues'))
export const markRead = (issueId) => run(supabase.rpc('mark_issue_read', { p_issue: issueId }))

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

export const renameWireframe = (id, title) =>
  run(supabase.from('wireframes').update({ title }).eq('id', id).select('id,title').single())

export async function addScreens({ wireframeId, stationId, files, existing = [], onProgress }) {
  if (existing.length + files.length > MAX_PAGES) {
    throw new Error(`A wireframe can have at most ${MAX_PAGES} pages.`)
  }
  const uploaded = []
  const total = files.length
  let finished = 0
  if (onProgress) onProgress(0, total)

  try {
    const results = await runPool(files, CONCURRENCY, async (file) => {
      const { blob, width, height } = await prepareImage(file, { maxUploadBytes: SCREEN_MAX_UPLOAD })
      const ext = EXT[blob.type] || 'webp'
      const path = `${stationId}/${wireframeId}/${crypto.randomUUID()}.${ext}`
      const { error } = await supabase.storage
        .from(SCREEN_BUCKET)
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
      const h = Math.max(1, Math.round((w * r.height) / r.width))
      const row = { wireframe_id: wireframeId, station_id: stationId, name: r.name, image_path: r.path, x, y, w, h, position: position++ }
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
  await run(supabase.from('wireframes').delete().eq('id', id))
  await sweepTrash()
}

export const updateView = (id, v) =>
  run(supabase.from('wireframes').update({ view_x: v.x, view_y: v.y, view_zoom: v.zoom }).eq('id', id))

/* ---------- canvas data ---------- */
export const listIssues = (wireframeId) =>
  fetchAll(() =>
    supabase.from('issues').select('*').eq('wireframe_id', wireframeId).order('created_at', { ascending: true }).order('id')
  )

export async function fetchDiscussion(wireframeId) {
  const [comments, reactions] = await Promise.all([
    fetchAll(() =>
      supabase.from('issue_comments').select('*').eq('wireframe_id', wireframeId).order('created_at', { ascending: true }).order('id')
    ),
    fetchAll(() =>
      supabase.from('reactions').select('id,issue_id,comment_id,user_id,emoji').eq('wireframe_id', wireframeId).order('id')
    ),
  ])
  return { comments, reactions }
}

export async function fetchCanvas(id) {
  const [screens, links, issues, discussion] = await Promise.all([
    fetchAll(() => supabase.from('screens').select('*').eq('wireframe_id', id).order('position', { ascending: true }).order('id')),
    fetchAll(() => supabase.from('links').select('*').eq('wireframe_id', id).order('created_at', { ascending: true }).order('id')),
    listIssues(id),
    fetchDiscussion(id),
  ])
  return { screens, links, issues, comments: discussion.comments, reactions: discussion.reactions }
}

export const updateScreen = (id, patch) => run(supabase.from('screens').update(patch).eq('id', id))

export async function deleteScreen(screen) {
  await run(supabase.from('screens').delete().eq('id', screen.id))
  await sweepTrash()
}

export const insertLink = (payload) => run(supabase.from('links').insert(payload).select().single())
export const updateLink = (id, patch) => run(supabase.from('links').update(patch).eq('id', id))
export const deleteLink = (id) => run(supabase.from('links').delete().eq('id', id))

export const insertIssue = (payload) => run(supabase.from('issues').insert(payload).select().single())
export const updateIssue = (id, patch) => run(supabase.from('issues').update(patch).eq('id', id))

export async function deleteIssue(id) {
  await run(supabase.from('issues').delete().eq('id', id))
  await sweepTrash()
}

/* ---------- replies and reactions ---------- */
export async function postComment({ issue, parentId, name, body, file }) {
  let path = null
  if (file) {
    const { blob } = await prepareImage(file, { maxUploadBytes: 5 * 1024 * 1024 })
    const ext = EXT[blob.type] || 'webp'
    path = `${issue.station_id}/${issue.wireframe_id}/${crypto.randomUUID()}.${ext}`
    const { error } = await supabase.storage
      .from(COMMENT_BUCKET)
      .upload(path, blob, { contentType: blob.type, cacheControl: '3600' })
    if (error) throw error
  }
  try {
    return await run(
      supabase
        .from('issue_comments')
        .insert({
          issue_id: issue.id,
          wireframe_id: issue.wireframe_id,
          station_id: issue.station_id,
          parent_id: parentId || null,
          author_name: name,
          body,
          image_path: path,
        })
        .select()
        .single()
    )
  } catch (err) {
    if (path) {
      try { await removeFiles([path], COMMENT_BUCKET) } catch { /* ignore */ }
    }
    throw err
  }
}

export const editComment = (id, body) =>
  run(supabase.from('issue_comments').update({ body }).eq('id', id).select('id,body,edited_at').single())

export async function deleteComment(rootId) {
  await run(supabase.from('issue_comments').delete().eq('id', rootId))
  await sweepTrash()
}

const REACTION_COLUMNS = 'id,issue_id,comment_id,user_id,emoji'

export const addReaction = ({ issue, commentId, emoji }) =>
  run(
    supabase
      .from('reactions')
      .insert({ issue_id: issue.id, comment_id: commentId || null, wireframe_id: issue.wireframe_id, emoji })
      .select(REACTION_COLUMNS)
      .single()
  )

export async function removeReaction({ issueId, commentId, emoji, userId }) {
  let q = supabase.from('reactions').delete().eq('user_id', userId).eq('issue_id', issueId).eq('emoji', emoji)
  q = commentId ? q.eq('comment_id', commentId) : q.is('comment_id', null)
  await run(q)
}

/* ---------- erase everything this identity owns or wrote ---------- */
export async function wipeWorkspace(stationId, userId) {
  const works = await run(supabase.from('wireframes').select('id').eq('station_id', stationId))
  for (const w of works) await run(supabase.from('wireframes').delete().eq('id', w.id))
  await sweepTrash()
  await run(supabase.from('reactions').delete().eq('user_id', userId))
  await run(supabase.from('issue_comments').delete().eq('author_id', userId))
  await run(supabase.from('issues').delete().eq('author_id', userId))
  await run(supabase.from('wireframe_access').delete().eq('user_id', userId))
  await run(supabase.from('stations').update({ display_name: null }).eq('id', stationId))
}