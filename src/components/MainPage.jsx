import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../supabase'
import Sidebar from './Sidebar'
import ChatWindow from './ChatWindow'
import ProfileModal, { UserProfileModal, AdminModal, SettingsModal } from './ProfileModal'
import NewChatModal from './NewChatModal'
import { Avatar } from './helpers.jsx'

// Request browser push notification permission
async function requestNotifPermission() {
  if (!('Notification' in window)) return false
  if (Notification.permission === 'granted') return true
  if (Notification.permission === 'denied') return false
  const result = await Notification.requestPermission()
  return result === 'granted'
}

function showBrowserNotif(title, body, icon) {
  if (Notification.permission !== 'granted') return
  if (document.hasFocus()) return // don't show if tab is active
  try {
    new Notification(title, { body, icon: icon || '/icon-192.png', badge: '/icon-192.png', tag: 'grishachat-msg', renotify: true })
  } catch(e) {}
}

export default function MainPage({ session, profile, onProfileUpdate }) {
  const [chats, setChats] = useState([])
  const [activeChat, setActiveChat] = useState(null)
  const [showChat, setShowChat] = useState(false)
  const [modal, setModal] = useState(null)
  const [viewUser, setViewUser] = useState(null)
  const [toast, setToast] = useState(null)
  const [notif, setNotif] = useState(null)
  const toastTimer = useRef(null)
  const notifTimer = useRef(null)
  const activeChatRef = useRef(null)
  const myChatsRef = useRef([])

  useEffect(() => { activeChatRef.current = activeChat }, [activeChat])
  useEffect(() => { myChatsRef.current = chats.map(c => c.id) }, [chats])

  useEffect(() => {
    loadChats()
    setOnline(true)
    requestNotifPermission()

    const iv = setInterval(updateSeen, 25000)

    // Visibility change = online/offline
    const onVis = () => {
      if (document.hidden) setOnline(false)
      else { setOnline(true); loadChats() }
    }
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('beforeunload', () => setOnline(false))

    // Realtime: only messages in MY chats
    const ch = supabase.channel('main-rt')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, async p => {
        const msg = p.new
        // Only care about chats I'm in
        if (!myChatsRef.current.includes(msg.chat_id)) return
        loadChats()
        // Not my message, not in current chat
        if (msg.sender_id === session.user.id) return
        if (activeChatRef.current?.id === msg.chat_id) return

        const { data: sender } = await supabase.from('profiles').select('full_name,avatar_url').eq('id', msg.sender_id).single()
        if (!sender) return

        const text = msg.file_type === 'image' ? '🖼 Фото' : msg.file_type === 'file' ? '📎 Файл' : msg.content
        const chatName = chats.find(c => c.id === msg.chat_id)?.displayName || ''

        // In-app notification banner
        setNotif({ name: sender.full_name, avatar: sender.avatar_url, text, chatId: msg.chat_id, chatName })
        if (notifTimer.current) clearTimeout(notifTimer.current)
        notifTimer.current = setTimeout(() => setNotif(null), 5000)

        // Browser push notification (works when tab not focused)
        showBrowserNotif(`${sender.full_name}${chatName ? ` • ${chatName}` : ''}`, text, sender.avatar_url)
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles' }, loadChats)
      .subscribe()

    return () => { clearInterval(iv); document.removeEventListener('visibilitychange', onVis); supabase.removeChannel(ch) }
  }, [])

  async function setOnline(v) {
    await supabase.from('profiles').update({ online: v, last_seen: new Date().toISOString() }).eq('id', session.user.id)
  }
  async function updateSeen() {
    await supabase.from('profiles').update({ last_seen: new Date().toISOString() }).eq('id', session.user.id)
  }

  const loadChats = useCallback(async () => {
    const { data: mem } = await supabase.from('chat_members').select('chat_id').eq('user_id', session.user.id)
    if (!mem?.length) { setChats([]); return }
    const ids = mem.map(m => m.chat_id)
    const { data: cs } = await supabase.from('chats').select('*').in('id', ids)
    if (!cs) return

    const enriched = await Promise.all(cs.map(async chat => {
      const [{ data: members }, { data: lastArr }, { count: unread }] = await Promise.all([
        supabase.from('chat_members').select('user_id,role,profiles(id,full_name,username,avatar_url,online,last_seen)').eq('chat_id', chat.id),
        supabase.from('messages').select('id,content,file_type,created_at,sender_id,is_read').eq('chat_id', chat.id).eq('deleted', false).order('created_at', { ascending: false }).limit(1),
        supabase.from('messages').select('id', { count: 'exact', head: true }).eq('chat_id', chat.id).eq('deleted', false).eq('is_read', false).neq('sender_id', session.user.id)
      ])
      const others = (members || []).filter(m => m.user_id !== session.user.id).map(m => ({ ...m.profiles, role: m.role }))
      const me = (members || []).find(m => m.user_id === session.user.id)
      const last = lastArr?.[0] || null

      // Real online check
      const otherUser = chat.type === 'direct' ? others[0] : null
      const reallyOnline = otherUser && otherUser.online && otherUser.last_seen &&
        (Date.now() - new Date(otherUser.last_seen)) < 3 * 60 * 1000

      return {
        ...chat,
        otherMembers: others,
        myRole: me?.role || 'member',
        lastMsg: last,
        unread: unread || 0,
        displayName: chat.type === 'group' ? chat.name : (others[0]?.full_name || '?'),
        displayAvatar: chat.type === 'group' ? chat.avatar_url : others[0]?.avatar_url,
        isOnline: reallyOnline,
        otherUser,
      }
    }))

    enriched.sort((a, b) => new Date(b.lastMsg?.created_at || b.created_at) - new Date(a.lastMsg?.created_at || a.created_at))
    setChats(enriched)
  }, [session.user.id])

  function showToast(msg) {
    if (toastTimer.current) clearTimeout(toastTimer.current)
    setToast(msg)
    toastTimer.current = setTimeout(() => setToast(null), 2600)
  }

  function openChat(chat) { setActiveChat(chat); setShowChat(true) }
  function closeChat() { setShowChat(false); setTimeout(() => setActiveChat(null), 300); loadChats() }

  // Delete chat: owner deletes fully, others just leave
  async function deleteChat(chatId) {
    const chat = chats.find(c => c.id === chatId)
    const isOwner = chat?.owner_id === session.user.id || chat?.myRole === 'owner' || chat?.created_by === session.user.id

    if (isOwner && chat?.type === 'group') {
      // Owner: fully delete the chat
      const { error } = await supabase.from('chats').delete().eq('id', chatId)
      if (error) {
        // Fallback: just leave
        await supabase.from('chat_members').delete().eq('chat_id', chatId).eq('user_id', session.user.id)
      }
    } else {
      // Non-owner: just leave (remove self from members)
      await supabase.from('chat_members').delete().eq('chat_id', chatId).eq('user_id', session.user.id)
    }

    setChats(prev => prev.filter(c => c.id !== chatId))
    if (activeChat?.id === chatId) closeChat()
    showToast(isOwner && chat?.type === 'group' ? 'Группа удалена' : 'Чат удалён')
  }

  async function pinChat(chatId, pinned) {
    // Save to DB so it persists after reload
    await supabase.from('chats').update({ pinned }).eq('id', chatId)
    setChats(prev => prev.map(c => c.id === chatId ? { ...c, pinned } : c))
  }

  // Create favorites chat
  async function createFavorites() {
    // Check if already exists
    const existing = chats.find(c => c.is_favorite)
    if (existing) { openChat(existing); return }

    const { data: chat } = await supabase.from('chats').insert({
      type: 'direct', name: 'Избранное', created_by: session.user.id, is_favorite: true
    }).select().single()
    await supabase.from('chat_members').insert([{ chat_id: chat.id, user_id: session.user.id, role: 'owner' }])
    loadChats()
    openChat({ ...chat, displayName: '⭐ Избранное', type: 'direct', myRole: 'owner' })
  }

  // Suggestion bot - sends message to Grisha's account
  async function openSuggestionBot() {
    // Find or create suggestions chat
    const existing = chats.find(c => c.is_suggestions)
    if (existing) { openChat(existing); return }

    // Find @grisha profile
    const { data: grisha } = await supabase.from('profiles').select('*').eq('username', 'grisha').single()
    
    const { data: chat } = await supabase.from('chats').insert({
      type: 'direct',
      name: '💡 Предложения',
      created_by: session.user.id,
      is_suggestions: true
    }).select().single()

    const members = [{ chat_id: chat.id, user_id: session.user.id, role: 'member' }]
    if (grisha && grisha.id !== session.user.id) {
      members.push({ chat_id: chat.id, user_id: grisha.id, role: 'member' })
    }
    await supabase.from('chat_members').insert(members)

    // Send welcome message
    await supabase.from('messages').insert({
      chat_id: chat.id, sender_id: session.user.id,
      content: `👋 Привет! Это чат для предложений по улучшению GrishaChat.\nПиши свои идеи — Гриша их увидит!`,
      is_read: false, deleted: false
    })

    loadChats()
    openChat({ ...chat, displayName: '💡 Предложения', type: 'direct', otherUser: grisha })
  }

  return (
    <div className="app">
      <Sidebar
        profile={profile} chats={chats} activeChat={activeChat}
        onSelect={openChat} onNewChat={() => setModal('newchat')}
        onProfileClick={() => setModal('profile')}
        onAdminClick={() => setModal('admin')}
        onSettings={() => setModal('settings')}
        onDeleteChat={deleteChat} onPinChat={pinChat}
        onFavorites={createFavorites}
        onSuggestions={openSuggestionBot}
        hidden={showChat}
      />
      <ChatWindow
        chat={activeChat} session={session} profile={profile}
        visible={showChat} onBack={closeChat} onRefresh={loadChats}
        showToast={showToast} onViewUser={setViewUser}
      />

      {modal === 'profile' && <ProfileModal profile={profile} session={session} onClose={() => setModal(null)} onUpdate={onProfileUpdate} showToast={showToast} />}
      {modal === 'admin' && <AdminModal profile={profile} session={session} onClose={() => setModal(null)} showToast={showToast} />}
      {modal === 'newchat' && <NewChatModal session={session} profile={profile} onClose={() => setModal(null)} onCreated={c => { loadChats(); openChat(c); setModal(null) }} showToast={showToast} />}
      {modal === 'settings' && <SettingsModal profile={profile} session={session} onClose={() => setModal(null)} onUpdate={onProfileUpdate} showToast={showToast} chats={chats} />}
      {viewUser && <UserProfileModal user={viewUser} session={session} onClose={() => setViewUser(null)} onStartChat={c => { setViewUser(null); openChat(c) }} showToast={showToast} />}

      {toast && <div className="toast">{toast}</div>}

      {/* In-app notification — only for current user, filtered correctly */}
      {notif && (
        <div className="notif-banner" onClick={() => { const c = chats.find(x => x.id === notif.chatId); if (c) openChat(c); setNotif(null) }}>
          <div className="notif-av"><Avatar name={notif.name} url={notif.avatar} size={44} /></div>
          <div className="notif-body">
            <div className="notif-name">{notif.name}</div>
            <div className="notif-text">{notif.text}</div>
          </div>
          <button className="notif-close" onClick={e => { e.stopPropagation(); setNotif(null) }}>×</button>
        </div>
      )}
    </div>
  )
}
