import type { Task } from '../../../common/appTypes'
import { List, ListItem } from '../../../lib/ui/List/List'
import { taskStatusLabel } from '../../domain/tasks'
import styles from './TaskList.module.scss'

type TaskListProps = {
  tasks: Task[]
  onDelete: (taskId: string) => void
  onToggle: (task: Task) => void
}

export const TaskList = ({ onDelete, onToggle, tasks }: TaskListProps) => {
  if (tasks.length === 0) {
    return <p className={styles.empty}>No tasks yet.</p>
  }

  return (
    <List ariaLabel="Tasks">
      {tasks.map((task) => (
        <ListItem
          key={task.id}
          details={(
            <span className={styles.details}>
              <strong>{task.title}</strong>
              {task.notes && <span>{task.notes}</span>}
              <small>{taskStatusLabel(task.status)} by {task.createdByName ?? 'Unknown'}</small>
            </span>
          )}
          actions={(
            <>
              <button type="button" onClick={() => onToggle(task)}>
                {task.status === 'done' ? 'Reopen' : 'Done'}
              </button>
              <button type="button" onClick={() => onDelete(task.id)}>Delete</button>
            </>
          )}
        />
      ))}
    </List>
  )
}
