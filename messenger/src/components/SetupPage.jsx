import { useState } from 'react'
import { supabase } from '../supabase'

export default function SetupPage({ session, onDone }) {
  const [username, setUsername] = useState('')
  const [fullName, setFullName] = useState('')
  const [avatar, setAvatar] = useState(null)
  const [avatarPreview, setAvatarPreview] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  function handleAvatarChange(e) {
    const file = e.target.files[0]
    if (!file) return
    setAvatar(file)
    setAvatarPreview(URL.createObjectURL(file))
  }

  async function handleSetup(e) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const user = session.user
    const uname = username.toLowerCase().trim().replace(/[^a-z0-9_]/g, '')

    if (uname.length < 3) {
      setError('Имя пользователя должно быть минимум 3 символа (латиница, цифры, _)')
      setLoading(false)
      return
    }

    // Check username uniqueness
    const { data: existing } = await supabase
      .from('profiles')
      .select('id')
      .eq('username', uname)
      .single()

    if (existing) {
      setError('Это имя пользователя уже занято')
      setLoading(false)
      return
    }

    let avatarUrl = null

    if (avatar) {
      const ext = avatar.name.split('.').pop()
      const fileName = `${user.id}.${ext}`
      const { error: uploadErr } = await supabase.storage
        .from('avatars')
        .upload(fileName, avatar, { upsert: true })

      if (!uploadErr) {
        const { data: { publicUrl } } = supabase.storage
          .from('avatars')
          .getPublicUrl(fileName)
        avatarUrl = publicUrl
      }
    }

    const { data: profile, error: profileErr } = await supabase
      .from('profiles')
      .insert({
        id: user.id,
        username: uname,
        full_name: fullName.trim() || uname,
        avatar_url: avatarUrl,
        online: true
      })
      .select()
      .single()

    if (profileErr) {
      setError('Ошибка создания профиля. Попробуй ещё раз.')
      setLoading(false)
      return
    }

    onDone(profile)
  }

  return (
    <div className="setup-page">
      <div className="auth-card">
        <h1 className="auth-title">Настрой профиль</h1>
        <p className="auth-subtitle">Это видят все твои друзья</p>

        {error && <div className="error-msg">{error}</div>}

        <form onSubmit={handleSetup}>
          <label htmlFor="avatar-upload">
            <div className="avatar-upload">
              {avatarPreview
                ? <img src={avatarPreview} alt="avatar" />
                : <span>📷</span>
              }
            </div>
          </label>
          <input
            id="avatar-upload"
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={handleAvatarChange}
          />

          <div className="form-group">
            <label className="form-label">Имя пользователя (@username)</label>
            <input
              className="form-input"
              type="text"
              placeholder="grisha114"
              value={username}
              onChange={e => setUsername(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">Отображаемое имя</label>
            <input
              className="form-input"
              type="text"
              placeholder="Гриша"
              value={fullName}
              onChange={e => setFullName(e.target.value)}
            />
          </div>

          <button className="btn-primary" type="submit" disabled={loading}>
            {loading ? 'Сохранение...' : 'Готово →'}
          </button>
        </form>
      </div>
    </div>
  )
}
