import { useState } from 'react'
import { supabase } from '../supabase'

function formatTime(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  const now = new Date()
  const diff = now - d
  if (diff < 86400000) return d.toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' })
  if (diff < 604800000) return d.toLocaleDateString('ru', { weekday: 'short' })
  return d.toLocaleDateString('ru', { day: '2-digit', month: '2-digit' })
}

function Avatar({ name, url, online, size = 48 }) {
  const letter = (name || '?')[0].toUpperCase()
  const colors = ['#7c3aed','#2563eb','#059669','#dc2626','#d97706','#db2777']
  const color = colors[letter.charCodeAt(0) % colors.length]

  return (
    <div className="chat-avatar" style={{ width: size, height: size, background: url ? 'transparent' : color }}>
      {url ? <img src={url} alt={name} /> : letter}
      {online && <div className="online-dot" />}
    </div>
  )
}

export default function Sidebar({ profile, chats, activeChat, onSelectChat, onNewChat, onProfileClick, onAdminClick, onRefresh, hidden }) {
  const [search, setSearch] = useState('')

  const filtered = chats.filter(c =>
    c.displayName?.toLowerCase().includes(search.toLowerCase())
  )

  async function handleLogout() {
    await supabase.from('profiles').update({ online: false }).eq('id', profile.id)
    await supabase.auth.signOut()
  }

  return (
    <div className={`sidebar${hidden ? ' hidden' : ''}`}>
      <div className="sidebar-header">
        <span className="sidebar-title">💬 GrishaChat</span>
        <button className="icon-btn" onClick={onNewChat} title="Новый чат">✏️</button>
        <button className="icon-btn" onClick={onAdminClick} title="Инвайты">🔑</button>
      </div>

      <div className="search-box">
        <div className="search-wrap">
          <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
          </svg>
          <input
            className="search-input"
            placeholder="Поиск чатов..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="chat-list">
        {filtered.length === 0 && (
          <div className="empty-state">
            <div className="icon">💬</div>
            <p>{search ? 'Ничего не найдено' : 'Нет чатов. Начни общение!'}</p>
          </div>
        )}

        {filtered.map(chat => (
          <div
            key={chat.id}
            className={`chat-item${activeChat?.id === chat.id ? ' active' : ''}`}
            onClick={() => onSelectChat(chat)}
          >
            <Avatar
              name={chat.displayName}
              url={chat.displayAvatar}
              online={chat.isOnline}
            />
            <div className="chat-info">
              <div className="chat-name">{chat.displayName}</div>
              <div className="chat-preview">
                {chat.lastMsg
                  ? chat.lastMsg.file_type === 'image'
                    ? '🖼 Фото'
                    : chat.lastMsg.file_type === 'file'
                      ? '📎 Файл'
                      : chat.lastMsg.content
                  : 'Нет сообщений'}
              </div>
            </div>
            <div className="chat-meta">
              <span className="chat-time">{formatTime(chat.lastMsg?.created_at)}</span>
              {chat.unread > 0 && <span className="unread-badge">{chat.unread}</span>}
            </div>
          </div>
        ))}
      </div>

      <div className="sidebar-footer">
        <div className="user-avatar-sm" onClick={onProfileClick}>
          {profile.avatar_url
            ? <img src={profile.avatar_url} alt={profile.full_name} />
            : (profile.full_name || '?')[0].toUpperCase()
          }
        </div>
        <div className="user-info-sm" onClick={onProfileClick}>
          <div className="user-name-sm">{profile.full_name}</div>
          <div className="user-status-sm">● В сети</div>
        </div>
        <button className="icon-btn" onClick={handleLogout} title="Выйти">🚪</button>
      </div>
    </div>
  )
}
