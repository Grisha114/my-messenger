import { useState, useEffect } from 'react'
import { supabase } from '../supabase'

export default function GroupSettingsModal({ chat, session, onClose, onUpdated, showToast }) {
  const [members, setMembers] = useState([])
  const [groupName, setGroupName] = useState(chat.name || '')
  const [search, setSearch] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [avatarLoading, setAvatarLoading] = useState(false)
  const [tab, setTab] = useState('info')

  useEffect(() => { loadMembers() }, [])

  async function loadMembers() {
    const { data } = await supabase
      .from('chat_members')
      .select('user_id, profiles(id, full_name, username, avatar_url, online)')
      .eq('chat_id', chat.id)
    setMembers(data?.map(m => m.profiles) || [])
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
    await supabase.from('chat_members').insert({ chat_id: chat.id, user_id: user.id })
    await loadMembers()
    setSearch('')
    setSearchResults([])
    showToast(`${user.full_name} добавлен ✓`)
  }

  async function removeMember(userId) {
    if (userId === session.user.id) {
      if (!confirm('Выйти из группы?')) return
    }
    await supabase.from('chat_members').delete()
      .eq('chat_id', chat.id)
      .eq('user_id', userId)
    if (userId === session.user.id) { onClose(); onUpdated(); return }
    await loadMembers()
    showToast('Участник удалён')
  }

  async function saveGroupName() {
    if (!groupName.trim()) return
    setLoading(true)
    const { data } = await supabase
      .from('chats')
      .update({ name: groupName.trim() })
      .eq('id', chat.id)
      .select()
      .single()
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
    showToast('Фото группы обновлено ✓')
    e.target.value = ''
  }

  const isCreator = chat.created_by === session.user.id

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 440 }}>
        <div className="modal-title">
          ⚙️ Настройки группы
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div className="tabs" style={{ margin: '-4px -28px 20px' }}>
          <button className={`tab${tab === 'info' ? ' active' : ''}`} onClick={() => setTab('info')}>Группа</button>
          <button className={`tab${tab === 'members' ? ' active' : ''}`} onClick={() => setTab('members')}>
            Участники ({members.length})
          </button>
          <button className={`tab${tab === 'add' ? ' active' : ''}`} onClick={() => setTab('add')}>+ Добавить</button>
        </div>

        {tab === 'info' && (
          <div>
            <label htmlFor="group-avatar">
              <div style={{
                width: 80, height: 80, borderRadius: '50%',
                background: chat.avatar_url ? 'transparent' : 'var(--accent)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 30, margin: '0 auto 20px', cursor: 'pointer',
                overflow: 'hidden', border: '2px dashed var(--accent)', position: 'relative'
              }}>
                {chat.avatar_url
                  ? <img src={chat.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : (chat.name || 'G')[0].toUpperCase()
                }
                {avatarLoading && (
                  <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%' }}>
                    <div className="spinner" style={{ width: 20, height: 20 }} />
                  </div>
                )}
              </div>
            </label>
            <input id="group-avatar" type="file" accept="image/*" style={{ display: 'none' }} onChange={changeGroupAvatar} />

            <div className="form-group">
              <label className="form-label">Название группы</label>
              <input
                className="form-input"
                value={groupName}
                onChange={e => setGroupName(e.target.value)}
                placeholder="Название группы"
              />
            </div>
            <button className="btn-primary" onClick={saveGroupName} disabled={loading || !groupName.trim()}>
              {loading ? 'Сохранение...' : 'Сохранить'}
            </button>

            <button
              onClick={() => removeMember(session.user.id)}
              style={{
                width: '100%', marginTop: 12, padding: 12, background: 'rgba(239,68,68,0.1)',
                border: '1px solid rgba(239,68,68,0.3)', borderRadius: 10, color: '#fca5a5',
                cursor: 'pointer', fontSize: 14, fontWeight: 500
              }}
            >
              🚪 Покинуть группу
            </button>
          </div>
        )}

        {tab === 'members' && (
          <div>
            {members.map(member => (
              <div key={member.id} className="user-result">
                <div className="chat-avatar" style={{ width: 40, height: 40, background: member.avatar_url ? 'transparent' : 'var(--accent)', position: 'relative' }}>
                  {member.avatar_url
                    ? <img src={member.avatar_url} alt={member.full_name} />
                    : (member.full_name || '?')[0].toUpperCase()
                  }
                  {member.online && <div className="online-dot" />}
                </div>
                <div className="user-result-info">
                  <div className="user-result-name">
                    {member.full_name}
                    {member.id === chat.created_by && (
                      <span style={{ fontSize: 11, color: 'var(--accent-light)', marginLeft: 6 }}>создатель</span>
                    )}
                    {member.id === session.user.id && (
                      <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 6 }}>ты</span>
                    )}
                  </div>
                  <div className="user-result-username">@{member.username}</div>
                </div>
                {(isCreator && member.id !== session.user.id) && (
                  <button
                    className="btn-sm"
                    onClick={() => removeMember(member.id)}
                    style={{ background: 'rgba(239,68,68,0.15)', color: '#fca5a5', border: 'none' }}
                  >
                    Удалить
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {tab === 'add' && (
          <div>
            <input
              className="form-input"
              placeholder="Поиск по имени или @username"
              value={search}
              onChange={e => searchUsers(e.target.value)}
              style={{ marginBottom: 12 }}
            />
            {searchResults.length === 0 && search.length >= 2 && (
              <p style={{ color: 'var(--text-muted)', fontSize: 14, textAlign: 'center', padding: '20px 0' }}>
                Никого не найдено
              </p>
            )}
            {searchResults.map(user => (
              <div key={user.id} className="user-result">
                <div className="chat-avatar" style={{ width: 40, height: 40 }}>
                  {user.avatar_url
                    ? <img src={user.avatar_url} alt={user.full_name} />
                    : (user.full_name || '?')[0].toUpperCase()
                  }
                </div>
                <div className="user-result-info">
                  <div className="user-result-name">{user.full_name}</div>
                  <div className="user-result-username">@{user.username}</div>
                </div>
                <button className="btn-sm btn-accent" onClick={() => addMember(user)}>
                  + Добавить
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
