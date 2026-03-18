import { useState } from 'react'
import { supabase } from '../supabase'

function formatLastSeen(ts, online) {
  if (online) return '● В сети'
  if (!ts) return 'не в сети'
  const d = new Date(ts), now = new Date(), diff = now - d
  if (diff < 60000) return 'был(а) только что'
  if (diff < 3600000) return `был(а) ${Math.floor(diff / 60000)} мин назад`
  if (d.toDateString() === now.toDateString())
    return `был(а) сегодня в ${d.toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' })}`
  const y = new Date(now); y.setDate(y.getDate() - 1)
  if (d.toDateString() === y.toDateString())
    return `был(а) вчера в ${d.toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' })}`
  return `был(а) ${d.toLocaleDateString('ru', { day: 'numeric', month: 'long' })}`
}

export default function UserProfileModal({ user, session, onClose, onStartChat, showToast }) {
  const [loading, setLoading] = useState(false)

  async function startChat() {
    setLoading(true)
    const { data: myChats } = await supabase.from('chat_members').select('chat_id').eq('user_id', session.user.id)
    const myChatIds = myChats?.map(c => c.chat_id) || []

    if (myChatIds.length > 0) {
      const { data: shared } = await supabase.from('chat_members').select('chat_id, chats(id, type)').eq('user_id', user.id).in('chat_id', myChatIds)
      const existing = shared?.find(c => c.chats?.type === 'direct')
      if (existing) {
        onStartChat({ ...existing.chats, displayName: user.full_name, displayAvatar: user.avatar_url, otherUser: user, type: 'direct' })
        setLoading(false); return
      }
    }

    const { data: chat } = await supabase.from('chats').insert({ type: 'direct', created_by: session.user.id }).select().single()
    await supabase.from('chat_members').insert([
      { chat_id: chat.id, user_id: session.user.id, role: 'member' },
      { chat_id: chat.id, user_id: user.id, role: 'member' },
    ])
    onStartChat({ ...chat, displayName: user.full_name, displayAvatar: user.avatar_url, otherUser: user, type: 'direct' })
    setLoading(false)
  }

  const letter = (user.full_name || '?')[0].toUpperCase()
  const colors = ['#7c3aed','#2563eb','#059669','#dc2626','#d97706','#db2777']
  const color = colors[letter.charCodeAt(0) % colors.length]

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ textAlign: 'center' }}>
        <div className="modal-title" style={{ justifyContent: 'flex-end' }}>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div style={{ width: 90, height: 90, borderRadius: '50%', background: user.avatar_url ? 'transparent' : color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 36, fontWeight: 700, margin: '0 auto 16px', overflow: 'hidden', boxShadow: '0 4px 20px rgba(0,0,0,0.3)' }}>
          {user.avatar_url ? <img src={user.avatar_url} alt={user.full_name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : letter}
        </div>

        <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>{user.full_name}</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: 14, marginBottom: 8 }}>@{user.username}</p>
        <p style={{ fontSize: 13, color: user.online ? '#22c55e' : 'var(--text-secondary)', marginBottom: 20 }}>
          {formatLastSeen(user.last_seen, user.online)}
        </p>

        {user.bio && (
          <div style={{ background: 'var(--bg-input)', borderRadius: 12, padding: '12px 16px', marginBottom: 20, textAlign: 'left' }}>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 4 }}>О себе</p>
            <p style={{ fontSize: 15 }}>{user.bio}</p>
          </div>
        )}

        {user.id !== session.user.id && (
          <button className="btn-primary" onClick={startChat} disabled={loading}>
            {loading ? 'Открытие...' : '💬 Написать'}
          </button>
        )}
      </div>
    </div>
  )
}
