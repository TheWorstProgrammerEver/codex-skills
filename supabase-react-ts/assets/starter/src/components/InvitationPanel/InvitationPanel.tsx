import { Check, X } from 'lucide-react'
import type { PendingInvitation } from '../../../common/appTypes'
import { Button } from '../../../lib/ui/Button/Button'
import { ComponentRoleContext } from '../../../lib/ui/ComponentRoleContext/ComponentRoleContext'
import { List, ListItem } from '../../../lib/ui/List/List'
import { ResponsiveContent } from '../../../lib/ui/ResponsiveContent/ResponsiveContent'

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
                <Button type="button" onClick={() => onAccept(invitation.id)}>
                  <ResponsiveContent icon={<Check />}>Accept</ResponsiveContent>
                </Button>
              </ComponentRoleContext>
              <ComponentRoleContext role="destructive">
                <Button type="button" onClick={() => onReject(invitation.id)}>
                  <ResponsiveContent icon={<X />}>Reject</ResponsiveContent>
                </Button>
              </ComponentRoleContext>
            </>
          )}
        />
      ))}
    </List>
  )
}
