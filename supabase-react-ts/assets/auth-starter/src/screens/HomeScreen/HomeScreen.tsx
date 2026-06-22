import { Section } from '../../../lib/ui/Section/Section'
import { useAuthContext } from '../../contexts/AuthContext'
import styles from './HomeScreen.module.scss'

export const HomeScreen = () => {
  const { currentAccount } = useAuthContext()

  return (
    <section className={styles.screen} aria-labelledby="home-title">
      <header className={styles.header}>
        <p>{currentAccount?.email}</p>
        <h2 id="home-title">Welcome to __APP_DISPLAY_NAME__</h2>
      </header>

      <Section title="Journey">
        <p className={styles.copy}>
          __APP_WELCOME_COPY__
        </p>
      </Section>
    </section>
  )
}
