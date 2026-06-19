import type { TeamTasksState, Task, Workspace } from '../../common/appTypes'
import type {
  AcceptInvitationResult,
  CreateWorkspaceResult,
  DeleteTaskResult,
  InviteMemberResult,
  RejectInvitationResult
} from '../data/app/requests'

export const emptyTeamTasksState: TeamTasksState = {
  workspaces: [],
  pendingInvitations: []
}

const updateWorkspace = (
  state: TeamTasksState,
  workspaceId: string,
  update: (workspace: Workspace) => Workspace
): TeamTasksState => ({
  ...state,
  workspaces: state.workspaces.map((workspace) => (
    workspace.id === workspaceId ? update(workspace) : workspace
  ))
})

export const withCreatedWorkspace = (
  state: TeamTasksState,
  result: CreateWorkspaceResult
): TeamTasksState => ({
  ...state,
  activeWorkspaceId: result.workspace.id,
  workspaces: [...state.workspaces, result.workspace]
})

export const withInvitation = (
  state: TeamTasksState,
  result: InviteMemberResult
) => updateWorkspace(state, result.workspaceId, (workspace) => ({
  ...workspace,
  invitations: [...workspace.invitations, result.invitation],
  members: workspace.members.some((member) => member.id === result.member.id)
    ? workspace.members
    : [...workspace.members, result.member]
}))

export const withAcceptedInvitation = (
  state: TeamTasksState,
  result: AcceptInvitationResult
): TeamTasksState => ({
  ...state,
  pendingInvitations: state.pendingInvitations.filter((invitation) => invitation.id !== result.invitationId)
})

export const withRejectedInvitation = (
  state: TeamTasksState,
  result: RejectInvitationResult
): TeamTasksState => ({
  ...state,
  pendingInvitations: state.pendingInvitations.filter((invitation) => invitation.id !== result.invitationId)
})

export const withSavedTask = (state: TeamTasksState, task: Task) => (
  updateWorkspace(state, task.workspaceId, (workspace) => ({
    ...workspace,
    tasks: workspace.tasks.some((existingTask) => existingTask.id === task.id)
      ? workspace.tasks.map((existingTask) => existingTask.id === task.id ? task : existingTask)
      : [...workspace.tasks, task]
  }))
)

export const withoutTask = (state: TeamTasksState, result: DeleteTaskResult) => (
  updateWorkspace(state, result.workspaceId, (workspace) => ({
    ...workspace,
    tasks: workspace.tasks.filter((task) => task.id !== result.taskId)
  }))
)
