import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../supabase'
import Sidebar from './Sidebar'
import ChatWindow from './ChatWindow'
import ProfileModal, { UserProfileModal, AdminModal, SettingsModal } from './ProfileModal'
import NewChatModal from './NewChatModal'
import { Avatar } from './helpers.jsx'

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

  // Keep ref in sync so realtime handler can read current chat
  useEffect(() => { activeChatRef.current = activeChat }, [activeChat])

  useEffect(() => {
    loadChats()
    setOnline(true)
    const iv = setInterval(updateSeen, 25000)
    const unload = () => setOnline(false)
    window.addEventListener('beforeunload', unload)

    // Realtime: refresh sidebar + show notifications
    const ch = supabase.channel('main-rt')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, async (payload) => {
        loadChats()
        const msg = payload.new
        // Don't notify for own messages or if chat is open
        if (msg.sender_id === session.user.id) return
        if (activeChatRef.current?.id === msg.chat_id) return

        // Get sender info for notification
        const { data: sender } = await supabase.from('profiles').select('full_name, avatar_url').eq('id', msg.sender_id).single()
        if (sender) {
          showNotif({
            name: sender.full_name,
            avatar: sender.avatar_url,
            text: msg.file_type === 'image' ? '🖼 Фото' : msg.file_type === 'file' ? '📎 Файл' : msg.content,
            chatId: msg.chat_id
          })
        }
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles' }, loadChats)
      .subscribe()

    return () => { clearInterval(iv); unload(); supabase.removeChannel(ch) }
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
      return {
        ...chat,
        otherMembers: others,
        myRole: me?.role || 'member',
        lastMsg: last,
        unread: unread || 0,
        displayName: chat.type === 'group' ? chat.name : (others[0]?.full_name || '?'),
        displayAvatar: chat.type === 'group' ? chat.avatar_url : others[0]?.avatar_url,
        isOnline: chat.type === 'direct' && others[0]?.online,
        otherUser: chat.type === 'direct' ? others[0] : null,
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

  function showNotif(data) {
    if (notifTimer.current) clearTimeout(notifTimer.current)
    setNotif(data)
    notifTimer.current = setTimeout(() => setNotif(null), 4000)
  }

  function openChat(chat) { setActiveChat(chat); setShowChat(true) }
  function closeChat() { setShowChat(false); setTimeout(() => setActiveChat(null), 300); loadChats() }

  async function deleteChat(chatId) {
    await supabase.from('chat_members').delete().eq('chat_id', chatId).eq('user_id', session.user.id)
    setChats(prev => prev.filter(c => c.id !== chatId))
    if (activeChat?.id === chatId) closeChat()
    showToast('Чат удалён')
  }

  function pinChat(chatId, pinned) {
    setChats(prev => prev.map(c => c.id === chatId ? { ...c, pinned } : c))
  }

  function openNotifChat(chatId) {
    setNotif(null)
    const chat = chats.find(c => c.id === chatId)
    if (chat) openChat(chat)
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
      {modal === 'settings' && <SettingsModal profile={profile} session={session} onClose={() => setModal(null)} onUpdate={onProfileUpdate} showToast={showToast} />}
      {viewUser && <UserProfileModal user={viewUser} session={session} onClose={() => setViewUser(null)} onStartChat={c => { setViewUser(null); openChat(c) }} showToast={showToast} />}

      {toast && <div className="toast">{toast}</div>}

      {/* In-app notification banner */}
      {notif && (
        <div className="notif-banner" style={{ cursor: 'pointer' }} onClick={() => openNotifChat(notif.chatId)}>
          <div className="notif-av">
            <Avatar name={notif.name} url={notif.avatar} size={44} />
          </div>
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
