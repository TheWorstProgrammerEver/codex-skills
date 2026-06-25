import { Check, X } from 'lucide-react'
import type { PendingInvitation } from '../../../common/appTypes'
import { ComponentRoleContext } from '../../../lib/ui/ComponentRoleContext/ComponentRoleContext'
import { List, ListItem } from '../../../lib/ui/List/List'
import { ResponsiveButton } from '../../../lib/ui/ResponsiveButton/ResponsiveButton'

type InvitationPanelProps = {
  invitations: PendingInvitation[]
  onAccept: (invitationId: string) => void
  onReject: (invitationId: string) => void
}

export const InvitationPanel = ({ invitations, onAccept, onReject }: InvitationPanelProps) => {
  if (invitations.length === 0) {
    return <p>No pending invitations.</p>
  }

  return (
    <List ariaLabel="Pending invitations">
      {invitations.map((invitation) => (
        <ListItem
          key={invitation.id}
          details={(
            <span>
              <strong>{invitation.workspaceName}</strong>
            </span>
          )}
          actions={(
            <>
              <ComponentRoleContext role="primary">
                <ResponsiveButton
                  type="button"
                  icon={<Check />}
                  label="Accept"
                  onClick={() => onAccept(invitation.id)}
                />
              </ComponentRoleContext>
              <ComponentRoleContext role="destructive">
                <ResponsiveButton
                  type="button"
                  icon={<X />}
                  label="Reject"
                  onClick={() => onReject(invitation.id)}
                />
              </ComponentRoleContext>
            </>
          )}
        />
      ))}
    </List>
  )
}
