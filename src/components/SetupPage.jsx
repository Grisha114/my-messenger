import { useState } from 'react'
import { supabase } from '../supabase'

export default function SetupPage({ session, onDone }) {
  const [username, setUsername] = useState('')
  const [fullName, setFullName] = useState('')
  const [avatar, setAvatar] = useState(null)
  const [preview, setPreview] = useState(null)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')

  function pickAvatar(e) {
    const f = e.target.files[0]; if (!f) return
    setAvatar(f); setPreview(URL.createObjectURL(f))
  }

  async function submit(e) {
    e.preventDefault(); setLoading(true); setErr('')
    const uname = username.toLowerCase().trim().replace(/[^a-z0-9_]/g,'')
    if (uname.length < 3) { setErr('Username мин. 3 символа (латиница, цифры, _)'); setLoading(false); return }
    const { data: ex } = await supabase.from('profiles').select('id').eq('username', uname).single()
    if (ex) { setErr('Этот username уже занят'); setLoading(false); return }
    let avatarUrl = null
    if (avatar) {
      const ext = avatar.name.split('.').pop()
      const fn = `${session.user.id}.${ext}`
      await supabase.storage.from('avatars').upload(fn, avatar, { upsert:true })
      const { data:{publicUrl} } = supabase.storage.from('avatars').getPublicUrl(fn)
      avatarUrl = publicUrl
    }
    const { data: p, error } = await supabase.from('profiles').insert({ id:session.user.id, username:uname, full_name:(fullName.trim()||uname), avatar_url:avatarUrl, online:true }).select().single()
    if (error) { setErr('Ошибка создания профиля'); setLoading(false); return }
    onDone(p)
  }

  return (
    <div className="setup-page">
      <div className="auth-card">
        <h1 className="auth-title">Настрой профиль</h1>
        <p className="auth-sub">Это видят твои друзья</p>
        {err && <div className="err">{err}</div>}
        <form onSubmit={submit}>
          <label htmlFor="av-pick">
            <div className="av-upload">{preview ? <img src={preview} alt=""/> : '📷'}</div>
          </label>
          <input id="av-pick" type="file" accept="image/*" style={{display:'none'}} onChange={pickAvatar}/>
          <div className="f-group">
            <label className="f-label">Username (@)</label>
            <input className="f-input" placeholder="grisha114" value={username} onChange={e=>setUsername(e.target.value)} required/>
          </div>
          <div className="f-group">
            <label className="f-label">Имя</label>
            <input className="f-input" placeholder="Гриша" value={fullName} onChange={e=>setFullName(e.target.value)}/>
          </div>
          <button className="btn-primary" type="submit" disabled={loading}>{loading ? 'Сохранение...' : 'Готово →'}</button>
        </form>
      </div>
    </div>
  )
}
