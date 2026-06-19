import { type FormEvent, useState } from 'react'
import type { TaskInput } from '../../../common/appTypes'
import type { LoaderState } from '../../../lib/hooks/useLoader'
import { AsynchronousSubmitButton } from '../../../lib/ui/AsynchronousSubmitButton/AsynchronousSubmitButton'
import styles from './TaskForm.module.scss'

type TaskFormProps = {
  loader: LoaderState
  onSubmit: (input: TaskInput) => void | Promise<void>
}

export const TaskForm = ({ loader, onSubmit }: TaskFormProps) => {
  const [title, setTitle] = useState('')
  const [notes, setNotes] = useState('')

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    await onSubmit({ title, notes })
    setTitle('')
    setNotes('')
  }

  return (
    <form className={styles.form} onSubmit={submit}>
      <label>
        Title
        <input required value={title} onChange={(event) => setTitle(event.target.value)} />
      </label>

      <label>
        Notes
        <textarea rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} />
      </label>

      {loader.error && <p className={styles.error} role="alert">{loader.error}</p>}

      <AsynchronousSubmitButton loader={loader}>Add task</AsynchronousSubmitButton>
    </form>
  )
}
