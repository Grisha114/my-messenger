import { useState, useRef, useEffect } from 'react'
import { supabase } from '../supabase'
import { Avatar, formatSidebarTime } from './helpers.jsx'

export default function Sidebar({ profile, chats, activeChat, onSelect, onNewChat, onProfileClick, onAdminClick, onSettings, onDeleteChat, onPinChat, onFavorites, hidden }) {
  const [search, setSearch] = useState('')
  const [ctx, setCtx] = useState(null)
  const [hoverPreview, setHoverPreview] = useState(null) // { chat, previewMsgs }
  const [previewMsgs, setPreviewMsgs] = useState({})
  const longPressTimer = useRef(null)
  const hoverTimer = useRef(null)

  async function logout() {
    await supabase.from('profiles').update({ online: false }).eq('id', profile.id)
    await supabase.auth.signOut()
  }

  function onRightClick(e, chat) {
    e.preventDefault(); e.stopPropagation()
    setCtx({ chat, x: Math.min(e.clientX, window.innerWidth - 210), y: Math.min(e.clientY, window.innerHeight - 160) })
  }

  function onTouchStart(e, chat) {
    longPressTimer.current = setTimeout(() => {
      const touch = e.touches[0]
      setCtx({ chat, x: Math.min(touch.clientX, window.innerWidth - 210), y: Math.min(touch.clientY, window.innerHeight - 160) })
    }, 500)
  }
  function onTouchEnd() { if (longPressTimer.current) clearTimeout(longPressTimer.current) }

  async function onMouseEnter(chat) {
    hoverTimer.current = setTimeout(async () => {
      if (!previewMsgs[chat.id]) {
        const { data } = await supabase.from('messages').select('content,file_type,sender_id,created_at').eq('chat_id', chat.id).eq('deleted', false).order('created_at', { ascending: false }).limit(3)
        setPreviewMsgs(p => ({ ...p, [chat.id]: (data || []).reverse() }))
      }
      setHoverPreview(chat.id)
    }, 400)
  }

  function onMouseLeave() {
    clearTimeout(hoverTimer.current)
    setHoverPreview(null)
  }

  const filtered = chats
    .filter(c => c.displayName?.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || new Date(b.lastMsg?.created_at || b.created_at) - new Date(a.lastMsg?.created_at || a.created_at))

  function previewText(c) {
    if (!c.lastMsg) return 'Нет сообщений'
    if (c.lastMsg.file_type === 'image') return '🖼 Фото'
    if (c.lastMsg.file_type === 'video') return '🎥 Видео'
    if (c.lastMsg.file_type === 'audio') return '🎵 Аудио'
    if (c.lastMsg.file_type === 'file') return '📎 Файл'
    return c.lastMsg.content || ''
  }

  return (
    <>
      <div className={`sidebar${hidden ? ' hidden' : ''}`}>
        <div className="sidebar-head">
          <span className="logo">💬 GrishaChat</span>
          <button className="ico-btn" onClick={onFavorites} title="Избранное">⭐</button>
          <button className="ico-btn" onClick={onNewChat} title="Новый чат">✏️</button>
          <button className="ico-btn" onClick={onAdminClick} title="Инвайты">🔑</button>
          <button className="ico-btn" onClick={onSettings} title="Настройки">⚙️</button>
        </div>

        <div className="search-wrap">
          <span className="search-icon">🔍</span>
          <input className="search-inp" placeholder="Поиск чатов..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>

        <div className="chat-list">
          {filtered.length === 0 && <div className="empty-hint">{search ? 'Ничего не найдено' : 'Нажми ✏️ чтобы начать'}</div>}
          {filtered.map(chat => (
            <div key={chat.id} style={{ position: 'relative' }}>
              <div
                className={`chat-row${activeChat?.id === chat.id ? ' active' : ''}`}
                onClick={() => { if (!ctx) onSelect(chat) }}
                onContextMenu={e => onRightClick(e, chat)}
                onTouchStart={e => onTouchStart(e, chat)}
                onTouchEnd={onTouchEnd}
                onTouchMove={onTouchEnd}
                onMouseEnter={() => onMouseEnter(chat)}
                onMouseLeave={onMouseLeave}
              >
                <Avatar name={chat.is_favorite ? 'Избранное' : chat.displayName} url={chat.displayAvatar} online={chat.isOnline} size={48} />
                <div className="chat-row-info">
                  <div className="chat-row-name">
                    {chat.pinned && <span style={{ fontSize: 11, marginRight: 3 }}>📌</span>}
                    {chat.is_favorite ? '⭐ Избранное' : chat.displayName}
                  </div>
                  <div className="chat-row-preview">{previewText(chat)}</div>
                </div>
                <div className="chat-row-meta">
                  <span className="chat-row-time">{formatSidebarTime(chat.lastMsg?.created_at)}</span>
                  {chat.unread > 0 && <span className="badge">{chat.unread}</span>}
                </div>
              </div>

              {/* Hover preview (desktop only) */}
              {hoverPreview === chat.id && previewMsgs[chat.id] && (
                <div className="chat-preview-tooltip">
                  <div className="pt-name">{chat.is_favorite ? '⭐ Избранное' : chat.displayName}</div>
                  <div className="pt-msgs">
                    {previewMsgs[chat.id].length === 0
                      ? <div className="pt-msg">Нет сообщений</div>
                      : previewMsgs[chat.id].map((m, i) => (
                        <div key={i} className="pt-msg">
                          {m.file_type === 'image' ? '🖼 Фото' : m.file_type === 'file' ? '📎 Файл' : m.content}
                        </div>
                      ))
                    }
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="sidebar-foot">
          <div className="foot-av" onClick={onProfileClick}>
            <Avatar name={profile.full_name} url={profile.avatar_url} size={38} />
          </div>
          <div className="foot-name" onClick={onProfileClick}>
            <div className="name">{profile.full_name}</div>
            <div className="status">● В сети</div>
          </div>
          <button className="ico-btn" onClick={logout} title="Выйти">🚪</button>
        </div>
      </div>

      {ctx && (
        <>
          <div className="ctx-overlay" onClick={() => setCtx(null)} />
          <div className="ctx" style={{ left: ctx.x, top: ctx.y }}>
            <button className="ctx-item" onClick={() => { onPinChat(ctx.chat.id, !ctx.chat.pinned); setCtx(null) }}>
              📌 {ctx.chat.pinned ? 'Открепить' : 'Закрепить'}
            </button>
            <button className="ctx-item danger" onClick={() => { onDeleteChat(ctx.chat.id); setCtx(null) }}>
              🗑 Удалить / Покинуть чат
            </button>
          </div>
        </>
      )}
    </>
  )
}
