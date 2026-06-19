import type { Invitation, Member, Task, Workspace } from '../../../common/appTypes.ts'
import type { InvitationRow, MemberRow, TaskRow, WorkspaceRow } from './types/rows.ts'

export const memberFromRow = (row: MemberRow): Member => ({
  id: row.id,
  accountId: row.profile_id ?? undefined,
  name: row.name,
  email: row.email,
  status: row.status
})

export const invitationFromRow = (row: InvitationRow): Invitation => ({
  id: row.id,
  workspaceId: row.workspace_id,
  email: row.email,
  invitedDate: row.invited_date
})

export const taskFromRow = (row: TaskRow): Task => ({
  id: row.id,
  workspaceId: row.workspace_id,
  title: row.title,
  notes: row.notes,
  status: row.status,
  createdByAccountId: row.created_by_profile_id ?? undefined,
  createdByName: row.created_by_name ?? undefined,
  createdDate: row.created_date,
  updatedDate: row.updated_date ?? undefined
})

export const workspaceFromRows = (
  row: WorkspaceRow,
  members: MemberRow[],
  invitations: InvitationRow[],
  tasks: TaskRow[]
): Workspace => ({
  id: row.id,
  name: row.name,
  createdDate: row.created_date,
  members: members.map(memberFromRow),
  invitations: invitations.map(invitationFromRow),
  tasks: tasks.map(taskFromRow)
})
