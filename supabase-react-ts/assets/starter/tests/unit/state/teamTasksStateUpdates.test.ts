import { describe, expect, it } from 'vitest'
import type { Task, TeamTasksState, Workspace } from '../../../common/appTypes'
import {
  withCreatedWorkspace,
  withSavedTask,
  withoutTask
} from '../../../src/state/teamTasksStateUpdates'

const workspace: Workspace = {
  id: 'workspace-1',
  name: 'Starter',
  createdDate: '2026-06-19',
  members: [],
  invitations: [],
  tasks: []
}

const state: TeamTasksState = {
  activeWorkspaceId: 'workspace-1',
  pendingInvitations: [],
  workspaces: [workspace]
}

const task: Task = {
  id: 'task-1',
  workspaceId: 'workspace-1',
  title: 'Ship starter',
  notes: '',
  status: 'open',
  createdDate: '2026-06-19'
}

describe('team task state updates', () => {
  it('adds newly created workspaces and selects them', () => {
    const nextState = withCreatedWorkspace({ workspaces: [], pendingInvitations: [] }, { workspace })

    expect(nextState.activeWorkspaceId).toBe(workspace.id)
    expect(nextState.workspaces).toEqual([workspace])
  })

  it('adds and replaces tasks', () => {
    const withTask = withSavedTask(state, task)
    const updatedTask = { ...task, title: 'Ship better starter', status: 'done' as const }
    const updatedState = withSavedTask(withTask, updatedTask)

    expect(updatedState.workspaces[0].tasks).toEqual([updatedTask])
  })

  it('removes deleted tasks', () => {
    const withTask = withSavedTask(state, task)
    const nextState = withoutTask(withTask, { workspaceId: workspace.id, taskId: task.id })

    expect(nextState.workspaces[0].tasks).toEqual([])
  })
})
