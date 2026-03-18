import { useState } from 'react'
import { supabase } from '../supabase'

export default function ProfileModal({ profile, session, onClose, onUpdate, showToast }) {
  const [fullName, setFullName] = useState(profile.full_name || '')
  const [bio, setBio] = useState(profile.bio || '')
  const [loading, setLoading] = useState(false)
  const [avatarLoading, setAvatarLoading] = useState(false)

  async function saveProfile() {
    setLoading(true)
    const { data, error } = await supabase.from('profiles').update({ full_name: fullName.trim(), bio: bio.trim() }).eq('id', session.user.id).select().single()
    if (!error) { onUpdate(data); showToast('Профиль обновлён ✓') }
    setLoading(false)
  }

  async function changeAvatar(e) {
    const file = e.target.files[0]
    if (!file) return
    setAvatarLoading(true)
    const ext = file.name.split('.').pop()
    const fileName = `${session.user.id}.${ext}`
    await supabase.storage.from('avatars').upload(fileName, file, { upsert: true })
    const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(fileName)
    const { data } = await supabase.from('profiles').update({ avatar_url: publicUrl + '?t=' + Date.now() }).eq('id', session.user.id).select().single()
    onUpdate(data)
    setAvatarLoading(false)
    showToast('Фото обновлено ✓')
    e.target.value = ''
  }

  const letter = (profile.full_name || '?')[0].toUpperCase()
  const colors = ['#7c3aed','#2563eb','#059669','#dc2626','#d97706','#db2777']
  const color = colors[letter.charCodeAt(0) % colors.length]

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-title">Мой профиль<button className="modal-close" onClick={onClose}>×</button></div>

        <label htmlFor="avatar-change" style={{ cursor: 'pointer' }}>
          <div style={{ width: 86, height: 86, borderRadius: '50%', background: profile.avatar_url ? 'transparent' : color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 34, fontWeight: 700, margin: '0 auto 16px', overflow: 'hidden', border: '2px dashed var(--accent)', position: 'relative' }}>
            {profile.avatar_url ? <img src={profile.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : letter}
            {avatarLoading && <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%' }}><div className="spinner" style={{ width: 22, height: 22 }} /></div>}
          </div>
        </label>
        <input id="avatar-change" type="file" accept="image/*" style={{ display: 'none' }} onChange={changeAvatar} />

        <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 13, marginBottom: 20 }}>@{profile.username}</p>

        <div className="form-group">
          <label className="form-label">Имя</label>
          <input className="form-input" value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Твоё имя" />
        </div>

        <div className="form-group">
          <label className="form-label">О себе</label>
          <textarea className="form-input" value={bio} onChange={e => setBio(e.target.value)} placeholder="Расскажи о себе..." rows={3} style={{ resize: 'vertical' }} />
        </div>

        <button className="btn-primary" onClick={saveProfile} disabled={loading}>
          {loading ? 'Сохранение...' : 'Сохранить'}
        </button>
      </div>
    </div>
  )
}
