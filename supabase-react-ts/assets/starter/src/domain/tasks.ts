import type { Task } from '../../common/appTypes'

export const taskStatusLabel = (status: Task['status']) => (
  status === 'done' ? 'Done' : 'Open'
)

export const openTaskCount = (tasks: Task[]) => (
  tasks.filter((task) => task.status === 'open').length
)

export const sortTasks = (tasks: Task[]) => (
  [...tasks].sort((left, right) => {
    if (left.status !== right.status) {
      return left.status === 'open' ? -1 : 1
    }

    return left.createdDate.localeCompare(right.createdDate)
  })
)
