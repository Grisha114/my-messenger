import { useState, useEffect, useRef } from 'react'
import { supabase } from '../supabase'
import GroupSettingsModal from './GroupSettingsModal'
import { UserProfileModal } from './ProfileModal'
import { Avatar, formatTime, formatDate, formatLastSeen, senderColor } from './helpers.jsx'

const EMOJIS = ['👍','❤️','😂','😮','😢','🔥','👏','🎉','🤩','💯','👎','😍','🥳','💪','🙏','😎']

const EMOJI_CATEGORIES = {
  '😊': ['😀','😃','😄','😁','😆','😅','😂','🤣','😊','😇','🙂','🙃','😉','😌','😍','🥰','😘','😗','😙','😚','😋','😛','😜','🤪','😝','🤑','🤗','🤭','🤫','🤔','🤐','🤨','😐','😑','😶','😏','😒','🙄','😬','🤥','😌','😔','😪','🤤','😴','😷','🤒','🤕','🤢','🤧','🥵','🥶','🥴','😵','🤯','🤠','🥳','😎','🤓','🧐'],
  '👍': ['👋','🤚','🖐','✋','🖖','👌','🤌','🤏','✌️','🤞','🤟','🤘','🤙','👈','👉','👆','🖕','👇','☝️','👍','👎','✊','👊','🤛','🤜','👏','🙌','👐','🤲','🙏','✍️','💅','🤳','💪','🦾'],
  '❤️': ['❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❣️','💕','💞','💓','💗','💖','💘','💝','💟','☮️','✝️','☪️','🕉','✡️','🔯','🕎','☯️','☦️'],
}

function isReallyOnline(online, lastSeen) {
  if (!online || !lastSeen) return false
  return (Date.now() - new Date(lastSeen)) < 3 * 60 * 1000
}

// Parse @mentions in text
function renderText(text, members, onMentionClick) {
  if (!text) return null
  const parts = text.split(/(@\w+)/g)
  return parts.map((part, i) => {
    if (part.startsWith('@')) {
      const username = part.slice(1)
      const member = Object.values(members).find(m => m.username === username)
      if (member) return <span key={i} className="mention" onClick={() => onMentionClick(member)}>{part}</span>
    }
    return <span key={i}>{part}</span>
  })
}


// Forward modal component
function ForwardModal({ msg, session, showToast, onClose }) {
  const [chats, setChats] = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(() => { loadChats() }, [])

  async function loadChats() {
    const { data: mem } = await supabase.from('chat_members').select('chat_id').eq('user_id', session.user.id)
    if (!mem?.length) return
    const ids = mem.map(m => m.chat_id)
    const { data: cs } = await supabase.from('chats').select('*').in('id', ids)
    if (!cs) return
    const enriched = await Promise.all(cs.map(async chat => {
      const { data: others } = await supabase.from('chat_members').select('profiles(full_name,avatar_url)').eq('chat_id', chat.id).neq('user_id', session.user.id).limit(1)
      return {
        ...chat,
        displayName: chat.type === 'group' ? chat.name : (others?.[0]?.profiles?.full_name || '?'),
        displayAvatar: chat.type === 'group' ? chat.avatar_url : others?.[0]?.profiles?.avatar_url,
      }
    }))
    setChats(enriched)
  }

  async function forward(targetChat) {
    setLoading(true)
    await supabase.from('messages').insert({
      chat_id: targetChat.id, sender_id: session.user.id,
      content: msg.content, file_url: msg.file_url, file_type: msg.file_type,
      forwarded_from: msg.sender_id, is_read: false, deleted: false
    })
    setLoading(false); onClose(); showToast('Переслано ✓')
  }

  return (
    <div className="overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-head"><span className="modal-title">↗️ Переслать в...</span><button className="modal-close" onClick={onClose}>×</button></div>
        <div style={{ maxHeight: 400, overflowY: 'auto' }}>
          {chats.length === 0 && <div className="empty-hint">Нет чатов</div>}
          {chats.map(chat => (
            <div key={chat.id} onClick={() => forward(chat)} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 8px', borderRadius: 10, cursor: 'pointer', transition: 'background .12s' }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--bg3)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
              <Avatar name={chat.displayName} url={chat.displayAvatar} size={40} />
              <div style={{ fontWeight: 600, fontSize: 14 }}>{chat.displayName}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default function ChatWindow({ chat, session, profile, visible, onBack, onRefresh, showToast, onViewUser }) {
  const [msgs, setMsgs] = useState([])
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [lightbox, setLightbox] = useState(null)
  const [members, setMembers] = useState({})
  const [myRole, setMyRole] = useState('member')
  const [showGrpSettings, setShowGrpSettings] = useState(false)
  const [curChat, setCurChat] = useState(chat)
  const [replyTo, setReplyTo] = useState(null)
  const [editingMsg, setEditingMsg] = useState(null)
  const [forwardMsg, setForwardMsg] = useState(null)
  const [ctx, setCtx] = useState(null)
  const [reactions, setReactions] = useState({})
  const [reads, setReads] = useState({}) // msgId -> [userId]
  const [pinnedMsg, setPinnedMsg] = useState(null)
  const [viewUser, setViewUser] = useState(null)
  const [pasteFile, setPasteFile] = useState(null)
  const [searchMode, setSearchMode] = useState(false)
  const [searchQ, setSearchQ] = useState('')
  const [showScrollBtn, setShowScrollBtn] = useState(false)
  const [blockedIds, setBlockedIds] = useState([])
  const [isRecording, setIsRecording] = useState(false)
  const [typingUsers, setTypingUsers] = useState([])
  const [swipeOffset, setSwipeOffset] = useState({})
  const swipeStartX = useRef({})
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const [emojiCat, setEmojiCat] = useState('😊')
  const [readsDetail, setReadsDetail] = useState(null) // msgId to show reads popup
  const bottomRef = useRef(null)
  const msgsRef = useRef(null)
  const taRef = useRef(null)
  const fileRef = useRef(null)
  const chRef = useRef(null)
  const longPressTimer = useRef(null)
  const didScrollRef = useRef(false)
  const recognitionRef = useRef(null)
  const typingTimer = useRef(null)

  useEffect(() => {
    setCurChat(chat)
    if (!chat) return
    setMsgs([]); setReplyTo(null); setCtx(null); setPasteFile(null)
    setEditingMsg(null); setSearchMode(false); setSearchQ(''); setTypingUsers([])
    didScrollRef.current = false
    loadMsgs(); loadMembers(); markRead(); loadBlocked()

    if (chRef.current) supabase.removeChannel(chRef.current)
    chRef.current = supabase.channel(`cw:${chat.id}:${Date.now()}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `chat_id=eq.${chat.id}` },
        p => { setMsgs(prev => [...prev, p.new]); markRead() })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages', filter: `chat_id=eq.${chat.id}` },
        p => {
          if (p.new.deleted) setMsgs(prev => prev.filter(m => m.id !== p.new.id))
          else setMsgs(prev => prev.map(m => m.id === p.new.id ? p.new : m))
        })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reactions' }, loadReactions)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'message_reads' }, loadReads)
      .subscribe()

    return () => { if (chRef.current) supabase.removeChannel(chRef.current) }
  }, [chat?.id])

  useEffect(() => {
    if (msgs.length && !didScrollRef.current) {
      didScrollRef.current = true
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'auto' }), 50)
    } else if (msgs.length) {
      const el = msgsRef.current
      if (el && el.scrollHeight - el.scrollTop - el.clientHeight < 200) {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
      }
    }
  }, [msgs])

  useEffect(() => {
    if (taRef.current) {
      taRef.current.style.height = 'auto'
      taRef.current.style.height = Math.min(taRef.current.scrollHeight, 140) + 'px'
    }
  }, [text])

  useEffect(() => {
    const h = () => { setCtx(null); setShowEmojiPicker(false); setReadsDetail(null) }
    window.addEventListener('click', h)
    return () => window.removeEventListener('click', h)
  }, [])

  useEffect(() => {
    function onPaste(e) {
      if (!visible) return
      for (const item of (e.clipboardData?.items || [])) {
        if (item.type.startsWith('image/')) { setPasteFile(item.getAsFile()); e.preventDefault(); break }
      }
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [visible])

  async function loadBlocked() {
    const { data } = await supabase.from('blocked_users').select('blocked_id').eq('user_id', session.user.id)
    setBlockedIds(data?.map(b => b.blocked_id) || [])
  }

  async function loadMembers() {
    const { data } = await supabase.from('chat_members')
      .select('user_id,role,profiles(id,full_name,username,avatar_url,online,last_seen,bio)')
      .eq('chat_id', chat.id)
    if (data) {
      const map = {}
      data.forEach(m => { map[m.user_id] = { ...m.profiles, role: m.role }; if (m.user_id === session.user.id) setMyRole(m.role || 'member') })
      setMembers(map)
    }
  }

  async function loadMsgs() {
    const { data } = await supabase.from('messages').select('*').eq('chat_id', chat.id).eq('deleted', false).order('created_at', { ascending: true }).limit(300)
    setMsgs(data || [])
    loadReactions(); loadPinned(); loadReads()
  }

  async function loadReactions() {
    if (!chat) return
    const { data: m } = await supabase.from('messages').select('id').eq('chat_id', chat.id).eq('deleted', false)
    if (!m?.length) return
    const { data: r } = await supabase.from('reactions').select('*').in('message_id', m.map(x => x.id))
    if (!r) return
    const g = {}
    r.forEach(x => { if (!g[x.message_id]) g[x.message_id] = {}; if (!g[x.message_id][x.emoji]) g[x.message_id][x.emoji] = []; g[x.message_id][x.emoji].push(x.user_id) })
    setReactions(g)
  }

  async function loadReads() {
    if (!chat || chat.type !== 'group') return
    const { data: m } = await supabase.from('messages').select('id').eq('chat_id', chat.id).eq('deleted', false)
    if (!m?.length) return
    const { data: r } = await supabase.from('message_reads').select('message_id,user_id').in('message_id', m.map(x => x.id))
    if (!r) return
    const g = {}
    r.forEach(x => { if (!g[x.message_id]) g[x.message_id] = []; if (!g[x.message_id].includes(x.user_id)) g[x.message_id].push(x.user_id) })
    setReads(g)
  }

  async function loadPinned() {
    // Always fetch fresh from DB to avoid stale prop
    const { data: chatRow } = await supabase.from('chats').select('pinned_message_id').eq('id', chat.id).single()
    const pinId = chatRow?.pinned_message_id
    if (!pinId) { setPinnedMsg(null); return }
    const { data: msg } = await supabase.from('messages').select('*').eq('id', pinId).single()
    if (!msg || msg.deleted) { setPinnedMsg(null); return }
    setPinnedMsg(msg)
    setCurChat(p => ({ ...p, pinned_message_id: pinId }))
  }

  async function markRead() {
    if (!chat) return
    await supabase.from('messages').update({ is_read: true }).eq('chat_id', chat.id).neq('sender_id', session.user.id).eq('is_read', false)
    // Mark group reads
    if (chat.type === 'group') {
      const { data: unread } = await supabase.from('messages').select('id').eq('chat_id', chat.id).eq('deleted', false).neq('sender_id', session.user.id)
      if (unread?.length) {
        for (const msg of unread) {
          await supabase.from('message_reads').upsert({ message_id: msg.id, user_id: session.user.id }, { onConflict: 'message_id,user_id', ignoreDuplicates: true })
        }
      }
    }
  }

  async function send() {
    if (editingMsg) { await saveEdit(); return }
    if (pasteFile) { await sendFileObj(pasteFile); setPasteFile(null) }
    const content = text.trim()
    if (!content) return
    setSending(true); setText('')
    const msg = { chat_id: chat.id, sender_id: session.user.id, content, is_read: false, deleted: false, edited: false }
    if (replyTo) msg.reply_to = replyTo.id
    await supabase.from('messages').insert(msg)
    setReplyTo(null); setSending(false)
    taRef.current?.focus()
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 100)
  }

  async function saveEdit() {
    if (!editingMsg || !text.trim()) return
    await supabase.from('messages').update({ content: text.trim(), edited: true, edited_at: new Date().toISOString() }).eq('id', editingMsg.id)
    setEditingMsg(null); setText(''); setSending(false); showToast('Изменено ✓')
  }

  async function sendFileObj(file) {
    if (file.size > 50 * 1024 * 1024) { showToast('Макс. 50 МБ'); return }
    const isImg = file.type.startsWith('image/'), isVid = file.type.startsWith('video/'), isAud = file.type.startsWith('audio/')
    const fn = `${chat.id}/${Date.now()}_${file.name || 'file'}`
    const { error } = await supabase.storage.from('chat-files').upload(fn, file)
    if (error) { showToast('Ошибка загрузки'); return }
    const { data: { publicUrl } } = supabase.storage.from('chat-files').getPublicUrl(fn)
    const fileType = isImg ? 'image' : isVid ? 'video' : isAud ? 'audio' : 'file'
    await supabase.from('messages').insert({ chat_id: chat.id, sender_id: session.user.id, content: (isImg || isVid) ? null : file.name, file_url: publicUrl, file_type: fileType, is_read: false, deleted: false })
  }

  async function pickAndSend(e) {
    const f = e.target.files[0]; if (!f) return
    setSending(true); await sendFileObj(f); setSending(false); e.target.value = ''
  }

  async function forwardTo(targetChatId) {
    if (!forwardMsg) return
    await supabase.from('messages').insert({
      chat_id: targetChatId, sender_id: session.user.id,
      content: forwardMsg.content, file_url: forwardMsg.file_url, file_type: forwardMsg.file_type,
      forwarded_from: forwardMsg.sender_id, is_read: false, deleted: false
    })
    setForwardMsg(null); showToast('Переслано ✓')
  }

  async function deleteMsgFn(msg) {
    await supabase.from('messages').update({ deleted: true, content: null, file_url: null }).eq('id', msg.id)
    setMsgs(prev => prev.filter(m => m.id !== msg.id)); setCtx(null); showToast('Удалено')
  }

  async function startEdit(msg) { setEditingMsg(msg); setText(msg.content || ''); setCtx(null); setTimeout(() => taRef.current?.focus(), 100) }

  async function pinMsgFn(msg) {
    const newPin = pinnedMsg?.id === msg.id ? null : msg.id
    await supabase.from('chats').update({ pinned_message_id: newPin }).eq('id', chat.id)
    setCurChat(p => ({ ...p, pinned_message_id: newPin }))
    setPinnedMsg(newPin ? msg : null); setCtx(null); showToast(newPin ? 'Закреплено 📌' : 'Откреплено')
  }

  async function toggleReaction(msgId, emoji) {
    const mine = reactions[msgId]?.[emoji]?.includes(session.user.id)
    if (mine) await supabase.from('reactions').delete().eq('message_id', msgId).eq('user_id', session.user.id).eq('emoji', emoji)
    else await supabase.from('reactions').insert({ message_id: msgId, user_id: session.user.id, emoji })
    setCtx(null); loadReactions()
  }

  async function blockUser(userId) {
    await supabase.from('blocked_users').insert({ user_id: session.user.id, blocked_id: userId })
    setBlockedIds(prev => [...prev, userId]); setCtx(null); showToast('Заблокирован')
  }

  async function unblockUser(userId) {
    await supabase.from('blocked_users').delete().eq('user_id', session.user.id).eq('blocked_id', userId)
    setBlockedIds(prev => prev.filter(id => id !== userId)); showToast('Разблокирован')
  }

  function insertMention(username) {
    setText(p => p + '@' + username + ' ')
    taRef.current?.focus()
  }

  // Voice input
  function toggleVoice() {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) { showToast('Голосовой ввод не поддерживается в этом браузере'); return }
    if (isRecording) { recognitionRef.current?.stop(); setIsRecording(false); return }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    const rec = new SR()
    rec.lang = 'ru-RU'; rec.continuous = false; rec.interimResults = false
    rec.onresult = e => { const t = e.results[0][0].transcript; setText(p => p + t) }
    rec.onend = () => setIsRecording(false)
    rec.onerror = () => { setIsRecording(false); showToast('Ошибка микрофона') }
    recognitionRef.current = rec
    rec.start(); setIsRecording(true)
  }

  // Touch events for messages
  function onMsgTouchStart(e, msg) {
    longPressTimer.current = setTimeout(() => {
      const touch = e.touches[0]
      const menuH = 330, menuW = 220
      const x = Math.max(8, Math.min(touch.clientX - menuW/2, window.innerWidth - menuW - 8))
      const y = Math.max(8, Math.min(touch.clientY - menuH - 20, window.innerHeight - menuH - 8))
      setCtx({ msg, x, y })
    }, 450)
  }
  function onMsgTouchEnd() { clearTimeout(longPressTimer.current) }

  function onMsgRightClick(e, msg) {
    e.preventDefault(); e.stopPropagation()
    const menuH = 330, menuW = 220
    const x = Math.max(8, Math.min(e.clientX, window.innerWidth - menuW - 8))
    const y = Math.max(8, Math.min(e.clientY, window.innerHeight - menuH - 8))
    setCtx({ msg, x, y })
  }

  function onKeyDown(e) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); send() }
    if (e.key === 'Escape') { setReplyTo(null); setEditingMsg(null); setText('') }
    // @mention autocomplete hint
  }

  function onScroll(e) {
    const el = e.target
    setShowScrollBtn(el.scrollHeight - el.scrollTop - el.clientHeight > 150)
  }

  function onSwipeStart(e, msgId) {
    if (e.touches.length !== 1) return
    swipeStartX.current[msgId] = e.touches[0].clientX
  }
  function onSwipeMove(e, msg) {
    const sx = swipeStartX.current[msg.id]
    if (sx === undefined) return
    const dx = Math.max(0, Math.min(e.touches[0].clientX - sx, 72))
    if (dx > 4) setSwipeOffset(p => ({ ...p, [msg.id]: dx }))
  }
  function onSwipeEnd(e, msg) {
    const off = swipeOffset[msg.id] || 0
    if (off > 48) { setReplyTo(msg); taRef.current?.focus() }
    setSwipeOffset(p => ({ ...p, [msg.id]: 0 }))
    delete swipeStartX.current[msg.id]
  }


  const canDel = m => m.sender_id === session.user.id || myRole === 'owner' || myRole === 'admin'
  const canPin = myRole === 'owner' || myRole === 'admin' || chat?.type === 'direct'
  const canEdit = m => m.sender_id === session.user.id && !m.file_type

  const displayMsgs = searchMode && searchQ.trim()
    ? msgs.filter(m => m.content?.toLowerCase().includes(searchQ.toLowerCase()))
    : msgs

  const grouped = []
  let lastDate = null
  displayMsgs.forEach(msg => {
    const d = new Date(msg.created_at).toDateString()
    if (d !== lastDate) { grouped.push({ type: 'date', date: msg.created_at }); lastDate = d }
    grouped.push({ type: 'msg', ...msg })
  })

  if (!chat) return (
    <div className="chat-win">
      <div className="chat-empty">
        <div className="big">💬</div>
        <p style={{ fontSize: 18, fontWeight: 700 }}>Выбери чат</p>
        <p>или начни новый разговор</p>
      </div>
    </div>
  )

  const otherUser = chat.otherUser
  const online = isReallyOnline(otherUser?.online, otherUser?.last_seen)
  const headerName = curChat?.name || chat.displayName
  const headerStatus = chat.type === 'direct' ? formatLastSeen(otherUser?.last_seen, online) : `${Object.keys(members).length} участников`

  return (
    <div className={`chat-win mobile${visible ? ' visible' : ''}`}>

      {/* Header */}
      <div className="chat-head" onClick={() => { if (chat.type === 'direct' && otherUser) setViewUser(otherUser); else if (chat.type === 'group') setShowGrpSettings(true) }}>
        <button className="back-btn" onClick={e => { e.stopPropagation(); onBack() }}>‹</button>
        <div onClick={e => { if (chat.type === 'group') { e.stopPropagation(); setShowGrpSettings(true) } }}>
          <Avatar name={headerName} url={curChat?.avatar_url || chat.displayAvatar} size={40} online={online} />
        </div>
        <div className="chat-head-info">
          <div className="chat-head-name">{headerName}</div>
          <div className={`chat-head-status${online ? ' on' : ''}`}>
            {typingUsers.length > 0
              ? <span style={{ color: 'var(--accent2)' }}>печатает...</span>
              : headerStatus
            }
          </div>
        </div>
        <button className="ico-btn" onClick={e => { e.stopPropagation(); setSearchMode(p => !p) }}>🔍</button>
        {chat.type === 'group' && (
          <button className="ico-btn" onClick={e => { e.stopPropagation(); setShowGrpSettings(true) }}>⚙️</button>
        )}
      </div>

      {/* Search */}
      {searchMode && (
        <div style={{ padding: '8px 14px', background: 'var(--bg3)', borderBottom: '1px solid var(--border)', display: 'flex', gap: 10, alignItems: 'center' }}>
          <input className="f-input" style={{ flex: 1, padding: '8px 12px' }} placeholder="Поиск по сообщениям..." value={searchQ} onChange={e => setSearchQ(e.target.value)} autoFocus />
          <button className="reply-close" onClick={() => { setSearchMode(false); setSearchQ('') }}>×</button>
        </div>
      )}

      {/* Pinned */}
      {pinnedMsg && !searchMode && (
        <div className="pinned-bar">
          <span className="pin-icon">📌</span>
          <div className="pin-text">
            <div className="pin-label">Закреплено</div>
            <div className="pin-content">{pinnedMsg.content || (pinnedMsg.file_type === 'image' ? '🖼 Фото' : '📎 Файл')}</div>
          </div>
          {canPin && <button onClick={() => pinMsgFn(pinnedMsg)} className="reply-close">×</button>}
        </div>
      )}

      {/* Reply/Edit bar */}
      {(replyTo || editingMsg) && (
        <div className="reply-bar">
          <div className="reply-line" style={{ background: editingMsg ? '#f59e0b' : 'var(--accent)' }} />
          <div className="reply-info">
            <div className="reply-who">{editingMsg ? '✏️ Редактирование' : (members[replyTo.sender_id]?.full_name || 'Ответ')}</div>
            <div className="reply-what">{editingMsg ? editingMsg.content : (replyTo.content || '🖼 Фото')}</div>
          </div>
          <button className="reply-close" onClick={() => { setReplyTo(null); setEditingMsg(null); setText('') }}>×</button>
        </div>
      )}

      {/* Paste preview */}
      {pasteFile && (
        <div className="paste-preview">
          <img src={URL.createObjectURL(pasteFile)} alt="" />
          <div className="paste-preview-info">Фото вставлено — нажми ➤</div>
          <button className="paste-preview-close" onClick={() => setPasteFile(null)}>×</button>
        </div>
      )}

      {/* Messages */}
      <div className="msgs" ref={msgsRef} onScroll={onScroll} onClick={() => { setCtx(null); setShowEmojiPicker(false) }}>
        {grouped.map((item, i) => {
          if (item.type === 'date') return <div key={`d${i}`} className="date-sep">{formatDate(item.date)}</div>

          const sent = item.sender_id === session.user.id
          const sender = members[item.sender_id]
          const isBlocked = blockedIds.includes(item.sender_id) && !sent
          const next = grouped[i + 1]
          const isLast = !next || next.type === 'date' || next.sender_id !== item.sender_id
          const rcts = reactions[item.id]
          const replyMsg = item.reply_to ? msgs.find(m => m.id === item.reply_to) : null
          const msgReads = reads[item.id] || []
          const readByOthers = msgReads.filter(uid => uid !== item.sender_id)

          return (
            <div key={item.id} className={`msg-row${sent ? ' s' : ' r'}${isLast ? ' gap' : ''}`}>
              <div className="msg-inner"
                style={{ transform:`translateX(${swipeOffset[item.id]||0}px)`, transition:(swipeOffset[item.id]||0)>2?'none':'transform .2s ease' }}
                onTouchStart={e=>onSwipeStart(e,item.id)}
                onTouchMove={e=>onSwipeMove(e,item)}
                onTouchEnd={e=>onSwipeEnd(e,item)}>
                {!sent && (
                  isLast
                    ? <div style={{ flexShrink: 0, alignSelf: 'flex-end', cursor: 'pointer' }} onClick={() => sender && sender.id !== session.user.id && setViewUser(sender)}>
                        <Avatar name={sender?.full_name} url={sender?.avatar_url} size={30} />
                      </div>
                    : <div className="msg-av-gap" />
                )}

                <div className={`bubble${sent ? ' s' : ' r'}`}
                  onContextMenu={e => onMsgRightClick(e, item)}
                  onTouchStart={e => onMsgTouchStart(e, item)}
                  onTouchEnd={onMsgTouchEnd}
                  onTouchMove={onMsgTouchEnd}
                  onDoubleClick={() => !isBlocked && setReplyTo(item)}
                  style={isBlocked ? { opacity: .4 } : {}}>

                  {chat.type === 'group' && !sent && isLast && sender && (
                    <div className="bubble-sender" style={{ color: senderColor(sender.full_name), cursor: 'pointer' }}
                      onClick={() => setViewUser(sender)}>
                      {sender.full_name}
                    </div>
                  )}

                  {isBlocked && <div style={{ fontStyle: 'italic', fontSize: 13 }}>Сообщение заблокировано</div>}

                  {!isBlocked && <>
                    {/* Forwarded */}
                    {item.forwarded_from && (
                      <div style={{ borderLeft: '3px solid rgba(255,255,255,.4)', paddingLeft: 8, marginBottom: 6, opacity: .8, fontSize: 12 }}>
                        ↩ Переслано от {members[item.forwarded_from]?.full_name || 'пользователя'}
                      </div>
                    )}

                    {replyMsg && (
                      <div className="bubble-reply">
                        <div className="bubble-reply-who">{members[replyMsg.sender_id]?.full_name || '?'}</div>
                        <div className="bubble-reply-text">{replyMsg.content || '🖼 Фото'}</div>
                      </div>
                    )}

                    {item.file_type === 'image' && item.file_url && (
                      <img className="bubble-img" src={item.file_url} alt="" onClick={() => setLightbox(item.file_url)} />
                    )}
                    {item.file_type === 'video' && item.file_url && (
                      <video src={item.file_url} controls style={{ maxWidth: '100%', width: 280, borderRadius: 10, display: 'block', marginBottom: 4 }} />
                    )}
                    {item.file_type === 'audio' && item.file_url && (
                      <div style={{ minWidth: 220 }}>
                        <div style={{ fontSize: 12, opacity: .7, marginBottom: 4 }}>🎵 {item.content || 'Аудио'}</div>
                        <audio src={item.file_url} controls style={{ width: '100%' }} />
                      </div>
                    )}
                    {item.file_type === 'file' && item.file_url && (
                      <a className="bubble-file" href={item.file_url} target="_blank" rel="noreferrer">
                        <span className="bubble-file-icon">📎</span>
                        <div><div className="bubble-file-name">{item.content || 'Файл'}</div><div className="bubble-file-sub">Открыть</div></div>
                      </a>
                    )}
                    {item.content && !item.file_type && (
                      <span>{renderText(item.content, members, setViewUser)}</span>
                    )}
                  </>}

                  <div className="bubble-meta">
                    {item.edited && <span style={{ fontStyle: 'italic', marginRight: 4, fontSize: 10 }}>изм.</span>}
                    <span>{formatTime(item.created_at)}</span>
                    {sent && <span style={{ opacity: item.is_read ? 1 : .5 }}>{item.is_read ? '✓✓' : '✓'}</span>}
                  </div>
                </div>
              </div>

              {/* Group read receipts */}
              {chat.type === 'group' && sent && readByOthers.length > 0 && (
                <div className="reads-row" style={{ justifyContent: 'flex-end', paddingRight: 4 }}>
                  {readByOthers.slice(0, 5).map(uid => {
                    const m = members[uid]
                    return m ? (
                      <div key={uid} title={m.full_name} onClick={e => { e.stopPropagation(); setReadsDetail(readsDetail === item.id ? null : item.id) }}>
                        {m.avatar_url
                          ? <div className="reads-av"><img src={m.avatar_url} alt="" /></div>
                          : <div className="reads-av-ph" style={{ background: senderColor(m.full_name) }}>{m.full_name[0]}</div>
                        }
                      </div>
                    ) : null
                  })}
                  {readByOthers.length > 5 && <span style={{ fontSize: 11, color: 'var(--text3)' }}>+{readByOthers.length - 5}</span>}
                </div>
              )}

              {/* Reads detail popup */}
              {readsDetail === item.id && chat.type === 'group' && (
                <div style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 10, padding: 10, marginTop: 4, alignSelf: sent ? 'flex-end' : 'flex-start', fontSize: 13 }} onClick={e => e.stopPropagation()}>
                  <div style={{ fontWeight: 700, marginBottom: 6, fontSize: 12, color: 'var(--text3)' }}>👁 Просмотрели:</div>
                  {readByOthers.map(uid => <div key={uid} style={{ color: 'var(--text2)' }}>{members[uid]?.full_name || '?'}</div>)}
                </div>
              )}

              {/* Reactions */}
              {rcts && Object.keys(rcts).length > 0 && (
                <div className="reactions" style={{ paddingLeft: sent ? 0 : 36, justifyContent: sent ? 'flex-end' : 'flex-start' }}>
                  {Object.entries(rcts).map(([emoji, users]) => (
                    <button key={emoji} className={`reaction-btn${users.includes(session.user.id) ? ' mine' : ''}`} onClick={() => toggleReaction(item.id, emoji)}>
                      {emoji}<span className="reaction-count">{users.length}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )
        })}

        {/* Typing indicator */}
        {typingUsers.length > 0 && (
          <div className="typing-wrap">
            <div className="typing-dots">
              <div className="typing-dot" /><div className="typing-dot" /><div className="typing-dot" />
            </div>
            <div className="typing-text">печатает...</div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Scroll button */}
      {showScrollBtn && (
        <button onClick={() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); setShowScrollBtn(false) }}
          style={{ position: 'absolute', bottom: 80, right: 16, width: 42, height: 42, borderRadius: '50%', background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text)', fontSize: 18, cursor: 'pointer', zIndex: 10, boxShadow: '0 4px 12px rgba(0,0,0,.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>↓</button>
      )}

      {/* Context menu */}
      {ctx && (
        <>
          <div className="ctx-overlay" onClick={() => setCtx(null)} />
          <div className="ctx" style={{ left: ctx.x, top: ctx.y }}>
            <div className="ctx-emojis">
              {EMOJIS.map(e => <button key={e} className="ctx-emoji" onClick={() => toggleReaction(ctx.msg.id, e)}>{e}</button>)}
            </div>
            <button className="ctx-item" onClick={() => { setReplyTo(ctx.msg); setCtx(null); taRef.current?.focus() }}>↩️ Ответить</button>
            {canEdit(ctx.msg) && <button className="ctx-item" onClick={() => startEdit(ctx.msg)}>✏️ Изменить</button>}
            <button className="ctx-item" onClick={() => { setForwardMsg(ctx.msg); setCtx(null) }}>↗️ Переслать</button>
            {canPin && <button className="ctx-item" onClick={() => pinMsgFn(ctx.msg)}>📌 {pinnedMsg?.id === ctx.msg.id ? 'Открепить' : 'Закрепить'}</button>}
            {chat.type === 'group' && !ctx.msg.file_type && ctx.msg.content && (
              <button className="ctx-item" onClick={() => { navigator.clipboard.writeText(ctx.msg.content); setCtx(null); showToast('Скопировано') }}>📋 Копировать</button>
            )}
            {ctx.msg.sender_id !== session.user.id && !blockedIds.includes(ctx.msg.sender_id) && (
              <button className="ctx-item danger" onClick={() => blockUser(ctx.msg.sender_id)}>🚫 Заблокировать</button>
            )}
            {canDel(ctx.msg) && <button className="ctx-item danger" onClick={() => deleteMsgFn(ctx.msg)}>🗑 Удалить</button>}
          </div>
        </>
      )}

      {/* Emoji picker */}
      {showEmojiPicker && (
        <div className="emoji-picker" onClick={e => e.stopPropagation()}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 8, borderBottom: '1px solid var(--border)', paddingBottom: 8 }}>
            {Object.keys(EMOJI_CATEGORIES).map(cat => (
              <button key={cat} onClick={() => setEmojiCat(cat)} style={{ background: emojiCat === cat ? 'var(--bg4)' : 'none', border: 'none', fontSize: 20, cursor: 'pointer', padding: '4px 8px', borderRadius: 8 }}>{cat}</button>
            ))}
          </div>
          <div className="emoji-grid">
            {(EMOJI_CATEGORIES[emojiCat] || []).map(e => (
              <button key={e} onClick={() => { setText(p => p + e); setShowEmojiPicker(false); taRef.current?.focus() }}>{e}</button>
            ))}
          </div>
        </div>
      )}

      {/* Forward modal */}
      {forwardMsg && <ForwardModal msg={forwardMsg} session={session} onClose={() => setForwardMsg(null)} showToast={showToast}/>}

      {/* Input */}
      <div className="msg-input-area">
        <div className="msg-input-wrap">
          <button className="attach-btn" onClick={e => { e.stopPropagation(); setShowEmojiPicker(p => !p) }}>😊</button>
          <button className="attach-btn" onClick={() => fileRef.current?.click()}>📎</button>
          <textarea ref={taRef} className="msg-textarea"
            placeholder={isRecording ? '🎙 Запись...' : (editingMsg ? 'Редактирование...' : 'Сообщение... (Ctrl+Enter отправить)')}
            value={text} onChange={e => setText(e.target.value)} onKeyDown={onKeyDown} rows={1} />
          <button className={`voice-btn${isRecording ? ' recording' : ''}`} onClick={toggleVoice} title="Голосовой ввод">🎙</button>
        </div>
        <button className="send-btn" onClick={send} disabled={(!text.trim() && !pasteFile) || sending}>
          {editingMsg ? '✓' : '➤'}
        </button>
        <input ref={fileRef} type="file" style={{ display: 'none' }} onChange={pickAndSend} accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.zip,.txt" />
      </div>

      {lightbox && <div className="lightbox" onClick={() => setLightbox(null)}><img src={lightbox} alt="" /></div>}

      {showGrpSettings && (
        <GroupSettingsModal chat={curChat} session={session} myRole={myRole}
          onClose={() => setShowGrpSettings(false)}
          onUpdated={u => { if (u) { setCurChat(p => ({ ...p, ...u })); onRefresh() } else { onBack(); onRefresh() } }}
          onViewUser={setViewUser} showToast={showToast} members={members} onInsertMention={insertMention} />
      )}

      {viewUser && (
        <UserProfileModal user={viewUser} session={session}
          onClose={() => setViewUser(null)}
          onStartChat={c => { setViewUser(null); onBack(); setTimeout(onRefresh, 100) }}
          onBlock={blockUser} onUnblock={unblockUser}
          isBlocked={blockedIds.includes(viewUser?.id)}
          showToast={showToast} />
      )}
    </div>
  )
}
