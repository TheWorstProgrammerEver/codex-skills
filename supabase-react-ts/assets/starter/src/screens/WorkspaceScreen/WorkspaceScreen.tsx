import { ArrowLeft, Plus, UserPlus } from 'lucide-react'
import { AppDialog } from '../../../lib/ui/AppDialog/AppDialog'
import { Button } from '../../../lib/ui/Button/Button'
import { ComponentRoleContext } from '../../../lib/ui/ComponentRoleContext/ComponentRoleContext'
import { HeaderWithActions } from '../../../lib/ui/HeaderWithActions/HeaderWithActions'
import { LoaderContainer } from '../../../lib/ui/LoaderContainer/LoaderContainer'
import { ResponsiveButton } from '../../../lib/ui/ResponsiveButton/ResponsiveButton'
import { Section } from '../../../lib/ui/Section/Section'
import { InviteMemberForm } from '../../components/InviteMemberForm/InviteMemberForm'
import { TaskForm } from '../../components/TaskForm/TaskForm'
import { TaskList } from '../../components/TaskList/TaskList'
import { openTaskCount } from '../../domain/tasks'
import { useWorkspaceScreenViewModel } from './useWorkspaceScreenViewModel'
import styles from './WorkspaceScreen.module.scss'

export const WorkspaceScreen = () => {
  const viewModel = useWorkspaceScreenViewModel()

  if (!viewModel.workspace && viewModel.appLoad.busy) {
    return (
      <LoaderContainer loader={viewModel.appLoad} loadingLabel="Loading workspace...">
        <section className={styles.screen} aria-label="Loading workspace" />
      </LoaderContainer>
    )
  }

  if (!viewModel.workspace) {
    return (
      <section className={styles.screen} aria-labelledby="missing-workspace-title">
        <h2 id="missing-workspace-title">Workspace not found</h2>
        <ComponentRoleContext role="tertiary">
          <Button type="button" onClick={viewModel.goToWorkspaces}>
            <ArrowLeft aria-hidden="true" />
            Back to workspaces
          </Button>
        </ComponentRoleContext>
      </section>
    )
  }

  return (
    <section className={styles.screen} aria-labelledby="workspace-title">
      <HeaderWithActions
        header={(
          <header>
            <h2 id="workspace-title">{viewModel.workspace.name}</h2>
            <p>{openTaskCount(viewModel.workspace.tasks)} open tasks</p>
          </header>
        )}
        actions={(
          <>
            <ResponsiveButton
              type="button"
              icon={<UserPlus />}
              label="Invite"
              onClick={() => viewModel.setInviteOpen(true)}
            />
            <ComponentRoleContext role="primary">
              <ResponsiveButton
                type="button"
                icon={<Plus />}
                label="Add task"
                onClick={() => viewModel.setTaskOpen(true)}
              />
            </ComponentRoleContext>
          </>
        )}
      />

      <Section title="Tasks">
        <TaskList
          tasks={viewModel.tasks}
          onDelete={viewModel.removeTask}
          onToggle={viewModel.toggleTask}
        />
      </Section>

      <Section title="Members">
        <ul className={styles.members}>
          {viewModel.workspace.members.map((member) => (
            <li key={member.id}>{member.name} <span>{member.status}</span></li>
          ))}
        </ul>
      </Section>

      <AppDialog open={viewModel.taskOpen} title="Add task" onClose={() => viewModel.setTaskOpen(false)}>
        <TaskForm loader={viewModel.taskLoader} onSubmit={viewModel.submitTask} />
      </AppDialog>

      <AppDialog open={viewModel.inviteOpen} title="Invite member" onClose={() => viewModel.setInviteOpen(false)}>
        <InviteMemberForm loader={viewModel.inviteLoader} onSubmit={viewModel.submitInvite} />
      </AppDialog>
    </section>
  )
}
