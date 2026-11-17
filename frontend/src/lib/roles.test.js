import { describe, expect, it } from 'vitest'
import { canComment, canEdit, roleLabel } from './roles.js'

describe('roles', () => {
  it('lets owners, administrators and editors edit', () => {
    expect(canEdit('owner')).toBe(true)
    expect(canEdit('admin')).toBe(true)
    expect(canEdit('editor')).toBe(true)
    expect(canEdit('commenter')).toBe(false)
    expect(canEdit('viewer')).toBe(false)
    expect(canEdit(null)).toBe(false)
  })

  it('lets everyone except viewers comment', () => {
    expect(canComment('owner')).toBe(true)
    expect(canComment('admin')).toBe(true)
    expect(canComment('editor')).toBe(true)
    expect(canComment('commenter')).toBe(true)
    expect(canComment('viewer')).toBe(false)
    expect(canComment(undefined)).toBe(false)
  })

  it('has readable labels', () => {
    expect(roleLabel('editor')).toBe('Can edit')
    expect(roleLabel('admin')).toBe('Administrator')
    expect(roleLabel('nope')).toBe('No access')
  })
})