import { Navigate, Route, Routes } from 'react-router-dom'
import { StarterAppFrame } from './components/StarterAppFrame/StarterAppFrame'
import { useTeamTasksContext } from './contexts/TeamTasksContext'
import { AppRouteScope } from './routing/AppRouteScope'
import { RequireAuth } from './routing/RequireAuth'
import { AuthScreen } from './screens/AuthScreen/AuthScreen'
import { ManageWorkspacesScreen } from './screens/ManageWorkspacesScreen/ManageWorkspacesScreen'
import { ProfileScreen } from './screens/ProfileScreen/ProfileScreen'
import { WorkspaceScreen } from './screens/WorkspaceScreen/WorkspaceScreen'
import { AuthContextProvider } from './contexts/AuthContext'

const StartScreen = () => {
  const { state } = useTeamTasksContext()
  const firstWorkspace = state.workspaces[0]

  return <Navigate to={firstWorkspace ? `/workspaces/${firstWorkspace.id}` : '/workspaces/manage'} replace />
}

export const App = () => (
  <AuthContextProvider>
    <Routes>
      <Route path="/sign-in" element={<AuthScreen />} />
      <Route element={<RequireAuth />}>
        <Route element={<AppRouteScope />}>
          <Route element={<StarterAppFrame />}>
            <Route index element={<StartScreen />} />
            <Route path="workspaces/manage" element={<ManageWorkspacesScreen />} />
            <Route path="workspaces/:workspaceId" element={<WorkspaceScreen />} />
            <Route path="profile" element={<ProfileScreen />} />
          </Route>
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  </AuthContextProvider>
)
