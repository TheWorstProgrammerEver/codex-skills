import { type FormEvent, useState } from 'react'
import type { LoaderState } from '../../../lib/hooks/useLoader'
import { AsynchronousSubmitButton } from '../../../lib/ui/AsynchronousSubmitButton/AsynchronousSubmitButton'
import { ComponentRoleContext } from '../../../lib/ui/ComponentRoleContext/ComponentRoleContext'
import { FormGrid } from '../../../lib/ui/FormGrid/FormGrid'
import styles from './WorkspaceForm.module.scss'

type WorkspaceFormProps = {
  loader: LoaderState
  onSubmit: (name: string, inviteEmails: string[]) => void | Promise<void>
}

const parseEmails = (value: string) => (
  value
    .split(',')
    .map((email) => email.trim())
    .filter(Boolean)
)

export const WorkspaceForm = ({ loader, onSubmit }: WorkspaceFormProps) => {
  const [name, setName] = useState('')
  const [inviteEmails, setInviteEmails] = useState('')

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    await onSubmit(name, parseEmails(inviteEmails))
  }

  return (
    <FormGrid singleColumn onSubmit={submit}>
      <label>
        Workspace name
        <input required value={name} onChange={(event) => setName(event.target.value)} />
      </label>

      <label>
        Invite emails
        <input
          type="text"
          inputMode="email"
          placeholder="pat@example.com, sam@example.com"
          value={inviteEmails}
          onChange={(event) => setInviteEmails(event.target.value)}
        />
      </label>

      {loader.error && <p className={styles.error} role="alert">{loader.error}</p>}

      <ComponentRoleContext role="primary">
        <AsynchronousSubmitButton loader={loader}>Create workspace</AsynchronousSubmitButton>
      </ComponentRoleContext>
    </FormGrid>
  )
}
