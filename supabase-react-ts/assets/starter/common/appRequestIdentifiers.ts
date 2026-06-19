export const appRequestIdentifiers = {
  acceptInvitation: 'acceptInvitation',
  createTask: 'createTask',
  createWorkspace: 'createWorkspace',
  deleteTask: 'deleteTask',
  inviteMember: 'inviteMember',
  load: 'load',
  rejectInvitation: 'rejectInvitation',
  updateTask: 'updateTask'
} as const

export const appRequestNames = Object.values(appRequestIdentifiers)

export type AppRequestIdentifier = typeof appRequestNames[number]
