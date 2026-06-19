export class HttpError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message)
  }
}

export const errorMessage = (error: unknown) => (
  error instanceof Error ? error.message : 'Something went wrong.'
)

export const normalizeEmail = (email: string) => email.trim().toLowerCase()

export const nameFromEmail = (email: string) => (
  normalizeEmail(email).split('@')[0]?.replace(/[._-]+/g, ' ') || 'Invited member'
)

export const todayIso = () => new Date().toISOString().slice(0, 10)

export const trimOrDefault = (value: string | undefined, fallback: string) => {
  const trimmed = value?.trim()

  return trimmed || fallback
}

export const uniqueEmails = (emails: string[], excludedEmail: string) => (
  [...new Set(emails.map(normalizeEmail).filter((email) => email && email !== excludedEmail))]
)
