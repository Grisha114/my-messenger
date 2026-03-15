import { useState } from 'react'
import { supabase } from '../supabase'

export default function AuthPage() {
  const [mode, setMode] = useState('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [inviteCode, setInviteCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleLogin(e) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setError('Неверный email или пароль')
    setLoading(false)
  }

  async function handleRegister(e) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const code = inviteCode.trim().toUpperCase()

    // Check invite code
    const { data: invite, error: invErr } = await supabase
      .from('invite_codes')
      .select('*')
      .eq('code', code)
      .single()

    if (invErr || !invite) {
      setError('Неверный инвайт-код. Попроси у Гриши.')
      setLoading(false)
      return
    }

    if (invite.is_used && invite.max_uses <= invite.uses_count) {
      setError('Этот инвайт-код уже использован.')
      setLoading(false)
      return
    }

    if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
      setError('Срок действия инвайт-кода истёк.')
      setLoading(false)
      return
    }

    const { error } = await supabase.auth.signUp({ email, password })
    if (error) {
      setError(error.message === 'User already registered' ? 'Этот email уже зарегистрирован.' : error.message)
      setLoading(false)
      return
    }

    // Mark invite as used
    await supabase.from('invite_codes').update({
      uses_count: (invite.uses_count || 0) + 1,
      is_used: true
    }).eq('code', code)

    setLoading(false)
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-logo">💬</div>
        <h1 className="auth-title">GrishaChat</h1>
        <p className="auth-subtitle">
          {mode === 'login' ? 'Войди в свой аккаунт' : 'Регистрация по инвайту'}
        </p>

        {error && <div className="error-msg">{error}</div>}

        <form onSubmit={mode === 'login' ? handleLogin : handleRegister}>
          {mode === 'register' && (
            <div className="form-group">
              <label className="form-label">Инвайт-код</label>
              <input
                className="form-input"
                type="text"
                placeholder="XXXXXXXX"
                value={inviteCode}
                onChange={e => setInviteCode(e.target.value.toUpperCase())}
                required
                style={{ letterSpacing: '3px', textTransform: 'uppercase' }}
              />
            </div>
          )}

          <div className="form-group">
            <label className="form-label">Email</label>
            <input
              className="form-input"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">Пароль</label>
            <input
              className="form-input"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              minLength={6}
            />
          </div>

          <button className="btn-primary" type="submit" disabled={loading}>
            {loading ? 'Загрузка...' : mode === 'login' ? 'Войти' : 'Зарегистрироваться'}
          </button>
        </form>

        <div className="auth-switch">
          {mode === 'login' ? (
            <>Нет аккаунта? <span onClick={() => { setMode('register'); setError('') }}>Зарегистрироваться</span></>
          ) : (
            <>Уже есть аккаунт? <span onClick={() => { setMode('login'); setError('') }}>Войти</span></>
          )}
        </div>
      </div>
    </div>
  )
}
