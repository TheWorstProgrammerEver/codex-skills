import { randomUUID } from 'node:crypto'
import { createAdminClient } from './localSupabase'

export type FixtureUser = {
  email: string
  id: string
  name: string
  password: string
}

export type SecurityFixture = {
  prefix: string
  users: {
    invitee: FixtureUser
    member: FixtureUser
    outsider: FixtureUser
    owner: FixtureUser
  }
  invitations: {
    visible: string
  }
  tasks: {
    hidden: string
    visible: string
  }
  workspaces: {
    hidden: string
    visible: string
  }
}

const password = 'password123'
const today = '2026-06-19'

const createUser = (prefix: string, role: string, name: string): FixtureUser => ({
  email: `${prefix}-${role}@example.com`,
  id: '',
  name,
  password
})

const insertRows = async (table: string, rows: unknown[]) => {
  const { error } = await createAdminClient().from(table).insert(rows)

  if (error) {
    throw error
  }
}

const createUsers = async (fixture: SecurityFixture) => {
  const admin = createAdminClient()

  for (const user of Object.values(fixture.users)) {
    const { data, error } = await admin.auth.admin.createUser({
      email: user.email,
      email_confirm: true,
      password: user.password,
      user_metadata: {
        display_name: user.name
      }
    })

    if (error) {
      throw error
    }

    user.id = data.user.id
  }
}

const seedRows = async (fixture: SecurityFixture) => {
  const { invitations, prefix, tasks, users, workspaces } = fixture

  await insertRows('profiles', Object.values(users).map((user) => ({
    id: user.id,
    display_name: user.name,
    email: user.email,
    created_date: today
  })))

  await insertRows('workspaces', [
    {
      id: workspaces.visible,
      name: `${prefix} visible workspace`,
      created_by_profile_id: users.owner.id,
      created_date: today
    },
    {
      id: workspaces.hidden,
      name: `${prefix} hidden workspace`,
      created_by_profile_id: users.outsider.id,
      created_date: today
    }
  ])

  await insertRows('workspace_members', [
    {
      id: randomUUID(),
      workspace_id: workspaces.visible,
      profile_id: users.owner.id,
      name: users.owner.name,
      email: users.owner.email,
      status: 'active',
      created_date: today
    },
    {
      id: randomUUID(),
      workspace_id: workspaces.visible,
      profile_id: users.member.id,
      name: users.member.name,
      email: users.member.email,
      status: 'active',
      created_date: today
    },
    {
      id: randomUUID(),
      workspace_id: workspaces.visible,
      name: users.invitee.name,
      email: users.invitee.email,
      status: 'invited',
      created_date: today
    },
    {
      id: randomUUID(),
      workspace_id: workspaces.hidden,
      profile_id: users.outsider.id,
      name: users.outsider.name,
      email: users.outsider.email,
      status: 'active',
      created_date: today
    }
  ])

  await insertRows('workspace_invitations', [{
    id: invitations.visible,
    workspace_id: workspaces.visible,
    workspace_name: `${prefix} visible workspace`,
    email: users.invitee.email,
    invited_date: today
  }])

  await insertRows('tasks', [
    {
      id: tasks.visible,
      workspace_id: workspaces.visible,
      title: 'Visible task',
      notes: '',
      status: 'open',
      created_by_profile_id: users.owner.id,
      created_by_name: users.owner.name,
      created_date: today
    },
    {
      id: tasks.hidden,
      workspace_id: workspaces.hidden,
      title: 'Hidden task',
      notes: '',
      status: 'open',
      created_by_profile_id: users.outsider.id,
      created_by_name: users.outsider.name,
      created_date: today
    }
  ])
}

export const cleanupSecurityFixture = async (fixture?: SecurityFixture) => {
  if (!fixture) {
    return
  }

  const admin = createAdminClient()

  await admin.from('workspaces').delete().ilike('name', `${fixture.prefix}%`)
  await admin.from('workspace_invitations').delete().ilike('email', `${fixture.prefix}%`)
  await admin.from('workspace_members').delete().ilike('email', `${fixture.prefix}%`)
  await admin.from('profiles').delete().ilike('email', `${fixture.prefix}%`)

  await Promise.all(Object.values(fixture.users)
    .filter((user) => user.id)
    .map((user) => admin.auth.admin.deleteUser(user.id)))
}

export const createSecurityFixture = async () => {
  const prefix = `security-${Date.now()}-${randomUUID().slice(0, 8)}`
  const fixture: SecurityFixture = {
    prefix,
    users: {
      owner: createUser(prefix, 'owner', 'Security Owner'),
      member: createUser(prefix, 'member', 'Security Member'),
      outsider: createUser(prefix, 'outsider', 'Security Outsider'),
      invitee: createUser(prefix, 'invitee', 'Security Invitee')
    },
    invitations: {
      visible: randomUUID()
    },
    tasks: {
      hidden: randomUUID(),
      visible: randomUUID()
    },
    workspaces: {
      hidden: randomUUID(),
      visible: randomUUID()
    }
  }

  try {
    await createUsers(fixture)
    await seedRows(fixture)

    return fixture
  } catch (error) {
    await cleanupSecurityFixture(fixture)
    throw error
  }
}
