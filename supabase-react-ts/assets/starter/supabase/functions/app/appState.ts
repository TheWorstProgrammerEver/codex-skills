import type { SupabaseClient } from 'npm:@supabase/supabase-js@^2'
import type { PendingInvitation, TeamTasksState } from '../../../common/appTypes.ts'
import { workspaceFromRows } from './mappers.ts'
import type { InvitationRow, MemberRow, TaskRow, WorkspaceRow } from './types/rows.ts'

const workspaceColumns = 'id, name, created_by_profile_id, created_date'
const memberColumns = 'id, workspace_id, profile_id, name, email, status'
const invitationColumns = 'id, workspace_id, workspace_name, email, invited_date'
const taskColumns = 'id, workspace_id, title, notes, status, created_by_profile_id, created_by_name, created_date, updated_date'

const selectRows = async <TRow>(client: SupabaseClient, table: string, columns: string) => {
  const { data, error } = await client
    .from(table)
    .select(columns)

  if (error) {
    throw error
  }

  return (data ?? []) as TRow[]
}

export const loadState = async (
  client: SupabaseClient,
  activeWorkspaceId?: string
): Promise<TeamTasksState> => {
  const workspaces = await selectRows<WorkspaceRow>(client, 'workspaces', workspaceColumns)
  const members = await selectRows<MemberRow>(client, 'workspace_members', memberColumns)
  const invitations = await selectRows<InvitationRow>(client, 'workspace_invitations', invitationColumns)
  const tasks = await selectRows<TaskRow>(client, 'tasks', taskColumns)
  const activeWorkspaceIds = new Set(workspaces.map((workspace) => workspace.id))
  const pendingInvitations: PendingInvitation[] = invitations
    .filter((invitation) => !activeWorkspaceIds.has(invitation.workspace_id))
    .map((invitation) => ({
      id: invitation.id,
      workspaceId: invitation.workspace_id,
      workspaceName: invitation.workspace_name,
      email: invitation.email,
      invitedDate: invitation.invited_date
    }))

  return {
    activeWorkspaceId,
    pendingInvitations,
    workspaces: workspaces.map((workspace) => workspaceFromRows(
      workspace,
      members.filter((member) => member.workspace_id === workspace.id),
      invitations.filter((invitation) => invitation.workspace_id === workspace.id),
      tasks.filter((task) => task.workspace_id === workspace.id)
    ))
  }
}
