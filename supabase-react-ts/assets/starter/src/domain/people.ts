export const normalizeEmail = (email: string) => email.trim().toLowerCase()

export const nameFromEmail = (email: string) => {
  const [localPart] = normalizeEmail(email).split('@')

  return localPart
    .split(/[._-]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ') || 'Friend'
}
