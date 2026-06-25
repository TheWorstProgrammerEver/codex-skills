import { LogOut } from 'lucide-react'
import { NavLink, Outlet } from 'react-router-dom'
import { AppFrame } from '../../../lib/ui/AppFrame/AppFrame'
import { Button } from '../../../lib/ui/Button/Button'
import { ComponentRoleContext } from '../../../lib/ui/ComponentRoleContext/ComponentRoleContext'
import { LoaderContainer } from '../../../lib/ui/LoaderContainer/LoaderContainer'
import { useAuthContext } from '../../contexts/AuthContext'
import { useTeamTasksContext } from '../../contexts/TeamTasksContext'
import styles from './StarterAppFrame.module.scss'

const navLinkClass = ({ isActive }: { isActive: boolean }) => (
  isActive ? `${styles.navLink} ${styles.active}` : styles.navLink
)

export const StarterAppFrame = () => {
  const { currentAccount, signOut } = useAuthContext()
  const { appLoad, state } = useTeamTasksContext()

  return (
    <AppFrame
      environment={window.config?.environment ?? 'local'}
      appName={window.config?.appName ?? 'Team Tasks'}
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
        <nav className={styles.nav}>
          <section className={styles.staticNav} aria-label="App navigation">
            <NavLink className={navLinkClass} to="/workspaces/manage">Manage Workspaces</NavLink>
            <NavLink className={navLinkClass} to="/profile">Profile</NavLink>
          </section>

          <div className={styles.dynamicNav}>
            <details className={styles.navDetails} open>
              <summary>Workspaces</summary>

              <LoaderContainer loader={appLoad} loadingLabel="Loading workspaces...">
                <div className={styles.workspaceLinks}>
                  {state.workspaces.map((workspace) => (
                    <NavLink className={navLinkClass} key={workspace.id} to={`/workspaces/${workspace.id}`}>
                      {workspace.name}
                    </NavLink>
                  ))}
                  {state.workspaces.length === 0 && <p>No workspaces yet</p>}
                </div>
              </LoaderContainer>
            </details>
          </div>
        </nav>
      )}
    >
      <Outlet />
    </AppFrame>
  )
}
