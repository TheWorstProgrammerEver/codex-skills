import { appRequestIdentifiers } from '../../../../common/appRequestIdentifiers.ts'
import { nameFromEmail, todayIso, trimOrDefault, uniqueEmails } from '../helpers.ts'
import { loadState } from '../appState.ts'
import { getProfile } from '../profile.ts'
import { workspaceFromRows } from '../mappers.ts'
import type { InvitationRow, MemberRow, WorkspaceRow } from '../types/rows.ts'
import { createAppRequestHandlerFactory } from './handlerFactory.ts'

type CreateWorkspaceParams = {
  name: string
  inviteEmails: string[]
}

export const createLoadAppHandler = createAppRequestHandlerFactory(appRequestIdentifiers.load, ({ client, user }) =>
  async (request) => {
    await getProfile(client, user)
    const params = request.params as { activeWorkspaceId?: string }

    return await loadState(client, params.activeWorkspaceId)
  })

export const createCreateWorkspaceHandler = createAppRequestHandlerFactory(appRequestIdentifiers.createWorkspace, ({ client, user }) =>
  async (request) => {
    const { name, inviteEmails } = request.params as CreateWorkspaceParams
    const profile = await getProfile(client, user)
    const workspaceId = crypto.randomUUID()
    const createdDate = todayIso()
    const workspaceName = trimOrDefault(name, 'Team workspace')
    const emails = uniqueEmails(inviteEmails, profile.email)
    const workspace: WorkspaceRow = {
      id: workspaceId,
      name: workspaceName,
      created_by_profile_id: profile.id,
      created_date: createdDate
    }
    const ownerMember: MemberRow = {
      id: crypto.randomUUID(),
      workspace_id: workspaceId,
      profile_id: profile.id,
      name: profile.display_name,
      email: profile.email,
      status: 'active'
    }
    const invitedMembers: MemberRow[] = emails.map((email) => ({
      id: crypto.randomUUID(),
      workspace_id: workspaceId,
      name: nameFromEmail(email),
      email,
      status: 'invited'
    }))
    const invitations: InvitationRow[] = emails.map((email) => ({
      id: crypto.randomUUID(),
      workspace_id: workspaceId,
      workspace_name: workspaceName,
      email,
      invited_date: createdDate
    }))

    const { error: workspaceError } = await client.from('workspaces').insert(workspace)

    if (workspaceError) {
      throw workspaceError
    }

    const { error: memberError } = await client.from('workspace_members').insert([ownerMember, ...invitedMembers])

    if (memberError) {
      throw memberError
    }

    if (invitations.length > 0) {
      const { error: invitationError } = await client.from('workspace_invitations').insert(invitations)

      if (invitationError) {
        throw invitationError
      }
    }

    return {
      workspace: workspaceFromRows(workspace, [ownerMember, ...invitedMembers], invitations, [])
    }
  })
