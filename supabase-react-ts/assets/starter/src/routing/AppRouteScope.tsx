import { Outlet } from 'react-router-dom'
import { useAuthContext } from '../contexts/AuthContext'
import { TeamTasksContextProvider } from '../contexts/TeamTasksContext'

export const AppRouteScope = () => {
  const { currentAccount } = useAuthContext()

  return (
    <TeamTasksContextProvider currentAccount={currentAccount}>
      <Outlet />
    </TeamTasksContextProvider>
  )
}
