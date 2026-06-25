import { type FormEvent, useState } from 'react'
import type { LoaderState } from '../../../lib/hooks/useLoader'
import { AsynchronousSubmitButton } from '../../../lib/ui/AsynchronousSubmitButton/AsynchronousSubmitButton'
import { ComponentRoleContext } from '../../../lib/ui/ComponentRoleContext/ComponentRoleContext'
import styles from './InviteMemberForm.module.scss'

type InviteMemberFormProps = {
  loader: LoaderState
  onSubmit: (email: string) => void | Promise<void>
}

export const InviteMemberForm = ({ loader, onSubmit }: InviteMemberFormProps) => {
  const [email, setEmail] = useState('')

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    await onSubmit(email)
  }

  return (
    <form className={styles.form} onSubmit={submit}>
      <label>
        Email
        <input
          autoComplete="email"
          inputMode="email"
          required
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </label>

      {loader.error && <p className={styles.error} role="alert">{loader.error}</p>}

      <ComponentRoleContext role="primary">
        <AsynchronousSubmitButton loader={loader}>Send invite</AsynchronousSubmitButton>
      </ComponentRoleContext>
    </form>
  )
}
