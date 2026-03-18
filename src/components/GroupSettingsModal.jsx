import { useState, useEffect } from 'react'
import { supabase } from '../supabase'

const ROLE_LABELS = { owner: '👑 Владелец', admin: '⭐ Админ', member: '👤 Участник' }
const ROLE_COLORS = { owner: '#f59e0b', admin: '#7c3aed', member: 'var(--text-muted)' }

export default function GroupSettingsModal({ chat, session, myRole, onClose, onUpdated, showToast }) {
  const [members, setMembers] = useState([])
  const [groupName, setGroupName] = useState(chat.name || '')
  const [search, setSearch] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [avatarLoading, setAvatarLoading] = useState(false)
  const [tab, setTab] = useState('info')
  const [roleMenu, setRoleMenu] = useState(null)

  useEffect(() => { loadMembers() }, [])

  async function loadMembers() {
    const { data } = await supabase
      .from('chat_members')
      .select('user_id, role, profiles(id, full_name, username, avatar_url, online, last_seen)')
      .eq('chat_id', chat.id)
    setMembers(data?.map(m => ({ ...m.profiles, role: m.role || 'member' })) || [])
  }

  async function searchUsers(q) {
    setSearch(q)
    if (q.length < 2) { setSearchResults([]); return }
    const { data } = await supabase
      .from('profiles')
      .select('id, full_name, username, avatar_url')
      .neq('id', session.user.id)
      .or(`username.ilike.%${q}%,full_name.ilike.%${q}%`)
      .limit(8)
    const memberIds = members.map(m => m.id)
    setSearchResults(data?.filter(u => !memberIds.includes(u.id)) || [])
  }

  async function addMember(user) {
    await supabase.from('chat_members').insert({ chat_id: chat.id, user_id: user.id, role: 'member' })
    await loadMembers()
    setSearch('')
    setSearchResults([])
    showToast(`${user.full_name} добавлен ✓`)
  }

  async function removeMember(userId) {
    if (userId === session.user.id) {
      if (!window.confirm('Покинуть группу?')) return
      await supabase.from('chat_members').delete().eq('chat_id', chat.id).eq('user_id', userId)
      onClose()
      onUpdated(null)
      return
    }
    await supabase.from('chat_members').delete().eq('chat_id', chat.id).eq('user_id', userId)
    await loadMembers()
    showToast('Участник удалён')
  }

  async function changeRole(userId, newRole) {
    await supabase.from('chat_members').update({ role: newRole }).eq('chat_id', chat.id).eq('user_id', userId)
    await loadMembers()
    setRoleMenu(null)
    showToast(`Роль изменена на ${ROLE_LABELS[newRole]}`)
  }

  async function saveGroupName() {
    if (!groupName.trim()) return
    setLoading(true)
    const { data } = await supabase.from('chats').update({ name: groupName.trim() }).eq('id', chat.id).select().single()
    onUpdated(data)
    showToast('Название обновлено ✓')
    setLoading(false)
  }

  async function changeGroupAvatar(e) {
    const file = e.target.files[0]
    if (!file) return
    setAvatarLoading(true)
    const ext = file.name.split('.').pop()
    const fileName = `group_${chat.id}.${ext}`
    await supabase.storage.from('avatars').upload(fileName, file, { upsert: true })
    const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(fileName)
    const url = publicUrl + '?t=' + Date.now()
    const { data } = await supabase.from('chats').update({ avatar_url: url }).eq('id', chat.id).select().single()
    onUpdated(data)
    setAvatarLoading(false)
    showToast('Фото обновлено ✓')
    e.target.value = ''
  }

  const canManage = myRole === 'owner' || myRole === 'admin'

  function Avatar({ user, size = 40 }) {
    const letter = (user.full_name || '?')[0].toUpperCase()
    const colors = ['#7c3aed','#2563eb','#059669','#dc2626','#d97706','#db2777']
    const color = colors[letter.charCodeAt(0) % colors.length]
    return (
      <div style={{ width: size, height: size, borderRadius: '50%', background: user.avatar_url ? 'transparent' : color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.4, fontWeight: 600, overflow: 'hidden', flexShrink: 0, position: 'relative' }}>
        {user.avatar_url ? <img src={user.avatar_url} alt={user.full_name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : letter}
        {user.online && <div style={{ position: 'absolute', bottom: 1, right: 1, width: 10, height: 10, background: '#22c55e', borderRadius: '50%', border: '2px solid var(--bg-card)' }} />}
      </div>
    )
  }

  return (
    <div className="modal-overlay" onClick={e => { e.target === e.currentTarget && onClose(); setRoleMenu(null) }}>
      <div className="modal" style={{ maxWidth: 460 }}>
        <div className="modal-title">
          ⚙️ Настройки группы
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div className="tabs" style={{ margin: '-4px -28px 20px' }}>
          <button className={`tab${tab === 'info' ? ' active' : ''}`} onClick={() => setTab('info')}>Группа</button>
          <button className={`tab${tab === 'members' ? ' active' : ''}`} onClick={() => setTab('members')}>Участники ({members.length})</button>
          {canManage && <button className={`tab${tab === 'add' ? ' active' : ''}`} onClick={() => setTab('add')}>+ Добавить</button>}
        </div>

        {/* Info tab */}
        {tab === 'info' && (
          <div>
            <label htmlFor="group-avatar-input">
              <div style={{ width: 86, height: 86, borderRadius: '50%', background: chat.avatar_url ? 'transparent' : 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32, margin: '0 auto 20px', cursor: canManage ? 'pointer' : 'default', overflow: 'hidden', border: '2px dashed var(--accent)', position: 'relative' }}>
                {chat.avatar_url
                  ? <img src={chat.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : (chat.name || 'G')[0].toUpperCase()
                }
                {avatarLoading && <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%' }}><div className="spinner" style={{ width: 20, height: 20 }} /></div>}
              </div>
            </label>
            {canManage && <input id="group-avatar-input" type="file" accept="image/*" style={{ display: 'none' }} onChange={changeGroupAvatar} />}

            <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 13, marginBottom: 20 }}>
              {members.length} участников · Создана {new Date(chat.created_at).toLocaleDateString('ru')}
            </div>

            {canManage ? (
              <>
                <div className="form-group">
                  <label className="form-label">Название группы</label>
                  <input className="form-input" value={groupName} onChange={e => setGroupName(e.target.value)} />
                </div>
                <button className="btn-primary" onClick={saveGroupName} disabled={loading || !groupName.trim()}>
                  {loading ? 'Сохранение...' : 'Сохранить изменения'}
                </button>
              </>
            ) : (
              <div style={{ textAlign: 'center', fontSize: 18, fontWeight: 700, marginBottom: 20 }}>{chat.name}</div>
            )}

            <button onClick={() => removeMember(session.user.id)} style={{
              width: '100%', marginTop: 12, padding: 12,
              background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
              borderRadius: 10, color: '#fca5a5', cursor: 'pointer', fontSize: 14, fontWeight: 500
            }}>🚪 Покинуть группу</button>
          </div>
        )}

        {/* Members tab */}
        {tab === 'members' && (
          <div style={{ position: 'relative' }}>
            {members.map(member => (
              <div key={member.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                <Avatar user={member} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
                    {member.full_name}
                    {member.id === session.user.id && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>ты</span>}
                  </div>
                  <div style={{ fontSize: 12, color: ROLE_COLORS[member.role] || 'var(--text-muted)' }}>
                    {ROLE_LABELS[member.role] || '👤 Участник'}
                  </div>
                </div>

                {/* Role + remove buttons (only owner/admin, not self, not other owner) */}
                {canManage && member.id !== session.user.id && member.role !== 'owner' && (
                  <div style={{ display: 'flex', gap: 6, position: 'relative' }}>
                    <button className="btn-sm btn-ghost" onClick={() => setRoleMenu(roleMenu === member.id ? null : member.id)}>
                      {member.role === 'admin' ? '⭐' : '👤'} ▾
                    </button>
                    <button className="btn-sm" onClick={() => removeMember(member.id)}
                      style={{ background: 'rgba(239,68,68,0.15)', color: '#fca5a5', border: 'none' }}>
                      Удалить
                    </button>

                    {roleMenu === member.id && (
                      <div style={{ position: 'absolute', right: 0, top: '110%', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', zIndex: 10, minWidth: 160, boxShadow: '0 8px 24px rgba(0,0,0,0.4)' }}>
                        {myRole === 'owner' && (
                          <button onClick={() => changeRole(member.id, 'admin')} style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '10px 14px', background: 'none', border: 'none', color: 'var(--text-primary)', cursor: 'pointer', fontSize: 13 }}
                            onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-input)'}
                            onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                            ⭐ Сделать админом
                          </button>
                        )}
                        <button onClick={() => changeRole(member.id, 'member')} style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '10px 14px', background: 'none', border: 'none', color: 'var(--text-primary)', cursor: 'pointer', fontSize: 13 }}
                          onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-input)'}
                          onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                          👤 Обычный участник
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Add tab */}
        {tab === 'add' && canManage && (
          <div>
            <input className="form-input" placeholder="Поиск по имени или @username" value={search}
              onChange={e => searchUsers(e.target.value)} style={{ marginBottom: 12 }} />
            {searchResults.length === 0 && search.length >= 2 && (
              <p style={{ color: 'var(--text-muted)', fontSize: 14, textAlign: 'center', padding: '20px 0' }}>Никого не найдено</p>
            )}
            {searchResults.map(user => (
              <div key={user.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 600, overflow: 'hidden' }}>
                  {user.avatar_url ? <img src={user.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : (user.full_name || '?')[0].toUpperCase()}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{user.full_name}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>@{user.username}</div>
                </div>
                <button className="btn-sm btn-accent" onClick={() => addMember(user)}>+ Добавить</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
