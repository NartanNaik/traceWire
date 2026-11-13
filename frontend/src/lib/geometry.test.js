import { describe, expect, it } from 'vitest'
import { clamp, hitScreen, wirePath } from './geometry.js'

describe('clamp', () => {
  it('limits a value to a range', () => {
    expect(clamp(5, 0, 1)).toBe(1)
    expect(clamp(-2, 0, 1)).toBe(0)
    expect(clamp(0.4, 0, 1)).toBe(0.4)
  })
})

describe('hitScreen', () => {
  const screens = [
    { id: 'a', x: 0, y: 0, w: 100, h: 100 },
    { id: 'b', x: 50, y: 50, w: 100, h: 100 },
  ]
  it('returns the topmost screen', () => {
    expect(hitScreen(screens, 60, 60).id).toBe('b')
  })
  it('can exclude a screen', () => {
    expect(hitScreen(screens, 60, 60, 'b').id).toBe('a')
  })
  it('returns null on empty space', () => {
    expect(hitScreen(screens, 500, 500)).toBeNull()
  })
})

describe('wirePath', () => {
  it('starts and ends at the given points', () => {
    const { d } = wirePath(0, 0, 200, 100)
    expect(d.startsWith('M 0 0')).toBe(true)
    expect(d.endsWith('200 100')).toBe(true)
  })
  it('points right for a left-to-right wire', () => {
    expect(Math.abs(wirePath(0, 0, 200, 0).angle)).toBeLessThan(1)
  })
})