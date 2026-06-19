export type ProfileRow = {
  id: string
  email: string
  display_name: string
  created_date: string
}

export type WorkspaceRow = {
  id: string
  name: string
  created_by_profile_id: string
  created_date: string
}

export type MemberRow = {
  id: string
  workspace_id: string
  profile_id?: string | null
  name: string
  email: string
  status: 'active' | 'invited'
}

export type InvitationRow = {
  id: string
  workspace_id: string
  workspace_name: string
  email: string
  invited_date: string
}

export type TaskRow = {
  id: string
  workspace_id: string
  title: string
  notes: string
  status: 'open' | 'done'
  created_by_profile_id?: string | null
  created_by_name?: string | null
  created_date: string
  updated_date?: string | null
}
