import { useState, type FormEvent } from 'react'
import { ArrowRight, Eye, EyeOff, LockKeyhole, Mail } from 'lucide-react'
import { authenticateLocalAccount, type AuthUser } from '../services/auth'
import '../styles/LoginScreen.css'

type LoginScreenProps = {
  onLogin: (user: AuthUser) => void
}

function LoginScreen({ onLogin }: LoginScreenProps) {
  const [createAccount, setCreateAccount] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    setBusy(true)
    try {
      onLogin(await authenticateLocalAccount(email, password, createAccount))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Não foi possível entrar.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="login-screen">
      <section className="login-panel" aria-labelledby="login-title">
        <a className="login-brand" href="#login" aria-label="Donato Hospital de Olhos">
          <img src="/donato-eye.svg" alt="" />
          <span><strong>DONATO</strong><small>HOSPITAL DE OLHOS</small></span>
        </a>
        <div className="login-heading">
          <span className="login-eyebrow">CONTROLE DE ATIVOS</span>
          <h1 id="login-title">{createAccount ? 'Criar acesso' : 'Acesse sua conta'}</h1>
          <p>{createAccount ? 'Cadastre sua conta para acessar o sistema.' : 'Entre para continuar a conferência dos equipamentos.'}</p>
        </div>
        <div className="login-tabs" role="tablist" aria-label="Acesso">
          <button type="button" role="tab" aria-selected={!createAccount} className={!createAccount ? 'login-tab-active' : ''} onClick={() => { setCreateAccount(false); setError('') }}>Entrar</button>
          <button type="button" role="tab" aria-selected={createAccount} className={createAccount ? 'login-tab-active' : ''} onClick={() => { setCreateAccount(true); setError('') }}>Criar conta</button>
        </div>
        <form className="login-form" onSubmit={submit}>
          <label className="login-field"><span>E-mail</span><span className="login-input-wrap"><Mail size={16} /><input type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="exemplo@donatoholhos.com" /></span></label>
          <label className="login-field"><span>Senha</span><span className="login-input-wrap"><LockKeyhole size={16} /><input type={showPassword ? 'text' : 'password'} autoComplete={createAccount ? 'new-password' : 'current-password'} minLength={8} required value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Mínimo de 8 caracteres" /><button className="password-toggle" type="button" aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'} onClick={() => setShowPassword((visible) => !visible)}>{showPassword ? <EyeOff size={16} /> : <Eye size={16} />}</button></span></label>
          {error && <p className="login-error" role="alert">{error}</p>}
          <button className="login-submit" type="submit" disabled={busy}>{busy ? 'Aguarde...' : createAccount ? 'Criar conta' : 'Entrar'} <ArrowRight size={16} /></button>
        </form>
      </section>
    </main>
  )
}

export default LoginScreen