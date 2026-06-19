import { appRequestIdentifiers } from '../../../../common/appRequestIdentifiers.ts'
import { HttpError, nameFromEmail, normalizeEmail, todayIso } from '../helpers.ts'
import { getProfile } from '../profile.ts'
import { invitationFromRow, memberFromRow } from '../mappers.ts'
import type { InvitationRow, MemberRow } from '../types/rows.ts'
import { createAppRequestHandlerFactory } from './handlerFactory.ts'

type InviteMemberParams = {
  workspaceId: string
  email: string
}

type InvitationParams = {
  invitationId: string
}

const memberColumns = 'id, workspace_id, profile_id, name, email, status'
const invitationColumns = 'id, workspace_id, workspace_name, email, invited_date'

export const createInviteMemberHandler = createAppRequestHandlerFactory(appRequestIdentifiers.inviteMember, ({ client }) =>
  async (request) => {
    const { workspaceId, email } = request.params as InviteMemberParams
    const normalizedEmail = normalizeEmail(email)

    if (!workspaceId || !normalizedEmail) {
      throw new HttpError(400, 'Choose a workspace and email to invite.')
    }

    const { data: workspace, error: workspaceError } = await client
      .from('workspaces')
      .select('name')
      .eq('id', workspaceId)
      .maybeSingle<{ name: string }>()

    if (workspaceError) {
      throw workspaceError
    }

    if (!workspace) {
      throw new HttpError(404, 'Workspace not found.')
    }

    const member: MemberRow = {
      id: crypto.randomUUID(),
      workspace_id: workspaceId,
      name: nameFromEmail(normalizedEmail),
      email: normalizedEmail,
      status: 'invited'
    }
    const invitation: InvitationRow = {
      id: crypto.randomUUID(),
      workspace_id: workspaceId,
      workspace_name: workspace.name,
      email: normalizedEmail,
      invited_date: todayIso()
    }
    const { error: memberError } = await client.from('workspace_members').insert(member)

    if (memberError) {
      throw memberError
    }

    const { error: invitationError } = await client.from('workspace_invitations').insert(invitation)

    if (invitationError) {
      throw invitationError
    }

    return {
      workspaceId,
      member: memberFromRow(member),
      invitation: invitationFromRow(invitation)
    }
  })

export const createAcceptInvitationHandler = createAppRequestHandlerFactory(appRequestIdentifiers.acceptInvitation, ({ client, user }) =>
  async (request) => {
    const { invitationId } = request.params as InvitationParams
    const profile = await getProfile(client, user)
    const { data: invitation, error: invitationError } = await client
      .from('workspace_invitations')
      .select(invitationColumns)
      .eq('id', invitationId)
      .maybeSingle<InvitationRow>()

    if (invitationError) {
      throw invitationError
    }

    if (!invitation || invitation.email !== profile.email) {
      throw new HttpError(404, 'Invitation not found.')
    }

    const { data: members, error: memberError } = await client
      .from('workspace_members')
      .update({
        profile_id: profile.id,
        name: profile.display_name,
        status: 'active'
      })
      .eq('workspace_id', invitation.workspace_id)
      .eq('email', profile.email)
      .select(memberColumns)

    if (memberError) {
      throw memberError
    }

    const member = (members as MemberRow[] | null)?.[0]

    if (!member) {
      throw new HttpError(404, 'Invitation member record not found.')
    }

    const { error: deleteError } = await client
      .from('workspace_invitations')
      .delete()
      .eq('id', invitation.id)

    if (deleteError) {
      throw deleteError
    }

    return {
      workspaceId: invitation.workspace_id,
      member: memberFromRow(member),
      invitationId: invitation.id
    }
  })

export const createRejectInvitationHandler = createAppRequestHandlerFactory(appRequestIdentifiers.rejectInvitation, ({ client, user }) =>
  async (request) => {
    const { invitationId } = request.params as InvitationParams
    const profile = await getProfile(client, user)
    const { data: invitation, error: invitationError } = await client
      .from('workspace_invitations')
      .select(invitationColumns)
      .eq('id', invitationId)
      .maybeSingle<InvitationRow>()

    if (invitationError) {
      throw invitationError
    }

    if (!invitation || invitation.email !== profile.email) {
      throw new HttpError(404, 'Invitation not found.')
    }

    const { error: memberDeleteError } = await client
      .from('workspace_members')
      .delete()
      .eq('workspace_id', invitation.workspace_id)
      .eq('email', profile.email)
      .eq('status', 'invited')

    if (memberDeleteError) {
      throw memberDeleteError
    }

    const { error: deleteError } = await client
      .from('workspace_invitations')
      .delete()
      .eq('id', invitation.id)

    if (deleteError) {
      throw deleteError
    }

    return {
      workspaceId: invitation.workspace_id,
      invitationId: invitation.id
    }
  })
