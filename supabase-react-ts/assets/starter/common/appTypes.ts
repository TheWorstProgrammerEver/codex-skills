export type MemberStatus = 'active' | 'invited'

export type TaskStatus = 'open' | 'done'

export type Member = {
  id: string
  accountId?: string
  name: string
  email: string
  status: MemberStatus
}

export type Invitation = {
  id: string
  workspaceId: string
  email: string
  invitedDate: string
}

export type PendingInvitation = Invitation & {
  workspaceName: string
}

export type Task = {
  id: string
  workspaceId: string
  title: string
  notes: string
  status: TaskStatus
  createdByAccountId?: string
  createdByName?: string
  createdDate: string
  updatedDate?: string
}

export type Workspace = {
  id: string
  name: string
  members: Member[]
  invitations: Invitation[]
  tasks: Task[]
  createdDate: string
}

export type TeamTasksState = {
  workspaces: Workspace[]
  pendingInvitations: PendingInvitation[]
  activeWorkspaceId?: string
}

export type TaskInput = {
  title: string
  notes?: string
  status?: TaskStatus
}
