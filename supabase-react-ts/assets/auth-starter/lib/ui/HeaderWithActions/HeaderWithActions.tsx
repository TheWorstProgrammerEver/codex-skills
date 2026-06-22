import type { ReactNode } from 'react'
import styles from './HeaderWithActions.module.scss'

type HeaderWithActionsProps = {
  header?: ReactNode
  actions?: ReactNode
  className?: string
}

export const HeaderWithActions = ({ header, actions, className }: HeaderWithActionsProps) => (
  <div className={[styles.header, className].filter(Boolean).join(' ')}>
    {header && (
      <div className={styles.title}>{header}</div>
    )}

    {actions && (
      <div className={styles.actions}>{actions}</div>
    )}
  </div>
)
