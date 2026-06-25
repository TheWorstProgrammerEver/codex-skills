import { ArrowRight, Plus } from 'lucide-react'
import { AppDialog } from '../../../lib/ui/AppDialog/AppDialog'
import { ComponentRoleContext } from '../../../lib/ui/ComponentRoleContext/ComponentRoleContext'
import { HeaderWithActions } from '../../../lib/ui/HeaderWithActions/HeaderWithActions'
import { List, ListItem } from '../../../lib/ui/List/List'
import { ResponsiveActionLink } from '../../../lib/ui/ResponsiveActionLink/ResponsiveActionLink'
import { ResponsiveButton } from '../../../lib/ui/ResponsiveButton/ResponsiveButton'
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
        actions={(
          <ComponentRoleContext role="primary">
            <ResponsiveButton
              type="button"
              icon={<Plus />}
              label="Create workspace"
              onClick={() => viewModel.setCreateOpen(true)}
            />
          </ComponentRoleContext>
        )}
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
                actions={(
                  <ComponentRoleContext role="tertiary">
                    <ResponsiveActionLink
                      to={`/workspaces/${workspace.id}`}
                      icon={<ArrowRight />}
                      label={`Open ${workspace.name}`}
                    >
                      Open
                    </ResponsiveActionLink>
                  </ComponentRoleContext>
                )}
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
