import { useState, useEffect } from 'react'
import { supabase } from '../supabase'

export default function AuthPage() {
  const [mode, setMode] = useState('login')
  const [email, setEmail] = useState('')
  const [pw, setPw] = useState('')
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')

  // Auto-fill invite code from URL
  useEffect(() => {
    const p = new URLSearchParams(window.location.search)
    if (p.get('invite')) { setCode(p.get('invite')); setMode('register') }
  }, [])

  async function login(e) {
    e.preventDefault(); setLoading(true); setErr('')
    const { error } = await supabase.auth.signInWithPassword({ email, password: pw })
    if (error) setErr('Неверный email или пароль')
    setLoading(false)
  }

  async function register(e) {
    e.preventDefault(); setLoading(true); setErr('')
    const c = code.trim().toUpperCase()
    const { data: inv, error: invErr } = await supabase.from('invite_codes').select('*').eq('code', c).single()
    if (invErr || !inv) { setErr('Неверный инвайт-код'); setLoading(false); return }
    if (inv.is_used && inv.uses_count >= inv.max_uses) { setErr('Инвайт-код уже использован'); setLoading(false); return }
    if (inv.expires_at && new Date(inv.expires_at) < new Date()) { setErr('Инвайт-код истёк'); setLoading(false); return }
    const { error } = await supabase.auth.signUp({ email, password: pw })
    if (error) { setErr(error.message === 'User already registered' ? 'Email уже занят' : error.message); setLoading(false); return }
    await supabase.from('invite_codes').update({ uses_count: (inv.uses_count||0)+1, is_used:true }).eq('code', c)
    setLoading(false)
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-logo">💬</div>
        <h1 className="auth-title">GrishaChat</h1>
        <p className="auth-sub">{mode==='login' ? 'Войди в аккаунт' : 'Регистрация по инвайту'}</p>
        {err && <div className="err">{err}</div>}
        <form onSubmit={mode==='login' ? login : register}>
          {mode==='register' && (
            <div className="f-group">
              <label className="f-label">Инвайт-код</label>
              <input className="f-input" value={code} onChange={e=>setCode(e.target.value.toUpperCase())} placeholder="XXXXXXXX" required style={{letterSpacing:3,textTransform:'uppercase'}}/>
            </div>
          )}
          <div className="f-group">
            <label className="f-label">Email</label>
            <input className="f-input" type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@email.com" required/>
          </div>
          <div className="f-group">
            <label className="f-label">Пароль</label>
            <input className="f-input" type="password" value={pw} onChange={e=>setPw(e.target.value)} placeholder="••••••••" required minLength={6}/>
          </div>
          <button className="btn-primary" type="submit" disabled={loading}>
            {loading ? 'Загрузка...' : mode==='login' ? 'Войти' : 'Зарегистрироваться'}
          </button>
        </form>
        <div className="auth-switch">
          {mode==='login' ? (<>Нет аккаунта? <span onClick={()=>{setMode('register');setErr('')}}>Зарегистрироваться</span></>) : (<>Есть аккаунт? <span onClick={()=>{setMode('login');setErr('')}}>Войти</span></>)}
        </div>
      </div>
    </div>
  )
}
