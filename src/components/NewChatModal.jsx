import { useState } from 'react'
import { supabase } from '../supabase'

function Avatar({ name, url, size = 40 }) {
  const letter = (name || '?')[0].toUpperCase()
  const colors = ['#7c3aed','#2563eb','#059669','#dc2626','#d97706','#db2777']
  const color = colors[letter.charCodeAt(0) % colors.length]
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', background: url ? 'transparent' : color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.4, fontWeight: 700, overflow: 'hidden', flexShrink: 0 }}>
      {url ? <img src={url} alt={name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : letter}
    </div>
  )
}

export default function NewChatModal({ session, profile, onClose, onCreated, showToast }) {
  const [tab, setTab] = useState('direct')
  const [search, setSearch] = useState('')
  const [results, setResults] = useState([])
  const [groupName, setGroupName] = useState('')
  const [selectedUsers, setSelectedUsers] = useState([])
  const [loading, setLoading] = useState(false)

  async function searchUsers(q) {
    setSearch(q)
    if (q.length < 2) { setResults([]); return }
    const { data } = await supabase
      .from('profiles').select('id, full_name, username, avatar_url, online')
      .neq('id', session.user.id)
      .or(`username.ilike.%${q}%,full_name.ilike.%${q}%`)
      .limit(10)
    setResults(data || [])
  }

  async function startDirectChat(user) {
    setLoading(true)
    // Check existing direct chat
    const { data: myChats } = await supabase.from('chat_members').select('chat_id').eq('user_id', session.user.id)
    const myChatIds = myChats?.map(c => c.chat_id) || []

    if (myChatIds.length > 0) {
      const { data: shared } = await supabase
        .from('chat_members').select('chat_id, chats(id, type)')
        .eq('user_id', user.id).in('chat_id', myChatIds)
      const existing = shared?.find(c => c.chats?.type === 'direct')
      if (existing) {
        const chatObj = { ...existing.chats, displayName: user.full_name, displayAvatar: user.avatar_url, otherUser: user, type: 'direct' }
        onCreated(chatObj); setLoading(false); return
      }
    }

    const { data: chat } = await supabase.from('chats').insert({ type: 'direct', created_by: session.user.id }).select().single()
    await supabase.from('chat_members').insert([
      { chat_id: chat.id, user_id: session.user.id, role: 'member' },
      { chat_id: chat.id, user_id: user.id, role: 'member' },
    ])
    onCreated({ ...chat, displayName: user.full_name, displayAvatar: user.avatar_url, otherUser: user, type: 'direct' })
    setLoading(false)
  }

  async function createGroupChat() {
    if (!groupName.trim() || selectedUsers.length === 0) { showToast('Введи название и добавь участников'); return }
    setLoading(true)
    const { data: chat } = await supabase.from('chats').insert({ type: 'group', name: groupName.trim(), created_by: session.user.id }).select().single()
    await supabase.from('chat_members').insert([
      { chat_id: chat.id, user_id: session.user.id, role: 'owner' }, // creator = owner
      ...selectedUsers.map(u => ({ chat_id: chat.id, user_id: u.id, role: 'member' }))
    ])
    onCreated({ ...chat, displayName: groupName.trim(), type: 'group', myRole: 'owner', otherMembers: selectedUsers })
    setLoading(false)
  }

  function toggleUser(user) {
    setSelectedUsers(prev => prev.find(u => u.id === user.id) ? prev.filter(u => u.id !== user.id) : [...prev, user])
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-title">Новый чат<button className="modal-close" onClick={onClose}>×</button></div>

        <div className="tabs" style={{ margin: '-4px -28px 20px' }}>
          <button className={`tab${tab === 'direct' ? ' active' : ''}`} onClick={() => setTab('direct')}>💬 Личный</button>
          <button className={`tab${tab === 'group' ? ' active' : ''}`} onClick={() => setTab('group')}>👥 Группа</button>
        </div>

        {tab === 'group' && (
          <div className="form-group">
            <input className="form-input" placeholder="Название группы" value={groupName} onChange={e => setGroupName(e.target.value)} />
          </div>
        )}

        <div className="form-group">
          <input className="form-input" placeholder="Поиск по имени или @username" value={search} onChange={e => searchUsers(e.target.value)} />
        </div>

        {tab === 'group' && selectedUsers.length > 0 && (
          <div style={{ marginBottom: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {selectedUsers.map(u => (
              <span key={u.id} style={{ background: 'var(--accent-glow)', border: '1px solid var(--accent)', borderRadius: 20, padding: '4px 12px', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
                {u.full_name} <span style={{ cursor: 'pointer', opacity: 0.7 }} onClick={() => toggleUser(u)}>×</span>
              </span>
            ))}
          </div>
        )}

        {results.length === 0 && search.length >= 2 && (
          <p style={{ color: 'var(--text-muted)', fontSize: 14, textAlign: 'center', padding: '20px 0' }}>Никого не найдено</p>
        )}

        {results.map(user => (
          <div key={user.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
            <Avatar name={user.full_name} url={user.avatar_url} />
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{user.full_name}</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>@{user.username}</div>
            </div>
            {tab === 'direct'
              ? <button className="btn-sm btn-accent" onClick={() => startDirectChat(user)} disabled={loading}>Написать</button>
              : <button className={`btn-sm ${selectedUsers.find(u => u.id === user.id) ? 'btn-ghost' : 'btn-accent'}`} onClick={() => toggleUser(user)}>
                  {selectedUsers.find(u => u.id === user.id) ? '✓ Добавлен' : '+ Добавить'}
                </button>
            }
          </div>
        ))}

        {tab === 'group' && (
          <button className="btn-primary" style={{ marginTop: 16 }} onClick={createGroupChat} disabled={loading || selectedUsers.length === 0 || !groupName.trim()}>
            {loading ? 'Создание...' : 'Создать группу'}
          </button>
        )}
      </div>
    </div>
  )
}
