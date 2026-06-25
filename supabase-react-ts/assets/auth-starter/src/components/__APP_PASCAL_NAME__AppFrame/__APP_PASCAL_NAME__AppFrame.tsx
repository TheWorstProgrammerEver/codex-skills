import { LogOut } from 'lucide-react'
import { NavLink, Outlet } from 'react-router-dom'
import { AppFrame } from '../../../lib/ui/AppFrame/AppFrame'
import { Button } from '../../../lib/ui/Button/Button'
import { ComponentRoleContext } from '../../../lib/ui/ComponentRoleContext/ComponentRoleContext'
import { useAuthContext } from '../../contexts/AuthContext'
import styles from './__APP_PASCAL_NAME__AppFrame.module.scss'

const navLinkClass = ({ isActive }: { isActive: boolean }) => (
  isActive ? `${styles.navLink} ${styles.active}` : styles.navLink
)

export const __APP_PASCAL_NAME__AppFrame = () => {
  const { currentAccount, signOut } = useAuthContext()

  return (
    <AppFrame
      environment={window.config?.environment ?? 'local'}
      appName={window.config?.appName ?? '__APP_DISPLAY_NAME__'}
      accountMenu={(
        <details>
          <summary>{currentAccount?.email}</summary>
          <div>
            <NavLink to="/profile">Profile</NavLink>
            <ComponentRoleContext role="tertiary">
              <Button type="button" onClick={() => void signOut()}>
                <LogOut aria-hidden="true" />
                Log out
              </Button>
            </ComponentRoleContext>
          </div>
        </details>
      )}
      navigation={(
        <nav className={styles.nav} aria-label="App navigation">
          <NavLink className={navLinkClass} to="/" end>Home</NavLink>
          <NavLink className={navLinkClass} to="/profile">Profile</NavLink>
        </nav>
      )}
    >
      <Outlet />
    </AppFrame>
  )
}
