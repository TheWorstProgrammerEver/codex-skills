import { Link } from 'react-router-dom'
import { AppDialog } from '../../../lib/ui/AppDialog/AppDialog'
import { HeaderWithActions } from '../../../lib/ui/HeaderWithActions/HeaderWithActions'
import { List, ListItem } from '../../../lib/ui/List/List'
import { Section } from '../../../lib/ui/Section/Section'
import { InvitationPanel } from '../../components/InvitationPanel/InvitationPanel'
import { WorkspaceForm } from '../../components/WorkspaceForm/WorkspaceForm'
import { useManageWorkspacesScreenViewModel } from './useManageWorkspacesScreenViewModel'
import styles from './ManageWorkspacesScreen.module.scss'

export const ManageWorkspacesScreen = () => {
  const viewModel = useManageWorkspacesScreenViewModel()

  return (
    <section className={styles.screen} aria-labelledby="manage-workspaces-title">
      <HeaderWithActions
        header={<h2 id="manage-workspaces-title">Workspaces</h2>}
        actions={<button type="button" onClick={() => viewModel.setCreateOpen(true)}>Create workspace</button>}
      />

      <Section title="Invitations">
        <InvitationPanel
          invitations={viewModel.pendingInvitations}
          onAccept={(invitationId) => void viewModel.acceptInvitation(invitationId)}
          onReject={(invitationId) => void viewModel.rejectInvitation(invitationId)}
        />
      </Section>

      <Section title="Your workspaces">
        {viewModel.workspaces.length === 0 ? (
          <p>No workspaces yet.</p>
        ) : (
          <List ariaLabel="Workspaces">
            {viewModel.workspaces.map((workspace) => (
              <ListItem
                key={workspace.id}
                details={(
                  <span className={styles.workspaceDetails}>
                    <strong>{workspace.name}</strong>
                    <span>{workspace.members.length} members, {workspace.tasks.length} tasks</span>
                  </span>
                )}
                actions={<Link to={`/workspaces/${workspace.id}`}>Open</Link>}
              />
            ))}
          </List>
        )}
      </Section>

      <AppDialog
        open={viewModel.createOpen}
        title="Create workspace"
        onClose={() => viewModel.setCreateOpen(false)}
      >
        <WorkspaceForm loader={viewModel.createLoader} onSubmit={viewModel.submitWorkspace} />
      </AppDialog>
    </section>
  )
}
