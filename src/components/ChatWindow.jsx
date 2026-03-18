import { useState, useEffect, useRef } from 'react'
import { supabase } from '../supabase'
import GroupSettingsModal from './GroupSettingsModal'

function formatTime(ts) {
  if (!ts) return ''
  return new Date(ts).toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' })
}

function formatDate(ts) {
  const d = new Date(ts)
  const now = new Date()
  if (d.toDateString() === now.toDateString()) return 'Сегодня'
  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  if (d.toDateString() === yesterday.toDateString()) return 'Вчера'
  return d.toLocaleDateString('ru', { day: 'numeric', month: 'long', year: 'numeric' })
}

function formatLastSeen(ts, online) {
  if (online) return 'в сети'
  if (!ts) return 'не в сети'
  const d = new Date(ts)
  const now = new Date()
  const diff = now - d
  if (diff < 60000) return 'только что'
  if (diff < 3600000) return `был(а) ${Math.floor(diff / 60000)} мин назад`
  if (d.toDateString() === now.toDateString())
    return `был(а) сегодня в ${d.toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' })}`
  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  if (d.toDateString() === yesterday.toDateString())
    return `был(а) вчера в ${d.toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' })}`
  return `был(а) ${d.toLocaleDateString('ru', { day: 'numeric', month: 'long' })}`
}

const REACTIONS = ['👍','❤️','😂','😮','😢','🔥','👏','🎉']

function MsgAvatar({ name, url }) {
  const letter = (name || '?')[0].toUpperCase()
  const colors = ['#7c3aed','#2563eb','#059669','#dc2626','#d97706','#db2777']
  const color = colors[letter.charCodeAt(0) % colors.length]
  return (
    <div style={{
      width: 28, height: 28, borderRadius: '50%',
      background: url ? 'transparent' : color,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 11, fontWeight: 600, flexShrink: 0, overflow: 'hidden', alignSelf: 'flex-end'
    }}>
      {url ? <img src={url} alt={name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : letter}
    </div>
  )
}

export default function ChatWindow({ chat, session, profile, visible, onBack, onRefresh, showToast }) {
  const [messages, setMessages] = useState([])
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [lightbox, setLightbox] = useState(null)
  const [members, setMembers] = useState({})
  const [myRole, setMyRole] = useState('member')
  const [showGroupSettings, setShowGroupSettings] = useState(false)
  const [currentChat, setCurrentChat] = useState(chat)
  const [replyTo, setReplyTo] = useState(null)
  const [contextMenu, setContextMenu] = useState(null)
  const [msgReactions, setMsgReactions] = useState({})
  const [pinnedMsg, setPinnedMsg] = useState(null)
  const bottomRef = useRef(null)
  const inputRef = useRef(null)
  const fileRef = useRef(null)
  const channelRef = useRef(null)

  useEffect(() => {
    setCurrentChat(chat)
    if (!chat) return
    setMessages([])
    setReplyTo(null)
    loadMessages()
    loadMembers()
    markRead()

    channelRef.current = supabase
      .channel(`chat:${chat.id}:${Date.now()}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `chat_id=eq.${chat.id}` },
        (payload) => { setMessages(prev => [...prev, payload.new]); markRead() })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages', filter: `chat_id=eq.${chat.id}` },
        (payload) => {
          if (payload.new.deleted) {
            setMessages(prev => prev.filter(m => m.id !== payload.new.id))
          } else {
            setMessages(prev => prev.map(m => m.id === payload.new.id ? payload.new : m))
          }
        })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reactions' }, () => loadReactions())
      .subscribe()

    return () => { if (channelRef.current) supabase.removeChannel(channelRef.current) }
  }, [chat?.id])

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  useEffect(() => {
    const handler = () => setContextMenu(null)
    window.addEventListener('click', handler)
    return () => window.removeEventListener('click', handler)
  }, [])

  async function loadMembers() {
    if (!chat) return
    const { data } = await supabase
      .from('chat_members')
      .select('user_id, role, profiles(id, full_name, username, avatar_url, online, last_seen)')
      .eq('chat_id', chat.id)
    if (data) {
      const map = {}
      data.forEach(m => {
        map[m.user_id] = { ...m.profiles, role: m.role }
        if (m.user_id === session.user.id) setMyRole(m.role || 'member')
      })
      setMembers(map)
    }
  }

  async function loadMessages() {
    const { data } = await supabase
      .from('messages')
      .select('*')
      .eq('chat_id', chat.id)
      .eq('deleted', false)
      .order('created_at', { ascending: true })
      .limit(200)
    setMessages(data || [])
    loadReactions()
    loadPinned()
  }

  async function loadReactions() {
    if (!chat) return
    const { data: msgs } = await supabase.from('messages').select('id').eq('chat_id', chat.id).eq('deleted', false)
    if (!msgs?.length) return
    const ids = msgs.map(m => m.id)
    const { data } = await supabase.from('reactions').select('*').in('message_id', ids)
    if (!data) return
    const grouped = {}
    data.forEach(r => {
      if (!grouped[r.message_id]) grouped[r.message_id] = {}
      if (!grouped[r.message_id][r.emoji]) grouped[r.message_id][r.emoji] = []
      grouped[r.message_id][r.emoji].push(r.user_id)
    })
    setMsgReactions(grouped)
  }

  async function loadPinned() {
    if (!chat?.pinned_message_id) { setPinnedMsg(null); return }
    const { data } = await supabase.from('messages').select('*').eq('id', chat.pinned_message_id).single()
    setPinnedMsg(data)
  }

  async function markRead() {
    if (!chat) return
    await supabase.from('messages').update({ is_read: true })
      .eq('chat_id', chat.id).neq('sender_id', session.user.id).eq('is_read', false)
  }

  async function sendMessage(e) {
    e?.preventDefault()
    const content = text.trim()
    if (!content || sending) return
    setSending(true)
    setText('')
    const msg = { chat_id: chat.id, sender_id: session.user.id, content, is_read: false, deleted: false }
    if (replyTo) msg.reply_to = replyTo.id
    await supabase.from('messages').insert(msg)
    setReplyTo(null)
    setSending(false)
    inputRef.current?.focus()
  }

  async function sendFile(e) {
    const file = e.target.files[0]
    if (!file) return
    if (file.size > 50 * 1024 * 1024) { showToast('Файл слишком большой (макс 50 МБ)'); return }
    setSending(true)
    const isImage = file.type.startsWith('image/')
    const fileName = `${chat.id}/${Date.now()}_${file.name}`
    const { error } = await supabase.storage.from('chat-files').upload(fileName, file)
    if (error) { showToast('Ошибка загрузки файла'); setSending(false); return }
    const { data: { publicUrl } } = supabase.storage.from('chat-files').getPublicUrl(fileName)
    await supabase.from('messages').insert({
      chat_id: chat.id, sender_id: session.user.id,
      content: isImage ? null : file.name,
      file_url: publicUrl, file_type: isImage ? 'image' : 'file',
      is_read: false, deleted: false
    })
    setSending(false)
    e.target.value = ''
  }

  async function deleteMessage(msg) {
    await supabase.from('messages').update({ deleted: true, content: null, file_url: null }).eq('id', msg.id)
    setMessages(prev => prev.filter(m => m.id !== msg.id))
    setContextMenu(null)
    showToast('Сообщение удалено')
  }

  async function pinMessage(msg) {
    await supabase.from('chats').update({ pinned_message_id: msg.id }).eq('id', chat.id)
    setCurrentChat(prev => ({ ...prev, pinned_message_id: msg.id }))
    setPinnedMsg(msg)
    setContextMenu(null)
    showToast('Сообщение закреплено 📌')
  }

  async function unpinMessage() {
    await supabase.from('chats').update({ pinned_message_id: null }).eq('id', chat.id)
    setCurrentChat(prev => ({ ...prev, pinned_message_id: null }))
    setPinnedMsg(null)
    showToast('Сообщение откреплено')
  }

  async function toggleReaction(msgId, emoji) {
    const existing = msgReactions[msgId]?.[emoji]?.includes(session.user.id)
    if (existing) {
      await supabase.from('reactions').delete().eq('message_id', msgId).eq('user_id', session.user.id).eq('emoji', emoji)
    } else {
      await supabase.from('reactions').insert({ message_id: msgId, user_id: session.user.id, emoji })
    }
    setContextMenu(null)
    loadReactions()
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() }
    if (e.key === 'Escape') setReplyTo(null)
  }

  function openContextMenu(e, msg) {
    e.preventDefault()
    e.stopPropagation()
    const x = Math.min(e.clientX, window.innerWidth - 210)
    const y = Math.min(e.clientY, window.innerHeight - 260)
    setContextMenu({ msg, x, y })
  }

  const canDelete = (msg) => msg.sender_id === session.user.id || myRole === 'owner' || myRole === 'admin'
  const canPin = myRole === 'owner' || myRole === 'admin'

  const grouped = []
  let lastDate = null
  messages.forEach(msg => {
    const date = new Date(msg.created_at).toDateString()
    if (date !== lastDate) { grouped.push({ type: 'date', date: msg.created_at }); lastDate = date }
    grouped.push({ type: 'msg', ...msg })
  })

  if (!chat) return (
    <div className="chat-window">
      <div className="chat-window-empty">
        <div className="big-icon">💬</div>
        <p style={{ fontSize: 18, fontWeight: 600 }}>Выбери чат</p>
        <p style={{ fontSize: 14, color: 'var(--text-muted)' }}>Или начни новый разговор</p>
      </div>
    </div>
  )

  const otherUser = chat.otherUser
  const headerName = currentChat?.name || chat.displayName
  const headerStatus = chat.type === 'direct'
    ? formatLastSeen(otherUser?.last_seen, otherUser?.online)
    : `${Object.keys(members).length} участников`

  return (
    <div className={`chat-window${visible ? ' visible' : ''}`}>

      {/* Header */}
      <div className="chat-header">
        <button className="back-btn" onClick={onBack}>‹</button>
        <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 700, overflow: 'hidden', flexShrink: 0 }}>
          {(currentChat?.avatar_url || chat.displayAvatar)
            ? <img src={currentChat?.avatar_url || chat.displayAvatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
            : (headerName || '?')[0].toUpperCase()
          }
        </div>
        <div className="chat-header-info">
          <div className="chat-header-name">{headerName}</div>
          <div className={`chat-header-status${otherUser?.online ? ' online' : ''}`}>{headerStatus}</div>
        </div>
        {chat.type === 'group' && (
          <button className="icon-btn" onClick={() => setShowGroupSettings(true)}>⚙️</button>
        )}
      </div>

      {/* Pinned */}
      {pinnedMsg && (
        <div style={{ padding: '8px 16px', background: 'rgba(124,58,237,0.1)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span>📌</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, color: 'var(--accent-light)', fontWeight: 600 }}>Закреплено</div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {pinnedMsg.content || (pinnedMsg.file_type === 'image' ? '🖼 Фото' : '📎 Файл')}
            </div>
          </div>
          {canPin && <button onClick={unpinMessage} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 20 }}>×</button>}
        </div>
      )}

      {/* Reply preview */}
      {replyTo && (
        <div style={{ padding: '8px 16px', background: 'var(--bg-card)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 3, height: 36, background: 'var(--accent)', borderRadius: 2 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, color: 'var(--accent-light)', fontWeight: 600 }}>{members[replyTo.sender_id]?.full_name || 'Ты'}</div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {replyTo.content || (replyTo.file_type === 'image' ? '🖼 Фото' : '📎 Файл')}
            </div>
          </div>
          <button onClick={() => setReplyTo(null)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 20 }}>×</button>
        </div>
      )}

      {/* Messages */}
      <div className="messages-area" onClick={() => setContextMenu(null)}>
        {grouped.map((item, i) => {
          if (item.type === 'date') return <div key={`d${i}`} className="date-divider">{formatDate(item.date)}</div>

          const sent = item.sender_id === session.user.id
          const sender = members[item.sender_id]
          const nextItem = grouped[i + 1]
          const isLastInGroup = !nextItem || nextItem.type === 'date' || nextItem.sender_id !== item.sender_id
          const reactions = msgReactions[item.id]
          const replyMsg = item.reply_to ? messages.find(m => m.id === item.reply_to) : null
          const senderColors = ['#7c3aed','#2563eb','#059669','#dc2626','#d97706','#db2777']
          const senderColor = sender ? senderColors[(sender.full_name || '?')[0].toUpperCase().charCodeAt(0) % senderColors.length] : 'var(--accent-light)'

          return (
            <div key={item.id} style={{ display: 'flex', flexDirection: 'column', alignItems: sent ? 'flex-end' : 'flex-start', marginBottom: isLastInGroup ? 6 : 1 }}>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, maxWidth: '78%' }} onContextMenu={e => openContextMenu(e, item)}>
                {!sent && (isLastInGroup ? <MsgAvatar name={sender?.full_name} url={sender?.avatar_url} /> : <div style={{ width: 28, flexShrink: 0 }} />)}

                <div className={`bubble ${sent ? 'sent' : 'received'}`} style={{ cursor: 'context-menu' }} onDoubleClick={() => setReplyTo(item)}>
                  {/* Group sender name */}
                  {chat.type === 'group' && !sent && isLastInGroup && sender && (
                    <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4, color: senderColor }}>{sender.full_name}</div>
                  )}

                  {/* Reply */}
                  {replyMsg && (
                    <div style={{ borderLeft: '3px solid var(--accent)', paddingLeft: 8, marginBottom: 6, opacity: 0.75, background: 'rgba(0,0,0,0.15)', borderRadius: '0 6px 6px 0', padding: '4px 8px' }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--accent-light)' }}>{members[replyMsg.sender_id]?.full_name || 'Сообщение'}</div>
                      <div style={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 200 }}>
                        {replyMsg.content || (replyMsg.file_type === 'image' ? '🖼 Фото' : '📎 Файл')}
                      </div>
                    </div>
                  )}

                  {/* Image */}
                  {item.file_type === 'image' && item.file_url && (
                    <img src={item.file_url} alt="фото" onClick={() => setLightbox(item.file_url)}
                      style={{ maxWidth: '100%', borderRadius: 10, display: 'block', cursor: 'zoom-in', marginBottom: 4 }} />
                  )}

                  {/* File */}
                  {item.file_type === 'file' && item.file_url && (
                    <a href={item.file_url} target="_blank" rel="noreferrer" style={{ textDecoration: 'none', color: 'inherit' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 160 }}>
                        <span style={{ fontSize: 26 }}>📎</span>
                        <div><div style={{ fontSize: 13, fontWeight: 600 }}>{item.content || 'Файл'}</div><div style={{ fontSize: 11, opacity: 0.6 }}>Открыть</div></div>
                      </div>
                    </a>
                  )}

                  {/* Text */}
                  {item.content && !item.file_type && <span style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{item.content}</span>}

                  {/* Time */}
                  <div className="bubble-time">
                    {formatTime(item.created_at)}
                    {sent && <span style={{ marginLeft: 4 }}>{item.is_read ? '✓✓' : '✓'}</span>}
                  </div>
                </div>
              </div>

              {/* Reactions */}
              {reactions && Object.keys(reactions).length > 0 && (
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 3, paddingLeft: sent ? 0 : 34, justifyContent: sent ? 'flex-end' : 'flex-start' }}>
                  {Object.entries(reactions).map(([emoji, users]) => (
                    <button key={emoji} onClick={() => toggleReaction(item.id, emoji)} style={{
                      background: users.includes(session.user.id) ? 'rgba(124,58,237,0.25)' : 'var(--bg-card)',
                      border: `1px solid ${users.includes(session.user.id) ? 'var(--accent)' : 'var(--border)'}`,
                      borderRadius: 12, padding: '2px 7px', cursor: 'pointer', fontSize: 13,
                      display: 'flex', alignItems: 'center', gap: 3, color: 'var(--text-primary)'
                    }}>
                      {emoji} <span style={{ fontSize: 11 }}>{users.length}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      {/* Context menu */}
      {contextMenu && (
        <div onClick={e => e.stopPropagation()} style={{
          position: 'fixed', zIndex: 150,
          left: contextMenu.x, top: contextMenu.y,
          background: 'var(--bg-card)', border: '1px solid var(--border)',
          borderRadius: 14, overflow: 'hidden', boxShadow: '0 8px 32px rgba(0,0,0,0.5)', minWidth: 190
        }}>
          <div style={{ display: 'flex', padding: '8px 10px', gap: 2, borderBottom: '1px solid var(--border)' }}>
            {REACTIONS.map(emoji => (
              <button key={emoji} onClick={() => toggleReaction(contextMenu.msg.id, emoji)}
                style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', padding: '3px 5px', borderRadius: 8 }}
                onMouseEnter={e => e.target.style.background = 'var(--bg-input)'}
                onMouseLeave={e => e.target.style.background = 'none'}
              >{emoji}</button>
            ))}
          </div>
          {[
            { icon: '↩️', label: 'Ответить', action: () => { setReplyTo(contextMenu.msg); setContextMenu(null); inputRef.current?.focus() } },
            canPin && { icon: '📌', label: pinnedMsg?.id === contextMenu.msg.id ? 'Открепить' : 'Закрепить', action: () => pinnedMsg?.id === contextMenu.msg.id ? unpinMessage() : pinMessage(contextMenu.msg) },
            canDelete(contextMenu.msg) && { icon: '🗑', label: 'Удалить', action: () => deleteMessage(contextMenu.msg), danger: true },
          ].filter(Boolean).map((item, i) => (
            <button key={i} onClick={item.action} style={{
              display: 'flex', alignItems: 'center', gap: 10, width: '100%',
              padding: '11px 16px', background: 'none', border: 'none',
              color: item.danger ? '#fca5a5' : 'var(--text-primary)',
              cursor: 'pointer', fontSize: 14, textAlign: 'left'
            }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-input)'}
              onMouseLeave={e => e.currentTarget.style.background = 'none'}
            ><span>{item.icon}</span>{item.label}</button>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="message-input-area">
        <div className="msg-input-wrap">
          <button className="attach-btn" onClick={() => fileRef.current?.click()} type="button">📎</button>
          <textarea ref={inputRef} className="msg-input" placeholder="Сообщение..." value={text}
            onChange={e => setText(e.target.value)} onKeyDown={handleKeyDown} rows={1} />
        </div>
        <button className="send-btn" onClick={sendMessage} disabled={!text.trim() || sending}>➤</button>
        <input ref={fileRef} type="file" style={{ display: 'none' }} onChange={sendFile} />
      </div>

      {lightbox && <div className="lightbox" onClick={() => setLightbox(null)}><img src={lightbox} alt="фото" /></div>}

      {showGroupSettings && (
        <GroupSettingsModal
          chat={currentChat} session={session} myRole={myRole}
          onClose={() => setShowGroupSettings(false)}
          onUpdated={(updated) => { if (updated) { setCurrentChat(prev => ({ ...prev, ...updated })); onRefresh() } else { onBack(); onRefresh() } }}
          showToast={showToast}
        />
      )}
    </div>
  )
}
