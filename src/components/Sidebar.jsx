import { useState } from 'react'
import { supabase } from '../supabase'
import { Avatar, formatSidebarTime } from './helpers.jsx'

export default function Sidebar({ profile, chats, activeChat, onSelect, onNewChat, onProfileClick, onAdminClick, onSettings, onDeleteChat, onPinChat, hidden }) {
  const [search, setSearch] = useState('')
  const [ctx, setCtx] = useState(null)

  async function logout() {
    await supabase.from('profiles').update({ online:false }).eq('id', profile.id)
    await supabase.auth.signOut()
  }

  function openCtx(e, chat) {
    e.preventDefault(); e.stopPropagation()
    setCtx({ chat, x:Math.min(e.clientX, window.innerWidth-200), y:Math.min(e.clientY, window.innerHeight-150) })
  }

  const filtered = chats
    .filter(c => c.displayName?.toLowerCase().includes(search.toLowerCase()))
    .sort((a,b) => (b.pinned?1:0)-(a.pinned?1:0) || new Date(b.lastMsg?.created_at||b.created_at)-new Date(a.lastMsg?.created_at||a.created_at))

  function previewText(c) {
    if (!c.lastMsg) return 'Нет сообщений'
    if (c.lastMsg.file_type==='image') return '🖼 Фото'
    if (c.lastMsg.file_type==='file') return '📎 Файл'
    return c.lastMsg.content || ''
  }

  return (
    <>
      <div className={`sidebar${hidden?' hidden':''}`}>
        <div className="sidebar-head">
          <span className="logo">💬 GrishaChat</span>
          <button className="ico-btn" onClick={onNewChat} title="Новый чат">✏️</button>
          <button className="ico-btn" onClick={onAdminClick} title="Инвайты">🔑</button>
          <button className="ico-btn" onClick={onSettings} title="Настройки">⚙️</button>
        </div>

        <div className="search-wrap">
          <span className="search-icon">🔍</span>
          <input className="search-inp" placeholder="Поиск..." value={search} onChange={e=>setSearch(e.target.value)}/>
        </div>

        <div className="chat-list">
          {filtered.length===0 && <div className="empty-hint">{search ? 'Ничего не найдено' : 'Нажми ✏️ чтобы начать'}</div>}
          {filtered.map(chat => (
            <div key={chat.id}
              className={`chat-row${activeChat?.id===chat.id?' active':''}${chat.pinned?' pinned':''}`}
              onClick={()=>onSelect(chat)}
              onContextMenu={e=>openCtx(e,chat)}
            >
              <Avatar name={chat.displayName} url={chat.displayAvatar} online={chat.isOnline} size={48}/>
              <div className="chat-row-info">
                <div className="chat-row-name">{chat.displayName}</div>
                <div className="chat-row-preview">{previewText(chat)}</div>
              </div>
              <div className="chat-row-meta">
                <span className="chat-row-time">{formatSidebarTime(chat.lastMsg?.created_at)}</span>
                {chat.unread>0 && <span className="badge">{chat.unread}</span>}
              </div>
            </div>
          ))}
        </div>

        <div className="sidebar-foot">
          <div className="foot-av" onClick={onProfileClick}>
            <Avatar name={profile.full_name} url={profile.avatar_url} size={38}/>
          </div>
          <div className="foot-name" onClick={onProfileClick}>
            <div className="name">{profile.full_name}</div>
            <div className="status">● В сети</div>
          </div>
          <button className="ico-btn" onClick={logout} title="Выйти">🚪</button>
        </div>
      </div>

      {/* Right-click context menu */}
      {ctx && (
        <>
          <div className="ctx-overlay" onClick={()=>setCtx(null)}/>
          <div className="ctx" style={{left:ctx.x, top:ctx.y}}>
            <button className="ctx-item" onClick={()=>{onPinChat(ctx.chat.id,!ctx.chat.pinned);setCtx(null)}}>
              📌 {ctx.chat.pinned ? 'Открепить' : 'Закрепить'}
            </button>
            <button className="ctx-item danger" onClick={()=>{onDeleteChat(ctx.chat.id);setCtx(null)}}>
              🗑 Удалить чат
            </button>
          </div>
        </>
      )}
    </>
  )
}
