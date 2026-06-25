import { Check, RotateCcw, Trash2 } from 'lucide-react'
import type { Task } from '../../../common/appTypes'
import { Button } from '../../../lib/ui/Button/Button'
import { ComponentRoleContext } from '../../../lib/ui/ComponentRoleContext/ComponentRoleContext'
import { List, ListItem } from '../../../lib/ui/List/List'
import { ResponsiveContent } from '../../../lib/ui/ResponsiveContent/ResponsiveContent'
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
              <ComponentRoleContext role="tertiary">
                <Button type="button" onClick={() => onToggle(task)}>
                  <ResponsiveContent icon={task.status === 'done' ? <RotateCcw /> : <Check />}>
                    {task.status === 'done' ? 'Reopen' : 'Done'}
                  </ResponsiveContent>
                </Button>
              </ComponentRoleContext>
              <ComponentRoleContext role="destructive">
                <Button type="button" onClick={() => onDelete(task.id)}>
                  <ResponsiveContent icon={<Trash2 />}>Delete</ResponsiveContent>
                </Button>
              </ComponentRoleContext>
            </>
          )}
        />
      ))}
    </List>
  )
}
