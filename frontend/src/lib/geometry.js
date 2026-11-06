export const clamp = (v, min, max) => Math.min(max, Math.max(min, v))

// Topmost screen under a world point. Screens later in the array sit on top.
export function hitScreen(screens, wx, wy, excludeId) {
  for (let i = screens.length - 1; i >= 0; i--) {
    const s = screens[i]
    if (s.id === excludeId) continue
    if (wx >= s.x && wx <= s.x + s.w && wy >= s.y && wy <= s.y + s.h) return s
  }
  return null
}

// Cubic bezier between two points, plus the arrow angle and midpoint.
export function wirePath(sx, sy, ex, ey) {
  const dir = ex >= sx ? 1 : -1
  const dx = Math.max(70, Math.abs(ex - sx) * 0.5)
  const c1x = sx + dir * dx
  const c1y = sy
  const c2x = ex - dir * dx
  const c2y = ey
  return {
    d: `M ${sx} ${sy} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${ex} ${ey}`,
    angle: (Math.atan2(ey - c2y, ex - c2x) * 180) / Math.PI,
    mid: { x: (sx + 3 * c1x + 3 * c2x + ex) / 8, y: (sy + 3 * c1y + 3 * c2y + ey) / 8 },
  }
}