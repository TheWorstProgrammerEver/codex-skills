import { Check, RotateCcw, Trash2 } from 'lucide-react'
import type { Task } from '../../../common/appTypes'
import { ComponentRoleContext } from '../../../lib/ui/ComponentRoleContext/ComponentRoleContext'
import { List, ListItem } from '../../../lib/ui/List/List'
import { ResponsiveButton } from '../../../lib/ui/ResponsiveButton/ResponsiveButton'
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
          actionsLabel={`${task.title} actions`}
          details={(
            <span className={styles.details}>
              <strong>{task.title}</strong>
              {task.notes && <span>{task.notes}</span>}
              <small>{taskStatusLabel(task.status)} by {task.createdByName ?? 'Unknown'}</small>
            </span>
          )}
          actions={(
            <>
              <ComponentRoleContext role="tertiary">
                <ResponsiveButton
                  type="button"
                  icon={task.status === 'done' ? <RotateCcw /> : <Check />}
                  label={task.status === 'done' ? 'Reopen' : 'Done'}
                  onClick={() => onToggle(task)}
                />
              </ComponentRoleContext>
              <ComponentRoleContext role="destructive">
                <ResponsiveButton
                  type="button"
                  icon={<Trash2 />}
                  label="Delete"
                  onClick={() => onDelete(task.id)}
                />
              </ComponentRoleContext>
            </>
          )}
        />
      ))}
    </List>
  )
}
