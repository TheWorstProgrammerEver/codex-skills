import type { ReactNode } from 'react'
import styles from './ResponsiveContent.module.scss'

type ResponsiveContentProps = {
  children: ReactNode
  icon: ReactNode
  label?: string
}

export const ResponsiveContent = ({ children, icon, label }: ResponsiveContentProps) => (
  <span className={styles.content}>
    <span className={styles.icon} aria-hidden="true">
      {icon}
    </span>
    <span className={styles.label} aria-hidden={label ? true : undefined}>
      {children}
    </span>
    {label && <span className={styles.accessibleLabel}>{label}</span>}
  </span>
)
