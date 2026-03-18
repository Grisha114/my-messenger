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
  return d.toLocaleDateString('ru', { day: 'numeric', month: 'long' })
}

function Avatar({ name, url, size = 28 }) {
  const letter = (name || '?')[0].toUpperCase()
  const colors = ['#7c3aed','#2563eb','#059669','#dc2626','#d97706','#db2777']
  const color = colors[letter.charCodeAt(0) % colors.length]
  return (
    <div className="msg-avatar" style={{ width: size, height: size, background: url ? 'transparent' : color }}>
      {url ? <img src={url} alt={name} /> : letter}
    </div>
  )
}

export default function ChatWindow({ chat, session, profile, visible, onBack, showToast }) {
  const [messages, setMessages] = useState([])
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [lightbox, setLightbox] = useState(null)
  const [showGroupSettings, setShowGroupSettings] = useState(false)
  const [currentChat, setCurrentChat] = useState(chat)
  const [members, setMembers] = useState({})
  const bottomRef = useRef(null)
  const inputRef = useRef(null)
  const fileRef = useRef(null)
  const channelRef = useRef(null)

  useEffect(() => {
    setCurrentChat(chat)
    if (!chat) return
    loadMessages()
    loadMembers()
    markRead()

    channelRef.current = supabase
      .channel(`chat:${chat.id}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `chat_id=eq.${chat.id}`
      }, (payload) => {
        setMessages(prev => [...prev, payload.new])
        markRead()
      })
      .subscribe()

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current)
      }
    }
  }, [chat?.id])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function loadMembers() {
    if (!chat) return
    const { data } = await supabase
      .from('chat_members')
      .select('user_id, profiles(id, full_name, avatar_url)')
      .eq('chat_id', chat.id)

    if (data) {
      const map = {}
      data.forEach(m => { map[m.user_id] = m.profiles })
      setMembers(map)
    }
  }

  async function loadMessages() {
    const { data } = await supabase
      .from('messages')
      .select('*')
      .eq('chat_id', chat.id)
      .order('created_at', { ascending: true })
      .limit(100)

    setMessages(data || [])
  }

  async function markRead() {
    if (!chat) return
    await supabase
      .from('messages')
      .update({ is_read: true })
      .eq('chat_id', chat.id)
      .neq('sender_id', session.user.id)
      .eq('is_read', false)
  }

  async function sendMessage(e) {
    e?.preventDefault()
    const content = text.trim()
    if (!content || sending) return
    setSending(true)
    setText('')

    await supabase.from('messages').insert({
      chat_id: chat.id,
      sender_id: session.user.id,
      content,
      is_read: false
    })

    setSending(false)
    inputRef.current?.focus()
  }

  async function sendFile(e) {
    const file = e.target.files[0]
    if (!file) return

    const isImage = file.type.startsWith('image/')
    const maxSize = 50 * 1024 * 1024
    if (file.size > maxSize) { showToast('Файл слишком большой (максимум 50 МБ)'); return }

    setSending(true)
    const ext = file.name.split('.').pop()
    const fileName = `${chat.id}/${Date.now()}.${ext}`

    const { error: uploadErr } = await supabase.storage
      .from('chat-files')
      .upload(fileName, file)

    if (uploadErr) { showToast('Ошибка загрузки файла'); setSending(false); return }

    const { data: { publicUrl } } = supabase.storage
      .from('chat-files')
      .getPublicUrl(fileName)

    await supabase.from('messages').insert({
      chat_id: chat.id,
      sender_id: session.user.id,
      content: isImage ? null : file.name,
      file_url: publicUrl,
      file_type: isImage ? 'image' : 'file',
      is_read: false
    })

    setSending(false)
    e.target.value = ''
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  // Group messages by date
  const grouped = []
  let lastDate = null
  messages.forEach(msg => {
    const date = new Date(msg.created_at).toDateString()
    if (date !== lastDate) {
      grouped.push({ type: 'date', date: msg.created_at })
      lastDate = date
    }
    grouped.push({ type: 'msg', ...msg })
  })

  if (!chat) {
    return (
      <div className="chat-window">
        <div className="chat-window-empty">
          <div className="big-icon">💬</div>
          <p style={{ fontSize: 18, fontWeight: 600 }}>Выбери чат</p>
          <p style={{ fontSize: 14, color: 'var(--text-muted)' }}>Или начни новый разговор</p>
        </div>
      </div>
    )
  }

  const otherUser = chat.otherUser
  const headerName = chat.displayName
  const headerStatus = chat.type === 'direct'
    ? (otherUser?.online ? 'в сети' : 'не в сети')
    : `${Object.keys(members).length} участников`

  return (
    <div className={`chat-window${visible ? ' visible' : ''}`}>
      <div className="chat-header">
        <button className="back-btn" onClick={onBack}>‹</button>
        <div className="chat-avatar" style={{ width: 40, height: 40, background: chat.displayAvatar ? 'transparent' : '#7c3aed' }}>
          {chat.displayAvatar
            ? <img src={chat.displayAvatar} alt={headerName} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
            : (headerName || '?')[0].toUpperCase()
          }
        </div>
        <div className="chat-header-info">
          <div className="chat-header-name">{currentChat?.name || headerName}</div>
          <div className={`chat-header-status${otherUser?.online ? ' online' : ''}`}>
            {headerStatus}
          </div>
        </div>
        {chat?.type === 'group' && (
          <button className="icon-btn" onClick={() => setShowGroupSettings(true)} title="Настройки группы">⚙️</button>
        )}
      </div>

      <div className="messages-area">
        {grouped.map((item, i) => {
          if (item.type === 'date') {
            return <div key={`date-${i}`} className="date-divider">{formatDate(item.date)}</div>
          }

          const isSent = item.sender_id === session.user.id
          const sender = members[item.sender_id]
          const nextMsg = grouped[i + 1]
          const isLastInGroup = !nextMsg || nextMsg.type === 'date' || nextMsg.sender_id !== item.sender_id

          return (
            <div key={item.id} className={`message-row ${isSent ? 'sent' : 'received'}`}>
              {!isSent && (
                isLastInGroup
                  ? <Avatar name={sender?.full_name} url={sender?.avatar_url} />
                  : <div className="msg-avatar hidden" />
              )}

              <div className={`bubble ${isSent ? 'sent' : 'received'}`}>
                {chat.type === 'group' && !isSent && isLastInGroup && (
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent-light)', marginBottom: 4 }}>
                    {sender?.full_name}
                  </div>
                )}

                {item.file_type === 'image' && item.file_url && (
                  <img
                    src={item.file_url}
                    alt="фото"
                    onClick={() => setLightbox(item.file_url)}
                    style={{ maxWidth: '100%', borderRadius: 10, display: 'block', cursor: 'zoom-in', marginBottom: item.content ? 8 : 0 }}
                  />
                )}

                {item.file_type === 'file' && item.file_url && (
                  <a href={item.file_url} target="_blank" rel="noreferrer" style={{ textDecoration: 'none', color: 'inherit' }}>
                    <div className="file-bubble">
                      <span className="file-icon">📎</span>
                      <div className="file-info">
                        <div className="file-name">{item.content || 'Файл'}</div>
                        <div className="file-size">Нажми чтобы открыть</div>
                      </div>
                    </div>
                  </a>
                )}

                {item.content && !item.file_type && (
                  <span>{item.content}</span>
                )}

                <div className="bubble-time">
                  {formatTime(item.created_at)}
                  {isSent && <span style={{ marginLeft: 4 }}>{item.is_read ? '✓✓' : '✓'}</span>}
                </div>
              </div>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      <div className="message-input-area">
        <div className="msg-input-wrap">
          <button className="attach-btn" onClick={() => fileRef.current?.click()} type="button">📎</button>
          <textarea
            ref={inputRef}
            className="msg-input"
            placeholder="Сообщение..."
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={1}
          />
        </div>
        <button
          className="send-btn"
          onClick={sendMessage}
          disabled={!text.trim() || sending}
        >
          ➤
        </button>
        <input ref={fileRef} type="file" style={{ display: 'none' }} onChange={sendFile} />
      </div>

      {lightbox && (
        <div className="lightbox" onClick={() => setLightbox(null)}>
          <img src={lightbox} alt="фото" />
        </div>
      )}

      {showGroupSettings && (
        <GroupSettingsModal
          chat={currentChat}
          session={session}
          onClose={() => setShowGroupSettings(false)}
          onUpdated={(updated) => {
            if (updated) setCurrentChat(prev => ({ ...prev, ...updated }))
            else onBack()
          }}
          showToast={showToast}
        />
      )}
    </div>
  )
}
