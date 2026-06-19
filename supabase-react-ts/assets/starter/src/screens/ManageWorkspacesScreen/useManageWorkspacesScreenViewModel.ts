import { useState } from 'react'
import { useLoader } from '../../../lib/hooks/useLoader'
import { useTeamTasksContext } from '../../contexts/TeamTasksContext'

export const useManageWorkspacesScreenViewModel = () => {
  const [createOpen, setCreateOpen] = useState(false)
  const createLoader = useLoader()
  const {
    acceptInvitation,
    createWorkspace,
    rejectInvitation,
    state
  } = useTeamTasksContext()

  const submitWorkspace = async (name: string, inviteEmails: string[]) => {
    await createLoader.execute(() => createWorkspace(name, inviteEmails))
    setCreateOpen(false)
  }

  return {
    acceptInvitation,
    createLoader,
    createOpen,
    pendingInvitations: state.pendingInvitations,
    rejectInvitation,
    setCreateOpen,
    submitWorkspace,
    workspaces: state.workspaces
  }
}
