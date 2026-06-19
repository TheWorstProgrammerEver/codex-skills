import type { SupabaseClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { appRequestIdentifiers, appRequestNames } from '../../../common/appRequestIdentifiers'
import type { TeamTasksState } from '../../../common/appTypes'
import {
  createAdminClient,
  createAnonymousClient,
  createSignedInClient,
  requireLocalFunctionsReady
} from './localSupabase'
import {
  cleanupSecurityFixture,
  createSecurityFixture,
  type SecurityFixture
} from './securityFixture'

type IdRow = {
  id: string
}

let fixture: SecurityFixture | undefined
let anonymousClient: SupabaseClient
let ownerClient: SupabaseClient
let memberClient: SupabaseClient
let outsiderClient: SupabaseClient
let inviteeClient: SupabaseClient

const appTables = ['profiles', 'workspaces', 'workspace_members', 'workspace_invitations', 'tasks']

const ids = (rows: IdRow[]) => rows.map((row) => row.id)

const requireFixture = () => {
  if (!fixture) {
    throw new Error('Security fixture was not created.')
  }

  return fixture
}

const invokeApp = async (client: SupabaseClient, identifier: string, params: unknown) => (
  client.functions.invoke('app', {
    body: {
      identifier,
      params
    }
  })
)

const loadApp = async (client: SupabaseClient) => {
  const { data, error } = await invokeApp(client, appRequestIdentifiers.load, {})

  if (error) {
    throw error
  }

  return data as TeamTasksState
}

const selectIds = async (client: SupabaseClient, table: string) => {
  const { data, error } = await client.from(table).select('id')

  if (error) {
    throw error
  }

  return ids((data ?? []) as IdRow[])
}

beforeAll(async () => {
  await requireLocalFunctionsReady()
  fixture = await createSecurityFixture()
  anonymousClient = createAnonymousClient()
  ownerClient = await createSignedInClient(fixture.users.owner.email, fixture.users.owner.password)
  memberClient = await createSignedInClient(fixture.users.member.email, fixture.users.member.password)
  outsiderClient = await createSignedInClient(fixture.users.outsider.email, fixture.users.outsider.password)
  inviteeClient = await createSignedInClient(fixture.users.invitee.email, fixture.users.invitee.password)
})

afterAll(async () => {
  await cleanupSecurityFixture(fixture)
})

describe('app security integration', () => {
  test('anonymous users cannot call business functions', async () => {
    for (const identifier of appRequestNames) {
      const { data, error } = await invokeApp(anonymousClient, identifier, {})

      expect(error, identifier).toBeTruthy()
      expect(data, identifier).toBeFalsy()
    }
  })

  test('anonymous users cannot read app tables directly', async () => {
    for (const table of appTables) {
      const rows = await selectIds(anonymousClient, table)

      expect(rows, table).toHaveLength(0)
    }
  })

  test('active members only load their workspace data through functions', async () => {
    const securityFixture = requireFixture()
    const ownerState = await loadApp(ownerClient)
    const memberState = await loadApp(memberClient)
    const outsiderState = await loadApp(outsiderClient)

    expect(ids(ownerState.workspaces)).toContain(securityFixture.workspaces.visible)
    expect(ids(ownerState.workspaces)).not.toContain(securityFixture.workspaces.hidden)
    expect(ids(memberState.workspaces)).toEqual(ids(ownerState.workspaces))
    expect(ids(outsiderState.workspaces)).toContain(securityFixture.workspaces.hidden)
    expect(ids(outsiderState.workspaces)).not.toContain(securityFixture.workspaces.visible)
  })

  test('active members only read their workspace rows directly', async () => {
    const securityFixture = requireFixture()

    expect(await selectIds(ownerClient, 'workspaces')).toContain(securityFixture.workspaces.visible)
    expect(await selectIds(ownerClient, 'workspaces')).not.toContain(securityFixture.workspaces.hidden)
    expect(await selectIds(ownerClient, 'tasks')).toContain(securityFixture.tasks.visible)
    expect(await selectIds(ownerClient, 'tasks')).not.toContain(securityFixture.tasks.hidden)
    expect(await selectIds(outsiderClient, 'tasks')).toContain(securityFixture.tasks.hidden)
    expect(await selectIds(outsiderClient, 'tasks')).not.toContain(securityFixture.tasks.visible)
  })

  test('pending invitees only see their own invitation state', async () => {
    const securityFixture = requireFixture()
    const state = await loadApp(inviteeClient)

    expect(state.workspaces).toHaveLength(0)
    expect(ids(state.pendingInvitations)).toContain(securityFixture.invitations.visible)
    expect(await selectIds(inviteeClient, 'workspaces')).toHaveLength(0)
    expect(await selectIds(inviteeClient, 'tasks')).toHaveLength(0)
    expect(await selectIds(inviteeClient, 'workspace_invitations')).toEqual([securityFixture.invitations.visible])
  })

  test('members can create, update, and delete tasks through functions', async () => {
    const securityFixture = requireFixture()
    const createResult = await invokeApp(ownerClient, appRequestIdentifiers.createTask, {
      workspaceId: securityFixture.workspaces.visible,
      input: {
        title: 'Function task',
        notes: 'Created by the test'
      }
    })

    expect(createResult.error).toBeFalsy()
    expect(createResult.data.title).toBe('Function task')

    const updateResult = await invokeApp(ownerClient, appRequestIdentifiers.updateTask, {
      workspaceId: securityFixture.workspaces.visible,
      taskId: createResult.data.id,
      input: {
        title: 'Updated function task',
        notes: '',
        status: 'done'
      }
    })

    expect(updateResult.error).toBeFalsy()
    expect(updateResult.data.status).toBe('done')

    const deleteResult = await invokeApp(ownerClient, appRequestIdentifiers.deleteTask, {
      workspaceId: securityFixture.workspaces.visible,
      taskId: createResult.data.id
    })

    expect(deleteResult.error).toBeFalsy()
    expect(await selectIds(ownerClient, 'tasks')).not.toContain(createResult.data.id)
  })

  test('members cannot write tasks outside their workspaces directly', async () => {
    const securityFixture = requireFixture()
    const blockedTaskId = crypto.randomUUID()
    const { data } = await ownerClient
      .from('tasks')
      .insert({
        id: blockedTaskId,
        workspace_id: securityFixture.workspaces.hidden,
        title: 'Blocked task',
        notes: '',
        status: 'open',
        created_by_profile_id: securityFixture.users.owner.id,
        created_by_name: securityFixture.users.owner.name,
        created_date: '2026-06-19'
      })
      .select('id')

    expect(data ?? []).toHaveLength(0)
    expect(await selectIds(createAdminClient(), 'tasks')).not.toContain(blockedTaskId)
  })
})
