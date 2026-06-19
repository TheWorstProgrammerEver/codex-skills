import type { PendingInvitation } from '../../../common/appTypes'
import { List, ListItem } from '../../../lib/ui/List/List'

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
              <button type="button" onClick={() => onAccept(invitation.id)}>Accept</button>
              <button type="button" onClick={() => onReject(invitation.id)}>Reject</button>
            </>
          )}
        />
      ))}
    </List>
  )
}
