import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import Sidebar from './Sidebar'
import ChatWindow from './ChatWindow'
import ProfileModal from './ProfileModal'
import UserProfileModal from './UserProfileModal'
import AdminModal from './AdminModal'
import NewChatModal from './NewChatModal'

export default function MainPage({ session, profile, onProfileUpdate }) {
  const [chats, setChats] = useState([])
  const [activeChat, setActiveChat] = useState(null)
  const [showProfile, setShowProfile] = useState(false)
  const [showAdmin, setShowAdmin] = useState(false)
  const [showNewChat, setShowNewChat] = useState(false)
  const [showChat, setShowChat] = useState(false)
  const [viewUser, setViewUser] = useState(null)
  const [toast, setToast] = useState(null)

  useEffect(() => {
    loadChats()
    setOnline(true)
    const interval = setInterval(updateLastSeen, 30000)
    const handleUnload = () => setOnline(false)
    window.addEventListener('beforeunload', handleUnload)
    return () => { clearInterval(interval); handleUnload() }
  }, [])

  // Realtime: refresh sidebar when new message arrives
  useEffect(() => {
    const channel = supabase.channel('sidebar-refresh')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, () => loadChats())
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles' }, () => loadChats())
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [])

  async function setOnline(online) {
    await supabase.from('profiles').update({ online, last_seen: new Date().toISOString() }).eq('id', session.user.id)
  }

  async function updateLastSeen() {
    await supabase.from('profiles').update({ last_seen: new Date().toISOString() }).eq('id', session.user.id)
  }

  async function loadChats() {
    // Step 1: get chat IDs this user belongs to
    const { data: memberRows } = await supabase
      .from('chat_members')
      .select('chat_id')
      .eq('user_id', session.user.id)

    if (!memberRows || memberRows.length === 0) { setChats([]); return }
    const chatIds = memberRows.map(r => r.chat_id)

    // Step 2: get chats
    const { data: chatData } = await supabase
      .from('chats')
      .select('*')
      .in('id', chatIds)

    if (!chatData) return

    // Step 3: for each chat get members + last message
    const enriched = await Promise.all(chatData.map(async (chat) => {
      const { data: membersData } = await supabase
        .from('chat_members')
        .select('user_id, role, profiles(id, full_name, username, avatar_url, online, last_seen)')
        .eq('chat_id', chat.id)

      const { data: lastMsgArr } = await supabase
        .from('messages')
        .select('id, content, file_type, created_at, sender_id, is_read')
        .eq('chat_id', chat.id)
        .eq('deleted', false)
        .order('created_at', { ascending: false })
        .limit(1)

      const { count: unreadCount } = await supabase
        .from('messages')
        .select('id', { count: 'exact', head: true })
        .eq('chat_id', chat.id)
        .eq('is_read', false)
        .eq('deleted', false)
        .neq('sender_id', session.user.id)

      const otherMembers = (membersData || [])
        .filter(m => m.user_id !== session.user.id)
        .map(m => ({ ...m.profiles, role: m.role }))

      const myMember = (membersData || []).find(m => m.user_id === session.user.id)
      const lastMsg = lastMsgArr?.[0] || null

      return {
        ...chat,
        otherMembers,
        myRole: myMember?.role || 'member',
        lastMsg,
        unread: unreadCount || 0,
        displayName: chat.type === 'group' ? chat.name : (otherMembers[0]?.full_name || 'Неизвестный'),
        displayAvatar: chat.type === 'group' ? chat.avatar_url : otherMembers[0]?.avatar_url,
        isOnline: chat.type === 'direct' && otherMembers[0]?.online,
        otherUser: chat.type === 'direct' ? otherMembers[0] : null,
      }
    }))

    enriched.sort((a, b) => {
      const aT = a.lastMsg?.created_at || a.created_at
      const bT = b.lastMsg?.created_at || b.created_at
      return new Date(bT) - new Date(aT)
    })

    setChats(enriched)
  }

  function showToast(msg) {
    setToast(msg)
    setTimeout(() => setToast(null), 2500)
  }

  function openChat(chat) {
    setActiveChat(chat)
    setShowChat(true)
  }

  function closeChat() {
    setShowChat(false)
    setTimeout(() => setActiveChat(null), 300)
    loadChats()
  }

  return (
    <div className="app-layout">
      <Sidebar
        profile={profile}
        chats={chats}
        activeChat={activeChat}
        onSelectChat={openChat}
        onNewChat={() => setShowNewChat(true)}
        onProfileClick={() => setShowProfile(true)}
        onAdminClick={() => setShowAdmin(true)}
        hidden={showChat}
      />

      <ChatWindow
        chat={activeChat}
        session={session}
        profile={profile}
        visible={showChat}
        onBack={closeChat}
        onRefresh={loadChats}
        showToast={showToast}
        onViewUser={setViewUser}
      />

      {showProfile && (
        <ProfileModal profile={profile} session={session} onClose={() => setShowProfile(false)} onUpdate={onProfileUpdate} showToast={showToast} />
      )}

      {viewUser && (
        <UserProfileModal user={viewUser} session={session} onClose={() => setViewUser(null)} onStartChat={(chat) => { setViewUser(null); openChat(chat) }} showToast={showToast} />
      )}

      {showAdmin && (
        <AdminModal profile={profile} session={session} onClose={() => setShowAdmin(false)} showToast={showToast} />
      )}

      {showNewChat && (
        <NewChatModal
          session={session} profile={profile}
          onClose={() => setShowNewChat(false)}
          onCreated={(chat) => { loadChats(); openChat(chat); setShowNewChat(false) }}
          showToast={showToast}
        />
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
