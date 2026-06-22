export const normalizeEmail = (email: string) => email.trim().toLowerCase()

export const nameFromEmail = (email: string) => {
  const [name] = normalizeEmail(email).split('@')

  return name || '__APP_DISPLAY_NAME__ user'
}
