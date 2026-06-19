import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useLoader } from '../../../lib/hooks/useLoader'
import type { Task, TaskInput } from '../../../common/appTypes'
import { useTeamTasksContext } from '../../contexts/TeamTasksContext'
import { sortTasks } from '../../domain/tasks'

export const useWorkspaceScreenViewModel = () => {
  const { workspaceId } = useParams()
  const navigate = useNavigate()
  const [inviteOpen, setInviteOpen] = useState(false)
  const [taskOpen, setTaskOpen] = useState(false)
  const inviteLoader = useLoader()
  const taskLoader = useLoader()
  const {
    appLoad,
    createTask,
    deleteTask,
    inviteMember,
    selectWorkspace,
    state,
    updateTask
  } = useTeamTasksContext()
  const workspace = state.workspaces.find((candidate) => candidate.id === workspaceId)

  useEffect(() => {
    if (workspaceId) {
      selectWorkspace(workspaceId)
    }
  }, [selectWorkspace, workspaceId])

  const submitInvite = async (email: string) => {
    if (!workspaceId) {
      return
    }

    await inviteLoader.execute(() => inviteMember(workspaceId, email))
    setInviteOpen(false)
  }

  const submitTask = async (input: TaskInput) => {
    if (!workspaceId) {
      return
    }

    await taskLoader.execute(() => createTask(workspaceId, input))
    setTaskOpen(false)
  }

  const toggleTask = (task: Task) => {
    void updateTask(task.workspaceId, task.id, {
      title: task.title,
      notes: task.notes,
      status: task.status === 'done' ? 'open' : 'done'
    })
  }

  const removeTask = (taskId: string) => {
    if (workspaceId && window.confirm('Delete this task?')) {
      void deleteTask(workspaceId, taskId)
    }
  }

  return {
    appLoad,
    goToWorkspaces: () => navigate('/workspaces/manage'),
    inviteLoader,
    inviteOpen,
    setInviteOpen,
    setTaskOpen,
    submitInvite,
    submitTask,
    taskLoader,
    taskOpen,
    tasks: useMemo(() => sortTasks(workspace?.tasks ?? []), [workspace?.tasks]),
    toggleTask,
    removeTask,
    workspace
  }
}
