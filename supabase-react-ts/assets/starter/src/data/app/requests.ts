import { createCommandType, createQueryType } from '../../../lib/dispatch/dispatch'
import { appRequestIdentifiers } from '../../../common/appRequestIdentifiers'
import type {
  Invitation,
  Member,
  Task,
  TaskInput,
  TeamTasksState,
  Workspace
} from '../../../common/appTypes'

export type LoadAppParams = {
  activeWorkspaceId?: string
}

export type CreateWorkspaceParams = {
  name: string
  inviteEmails: string[]
}

export type WorkspaceIdParams = {
  workspaceId: string
}

export type InviteMemberParams = WorkspaceIdParams & {
  email: string
}

export type InvitationParams = {
  invitationId: string
}

export type TaskParams = WorkspaceIdParams & {
  input: TaskInput
}

export type UpdateTaskParams = TaskParams & {
  taskId: string
}

export type DeleteTaskParams = WorkspaceIdParams & {
  taskId: string
}

export type CreateWorkspaceResult = {
  workspace: Workspace
}

export type InviteMemberResult = {
  workspaceId: string
  member: Member
  invitation: Invitation
}

export type AcceptInvitationResult = {
  workspaceId: string
  member: Member
  invitationId: string
}

export type RejectInvitationResult = {
  workspaceId: string
  invitationId: string
}

export type DeleteTaskResult = {
  workspaceId: string
  taskId: string
}

export const LoadAppQuery = createQueryType(appRequestIdentifiers.load)<TeamTasksState, LoadAppParams>()
export const CreateWorkspaceCommand = createCommandType(appRequestIdentifiers.createWorkspace)<CreateWorkspaceResult, CreateWorkspaceParams>()
export const InviteMemberCommand = createCommandType(appRequestIdentifiers.inviteMember)<InviteMemberResult, InviteMemberParams>()
export const AcceptInvitationCommand = createCommandType(appRequestIdentifiers.acceptInvitation)<AcceptInvitationResult, InvitationParams>()
export const RejectInvitationCommand = createCommandType(appRequestIdentifiers.rejectInvitation)<RejectInvitationResult, InvitationParams>()
export const CreateTaskCommand = createCommandType(appRequestIdentifiers.createTask)<Task, TaskParams>()
export const UpdateTaskCommand = createCommandType(appRequestIdentifiers.updateTask)<Task, UpdateTaskParams>()
export const DeleteTaskCommand = createCommandType(appRequestIdentifiers.deleteTask)<DeleteTaskResult, DeleteTaskParams>()

export const appRequestTypes = [
  LoadAppQuery,
  CreateWorkspaceCommand,
  InviteMemberCommand,
  AcceptInvitationCommand,
  RejectInvitationCommand,
  CreateTaskCommand,
  UpdateTaskCommand,
  DeleteTaskCommand
]
