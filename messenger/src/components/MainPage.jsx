import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import Sidebar from './Sidebar'
import ChatWindow from './ChatWindow'
import ProfileModal from './ProfileModal'
import AdminModal from './AdminModal'
import NewChatModal from './NewChatModal'

export default function MainPage({ session, profile, onProfileUpdate }) {
  const [chats, setChats] = useState([])
  const [activeChat, setActiveChat] = useState(null)
  const [showProfile, setShowProfile] = useState(false)
  const [showAdmin, setShowAdmin] = useState(false)
  const [showNewChat, setShowNewChat] = useState(false)
  const [showChat, setShowChat] = useState(false)
  const [toast, setToast] = useState(null)

  useEffect(() => {
    loadChats()
    setOnline(true)

    const interval = setInterval(() => updateLastSeen(), 30000)
    window.addEventListener('beforeunload', () => setOnline(false))

    return () => {
      clearInterval(interval)
      setOnline(false)
    }
  }, [])

  async function setOnline(online) {
    await supabase.from('profiles').update({
      online,
      last_seen: new Date().toISOString()
    }).eq('id', session.user.id)
  }

  async function updateLastSeen() {
    await supabase.from('profiles').update({
      last_seen: new Date().toISOString()
    }).eq('id', session.user.id)
  }

  async function loadChats() {
    const { data: memberRows } = await supabase
      .from('chat_members')
      .select('chat_id')
      .eq('user_id', session.user.id)

    if (!memberRows || memberRows.length === 0) { setChats([]); return }

    const chatIds = memberRows.map(r => r.chat_id)

    const { data: chatData } = await supabase
      .from('chats')
      .select(`
        *,
        chat_members (
          user_id,
          profiles (id, full_name, username, avatar_url, online, last_seen)
        ),
        messages (
          id, content, file_url, file_type, created_at, sender_id, is_read
        )
      `)
      .in('id', chatIds)
      .order('created_at', { referencedTable: 'messages', ascending: false })

    if (!chatData) return

    const processed = chatData.map(chat => {
      const otherMembers = chat.chat_members
        .filter(m => m.user_id !== session.user.id)
        .map(m => m.profiles)

      const lastMsg = chat.messages?.[0] || null
      const unread = chat.messages?.filter(m =>
        !m.is_read && m.sender_id !== session.user.id
      ).length || 0

      return {
        ...chat,
        otherMembers,
        lastMsg,
        unread,
        displayName: chat.type === 'group'
          ? chat.name
          : otherMembers[0]?.full_name || 'Неизвестный',
        displayAvatar: chat.type === 'group'
          ? chat.avatar_url
          : otherMembers[0]?.avatar_url,
        isOnline: chat.type === 'direct' && otherMembers[0]?.online,
        otherUser: chat.type === 'direct' ? otherMembers[0] : null
      }
    })

    processed.sort((a, b) => {
      const aTime = a.lastMsg?.created_at || a.created_at
      const bTime = b.lastMsg?.created_at || b.created_at
      return new Date(bTime) - new Date(aTime)
    })

    setChats(processed)
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
        onRefresh={loadChats}
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
      />

      {showProfile && (
        <ProfileModal
          profile={profile}
          session={session}
          onClose={() => setShowProfile(false)}
          onUpdate={onProfileUpdate}
          showToast={showToast}
        />
      )}

      {showAdmin && (
        <AdminModal
          profile={profile}
          session={session}
          onClose={() => setShowAdmin(false)}
          showToast={showToast}
        />
      )}

      {showNewChat && (
        <NewChatModal
          session={session}
          profile={profile}
          onClose={() => setShowNewChat(false)}
          onCreated={(chat) => { loadChats(); openChat(chat); setShowNewChat(false) }}
          showToast={showToast}
        />
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
