import { useRef, useState } from 'react'
import { ArrowRight } from 'lucide-react'
import { authenticateMicrosoftAccount, type AuthUser } from '../services/auth'
import '../styles/LoginScreen.css'
import ThemeToggle from '../../theme/components/ThemeToggle'

type LoginScreenProps = {
  onLogin: (user: AuthUser) => void
}

function LoginScreen({ onLogin }: LoginScreenProps) {
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const microsoftLoginBusy = useRef(false)

  const signInMicrosoft = async () => {
    if (microsoftLoginBusy.current) return
    microsoftLoginBusy.current = true
    setError('')
    setBusy(true)
    try {
      onLogin(await authenticateMicrosoftAccount())
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Não foi possível entrar com a Microsoft.')
    } finally {
      microsoftLoginBusy.current = false
      setBusy(false)
    }
  }

  return (
    <main className="login-screen">
      <ThemeToggle />
      <section className="login-panel" aria-labelledby="login-title">
        <a className="login-brand" href="#login" aria-label="Donato Hospital de Olhos">
          <img src="/donato-eye.svg" alt="" />
          <span><strong>DONATO</strong><small>HOSPITAL DE OLHOS</small></span>
        </a>
        <div className="login-heading">
          <span className="login-eyebrow">CONTROLE DE ATIVOS</span>
          <h1 id="login-title">Acesse sua conta</h1>
          <p>Entre para continuar a conferência dos equipamentos.</p>
        </div>
        <div className="login-form">
          <p>Use sua conta Microsoft corporativa para acessar o sistema.</p>
          {error && <p className="login-error" role="alert">{error}</p>}
          <button className="login-submit" type="button" disabled={busy} onClick={() => void signInMicrosoft()}>
            {busy ? 'Aguarde...' : 'Entrar com Microsoft'} <ArrowRight size={16} />
          </button>
        </div>
      </section>
    </main>
  )
}

export default LoginScreen
