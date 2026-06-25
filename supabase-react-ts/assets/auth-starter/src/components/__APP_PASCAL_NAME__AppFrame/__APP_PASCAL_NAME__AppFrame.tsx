import { CircleUserRound } from 'lucide-react'
import { NavLink, Outlet } from 'react-router-dom'
import { AppFrame } from '../../../lib/ui/AppFrame/AppFrame'
import { ActionLink } from '../../../lib/ui/Button/ActionLink'
import { ComponentRoleContext } from '../../../lib/ui/ComponentRoleContext/ComponentRoleContext'
import { IconAndLabel, IconOnly } from '../../../lib/ui/ResponsiveContent/IconContent'
import { ResponsiveContent } from '../../../lib/ui/ResponsiveContent/ResponsiveContent'
import { useAuthContext } from '../../contexts/AuthContext'
import styles from './__APP_PASCAL_NAME__AppFrame.module.scss'

const navLinkClass = ({ isActive }: { isActive: boolean }) => (
  isActive ? `${styles.navLink} ${styles.active}` : styles.navLink
)

export const __APP_PASCAL_NAME__AppFrame = () => {
  const { currentAccount } = useAuthContext()
  const accountEmail = currentAccount?.email ?? 'Profile'

  return (
    <AppFrame
      environment={window.config?.environment ?? 'local'}
      appName={window.config?.appName ?? '__APP_DISPLAY_NAME__'}
      accountMenu={(
        <ComponentRoleContext role="secondary">
          <ActionLink className={styles.profileLink} to="/profile">
            <ResponsiveContent
              compact={<IconOnly icon={<CircleUserRound />} label={`Open profile for ${accountEmail}`} />}
              nonCompact={(
                <IconAndLabel icon={<CircleUserRound />} label={`Open profile for ${accountEmail}`}>
                  {accountEmail}
                </IconAndLabel>
              )}
            />
          </ActionLink>
        </ComponentRoleContext>
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
