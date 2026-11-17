export const ROLES = [
  { value: 'viewer', label: 'Viewer', hint: 'Can view' },
  { value: 'commenter', label: 'Commenter', hint: 'Can view and give feedback' },
  { value: 'editor', label: 'Editor', hint: 'Can view and edit' },
]

const LABELS = { owner: 'Owner', editor: 'Can edit', commenter: 'Can comment', viewer: 'Can view' }

export const roleLabel = (role) => LABELS[role] || 'No access'
export const canEdit = (role) => role === 'owner' || role === 'editor'
export const canComment = (role) => canEdit(role) || role === 'commenter'