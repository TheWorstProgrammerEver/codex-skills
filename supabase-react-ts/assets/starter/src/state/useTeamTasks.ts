import { useCallback, useEffect, useMemo, useState } from 'react'
import { type IRequest } from '../../lib/dispatch/dispatch'
import { useLoader } from '../../lib/hooks/useLoader'
import type { TeamTasksState, TaskInput } from '../../common/appTypes'
import { appDispatcher } from '../data/app/appDispatcher'
import {
  AcceptInvitationCommand,
  CreateTaskCommand,
  CreateWorkspaceCommand,
  DeleteTaskCommand,
  InviteMemberCommand,
  LoadAppQuery,
  RejectInvitationCommand,
  UpdateTaskCommand
} from '../data/app/requests'
import type { Account } from '../types/auth'
import {
  emptyTeamTasksState,
  withAcceptedInvitation,
  withCreatedWorkspace,
  withInvitation,
  withRejectedInvitation,
  withSavedTask,
  withoutTask
} from './teamTasksStateUpdates'

const errorMessage = (error: unknown) => (
  error instanceof Error ? error.message : 'App request failed.'
)

export const useTeamTasks = (currentAccount?: Account) => {
  const [state, setState] = useState<TeamTasksState>(emptyTeamTasksState)
  const appLoad = useLoader({ getErrorMessage: errorMessage })
  const appLoadState = useMemo(() => ({
    ...appLoad,
    busy: Boolean(currentAccount) && (!appLoad.settled || appLoad.busy)
  }), [appLoad, currentAccount])

  const reload = useCallback(async (activeWorkspaceId?: string) => {
    try {
      const nextState = await appLoad.execute(() => appDispatcher.dispatch(new LoadAppQuery({ activeWorkspaceId })))
      setState(nextState)

      return nextState
    } catch {
      setState(emptyTeamTasksState)

      return undefined
    }
  }, [appLoad.execute])

  useEffect(() => {
    if (!currentAccount) {
      setState(emptyTeamTasksState)
      appLoad.clearError()
      return
    }

    void reload()
  }, [appLoad.clearError, currentAccount, reload])

  const runAction = useCallback(async <TResult, TParams>(
    request: IRequest<TResult, TParams>,
    applyResult: (currentState: TeamTasksState, result: TResult) => TeamTasksState
  ) => {
    const result = await appDispatcher.dispatch(request)
    setState((currentState) => applyResult(currentState, result))

    return result
  }, [])

  const activeWorkspace = useMemo(
    () => state.workspaces.find((workspace) => workspace.id === state.activeWorkspaceId) ?? state.workspaces[0],
    [state.activeWorkspaceId, state.workspaces]
  )

  const createWorkspace = useCallback(async (name: string, inviteEmails: string[]) => {
    const result = await runAction(
      new CreateWorkspaceCommand({ name, inviteEmails }),
      withCreatedWorkspace
    )

    return result.workspace.id
  }, [runAction])

  const selectWorkspace = useCallback((workspaceId: string) => {
    setState((currentState) => ({ ...currentState, activeWorkspaceId: workspaceId }))
  }, [])

  const inviteMember = useCallback((workspaceId: string, email: string) => (
    runAction(new InviteMemberCommand({ workspaceId, email }), withInvitation)
  ), [runAction])

  const acceptInvitation = useCallback((invitationId: string) => (
    runAction(new AcceptInvitationCommand({ invitationId }), withAcceptedInvitation)
      .then((result) => reload(result.workspaceId))
  ), [reload, runAction])

  const rejectInvitation = useCallback((invitationId: string) => (
    runAction(new RejectInvitationCommand({ invitationId }), withRejectedInvitation)
  ), [runAction])

  const createTask = useCallback((workspaceId: string, input: TaskInput) => (
    runAction(new CreateTaskCommand({ workspaceId, input }), withSavedTask)
  ), [runAction])

  const updateTask = useCallback((workspaceId: string, taskId: string, input: TaskInput) => (
    runAction(new UpdateTaskCommand({ workspaceId, taskId, input }), withSavedTask)
  ), [runAction])

  const deleteTask = useCallback((workspaceId: string, taskId: string) => (
    runAction(new DeleteTaskCommand({ workspaceId, taskId }), withoutTask)
  ), [runAction])

  return {
    activeWorkspace,
    appLoad: appLoadState,
    createTask,
    createWorkspace,
    currentAccount,
    deleteTask,
    inviteMember,
    acceptInvitation,
    rejectInvitation,
    selectWorkspace,
    state,
    updateTask
  }
}
