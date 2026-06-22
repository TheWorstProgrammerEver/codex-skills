import { Navigate, Route, Routes } from 'react-router-dom'
import { __APP_PASCAL_NAME__AppFrame } from './components/__APP_PASCAL_NAME__AppFrame/__APP_PASCAL_NAME__AppFrame'
import { RequireAuth } from './routing/RequireAuth'
import { AuthScreen } from './screens/AuthScreen/AuthScreen'
import { HomeScreen } from './screens/HomeScreen/HomeScreen'
import { ProfileScreen } from './screens/ProfileScreen/ProfileScreen'
import { AuthContextProvider } from './contexts/AuthContext'

export const App = () => (
  <AuthContextProvider>
    <Routes>
      <Route path="/sign-in" element={<AuthScreen />} />
      <Route element={<RequireAuth />}>
        <Route element={<__APP_PASCAL_NAME__AppFrame />}>
          <Route index element={<HomeScreen />} />
          <Route path="profile" element={<ProfileScreen />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  </AuthContextProvider>
)
