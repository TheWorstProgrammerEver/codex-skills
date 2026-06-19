import { createContext, type ReactNode, useContext } from 'react'
import type { Account } from '../types/auth'
import { useTeamTasks } from '../state/useTeamTasks'

type TeamTasksContextValue = ReturnType<typeof useTeamTasks>

const TeamTasksContext = createContext<TeamTasksContextValue | undefined>(undefined)

type TeamTasksContextProviderProps = {
  children: ReactNode
  currentAccount?: Account
}

export const TeamTasksContextProvider = ({ children, currentAccount }: TeamTasksContextProviderProps) => {
  const value = useTeamTasks(currentAccount)

  return (
    <TeamTasksContext.Provider value={value}>
      {children}
    </TeamTasksContext.Provider>
  )
}

export const useTeamTasksContext = () => {
  const context = useContext(TeamTasksContext)

  if (!context) {
    throw new Error('useTeamTasksContext must be used inside TeamTasksContextProvider')
  }

  return context
}
