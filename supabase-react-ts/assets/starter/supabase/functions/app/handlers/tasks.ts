import { appRequestIdentifiers } from '../../../../common/appRequestIdentifiers.ts'
import type { TaskInput } from '../../../../common/appTypes.ts'
import { HttpError, todayIso, trimOrDefault } from '../helpers.ts'
import { taskFromRow } from '../mappers.ts'
import { getProfile } from '../profile.ts'
import type { TaskRow } from '../types/rows.ts'
import { createAppRequestHandlerFactory } from './handlerFactory.ts'

type TaskParams = {
  workspaceId: string
  input: TaskInput
}

type UpdateTaskParams = TaskParams & {
  taskId: string
}

type DeleteTaskParams = {
  workspaceId: string
  taskId: string
}

const taskColumns = 'id, workspace_id, title, notes, status, created_by_profile_id, created_by_name, created_date, updated_date'

export const createTaskHandler = createAppRequestHandlerFactory(appRequestIdentifiers.createTask, ({ client, user }) =>
  async (request) => {
    const { workspaceId, input } = request.params as TaskParams

    if (!workspaceId || !input.title?.trim()) {
      throw new HttpError(400, 'Tasks need a workspace and title.')
    }

    const profile = await getProfile(client, user)
    const task: TaskRow = {
      id: crypto.randomUUID(),
      workspace_id: workspaceId,
      title: input.title.trim(),
      notes: input.notes?.trim() ?? '',
      status: input.status ?? 'open',
      created_by_profile_id: profile.id,
      created_by_name: profile.display_name,
      created_date: todayIso()
    }
    const { error } = await client.from('tasks').insert(task)

    if (error) {
      throw error
    }

    return taskFromRow(task)
  })

export const createUpdateTaskHandler = createAppRequestHandlerFactory(appRequestIdentifiers.updateTask, ({ client }) =>
  async (request) => {
    const { workspaceId, taskId, input } = request.params as UpdateTaskParams

    if (!workspaceId || !taskId || !input.title?.trim()) {
      throw new HttpError(400, 'Choose a task and title.')
    }

    const { data, error } = await client
      .from('tasks')
      .update({
        title: trimOrDefault(input.title, 'Untitled task'),
        notes: input.notes?.trim() ?? '',
        status: input.status ?? 'open',
        updated_date: todayIso()
      })
      .eq('id', taskId)
      .eq('workspace_id', workspaceId)
      .select(taskColumns)
      .maybeSingle<TaskRow>()

    if (error) {
      throw error
    }

    if (!data) {
      throw new HttpError(404, 'Task not found.')
    }

    return taskFromRow(data)
  })

export const createDeleteTaskHandler = createAppRequestHandlerFactory(appRequestIdentifiers.deleteTask, ({ client }) =>
  async (request) => {
    const { workspaceId, taskId } = request.params as DeleteTaskParams

    if (!workspaceId || !taskId) {
      throw new HttpError(400, 'Choose a task to delete.')
    }

    const { error } = await client
      .from('tasks')
      .delete()
      .eq('id', taskId)
      .eq('workspace_id', workspaceId)

    if (error) {
      throw error
    }

    return { workspaceId, taskId }
  })
