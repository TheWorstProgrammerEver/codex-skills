import { type ReactNode, useRef, useState } from 'react'
import {
  getDefaultAuthenticationType,
  getEnabledAuthenticationTypes,
  type AuthenticationType,
  type SupportedAuthenticationTypes
} from '../../auth/authenticationTypes'
import styles from './AuthPanel.module.scss'

type AuthPanelProps = {
  appName: ReactNode
  busy?: boolean
  environment: ReactNode
  error?: string
  notice?: string
  onCreateAccount: (email: string, name: string, password: string) => void | Promise<void>
  onMagicLink: (email: string, name: string) => void | Promise<void>
  onOtpRequest: (email: string, name: string) => void | Promise<void>
  onOtpVerify: (email: string, name: string, token: string) => void | Promise<void>
  onSignIn: (email: string, password: string) => void | Promise<void>
  onStatusClear: () => void
  supportedTypes: SupportedAuthenticationTypes
}

const authTypeLabel: Record<AuthenticationType, string> = {
  emailPassword: 'Email + password',
  magicLink: 'Magic link',
  otp: 'One-time code'
}

export const AuthPanel = ({
  appName,
  busy = false,
  environment,
  error,
  notice,
  onCreateAccount,
  onMagicLink,
  onOtpRequest,
  onOtpVerify,
  onSignIn,
  onStatusClear,
  supportedTypes
}: AuthPanelProps) => {
  const formRef = useRef<HTMLFormElement>(null)
  const enabledTypes = getEnabledAuthenticationTypes(supportedTypes)
  const [selectedType, setSelectedType] = useState(() => getDefaultAuthenticationType(supportedTypes))
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [otpSent, setOtpSent] = useState(false)
  const [otpToken, setOtpToken] = useState('')

  const chooseType = (type: AuthenticationType) => {
    setSelectedType(type)
    setOtpSent(false)
    setOtpToken('')
    onStatusClear()
  }

  const submit = (intent: 'create' | 'request-otp' | 'sign-in' | 'verify-otp') => {
    if (!formRef.current?.reportValidity()) {
      return
    }

    onStatusClear()

    if (selectedType === 'emailPassword' && intent === 'create') {
      void onCreateAccount(email, name, password)
      return
    }

    if (selectedType === 'emailPassword') {
      void onSignIn(email, password)
      return
    }

    if (selectedType === 'magicLink') {
      void onMagicLink(email, name)
      return
    }

    if (intent === 'verify-otp') {
      void onOtpVerify(email, name, otpToken)
      return
    }

    setOtpSent(true)
    void onOtpRequest(email, name)
  }

  return (
    <section className={styles.panel} aria-labelledby="auth-title">
      <header>
        <p>{environment}</p>
        <h1 id="auth-title">{appName}</h1>
      </header>

      <form ref={formRef} onSubmit={(event) => {
        event.preventDefault()
        submit(selectedType === 'otp' && otpSent ? 'verify-otp' : 'sign-in')
      }}>
        {enabledTypes.length > 1 && (
          <fieldset className={styles.typeSelector}>
            <legend>Method</legend>
            {enabledTypes.map((type) => (
              <label key={type}>
                <input
                  checked={selectedType === type}
                  name="authenticationType"
                  type="radio"
                  value={type}
                  onChange={() => chooseType(type)}
                />
                {authTypeLabel[type]}
              </label>
            ))}
          </fieldset>
        )}

        <label>
          Email
          <input
            autoComplete="email"
            inputMode="email"
            required
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>

        <label>
          Name
          <input
            autoComplete="name"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </label>

        {selectedType === 'emailPassword' && (
          <label>
            Password
            <input
              autoComplete="current-password"
              minLength={6}
              required
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
        )}

        {selectedType === 'otp' && otpSent && (
          <label>
            One-time code
            <input
              autoComplete="one-time-code"
              inputMode="numeric"
              required
              value={otpToken}
              onChange={(event) => setOtpToken(event.target.value)}
            />
          </label>
        )}

        {error && <p className={styles.error} role="alert">{error}</p>}
        {notice && <p className={styles.notice} role="status">{notice}</p>}

        <div className={styles.actions}>
          {selectedType === 'emailPassword' && (
            <>
              <button type="submit" disabled={busy}>Sign in</button>
              <button type="button" disabled={busy} onClick={() => submit('create')}>Create account</button>
            </>
          )}

          {selectedType === 'otp' && (
            <>
              <button type="submit" disabled={busy}>{otpSent ? 'Verify code' : 'Send code'}</button>
              {otpSent && (
                <button type="button" disabled={busy} onClick={() => submit('request-otp')}>Send new code</button>
              )}
            </>
          )}

          {selectedType === 'magicLink' && (
            <button type="submit" disabled={busy}>Send magic link</button>
          )}
        </div>
      </form>
    </section>
  )
}
