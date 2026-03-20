import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import { Avatar, senderColor } from './helpers.jsx'

const ROLE_L = { owner: '👑 Владелец', admin: '⭐ Админ', member: '👤 Участник' }
const ROLE_C = { owner: '#f59e0b', admin: '#a78bfa', member: 'var(--text3)' }

function SectionTitle({ children }) {
  return <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent2)', textTransform: 'uppercase', letterSpacing: .6, marginBottom: 8, marginTop: 4 }}>{children}</div>
}

function SettItem({ icon, label, value, onClick, danger, badge }) {
  return (
    <div onClick={onClick} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 14px', background: 'var(--bg3)', cursor: onClick ? 'pointer' : 'default', transition: 'background .12s', borderRadius: 12, marginBottom: 6 }}
      onMouseEnter={e => onClick && (e.currentTarget.style.background = 'var(--bg4)')}
      onMouseLeave={e => (e.currentTarget.style.background = 'var(--bg3)')}>
      <span style={{ fontSize: 20, width: 26, textAlign: 'center' }}>{icon}</span>
      <span style={{ flex: 1, fontSize: 15, color: danger ? '#fca5a5' : 'var(--text)' }}>{label}</span>
      {badge && <span style={{ background: 'var(--accent)', color: '#fff', borderRadius: 10, padding: '1px 8px', fontSize: 12, fontWeight: 700 }}>{badge}</span>}
      {value && <span style={{ fontSize: 13, color: 'var(--text3)' }}>{value}</span>}
      {onClick && !badge && <span style={{ color: 'var(--text3)' }}>›</span>}
    </div>
  )
}

export default function GroupSettingsModal({ chat, session, myRole, onClose, onUpdated, onViewUser, showToast, members: membersMap = {} }) {
  const [members, setMembers] = useState([])
  const [gName, setGName] = useState(chat.name || '')
  const [gDesc, setGDesc] = useState(chat.description || '')
  const [q, setQ] = useState('')
  const [res, setRes] = useState([])
  const [loading, setLoading] = useState(false)
  const [avLoading, setAvLoading] = useState(false)
  const [tab, setTab] = useState('info')
  const [roleMenu, setRoleMenu] = useState(null)
  const [stats, setStats] = useState({ msgs: 0, media: 0 })

  useEffect(() => { loadMembers(); loadStats() }, [])

  async function loadMembers() {
    const { data } = await supabase.from('chat_members')
      .select('user_id,role,joined_at,profiles(id,full_name,username,avatar_url,online,last_seen,bio)')
      .eq('chat_id', chat.id)
    const list = (data || []).map(m => ({ ...m.profiles, role: m.role || 'member', joined_at: m.joined_at }))
    list.sort((a, b) => ({ owner: 0, admin: 1, member: 2 }[a.role] || 2) - ({ owner: 0, admin: 1, member: 2 }[b.role] || 2))
    setMembers(list)
  }

  async function loadStats() {
    const [{ count: msgs }, { count: media }] = await Promise.all([
      supabase.from('messages').select('id', { count: 'exact', head: true }).eq('chat_id', chat.id).eq('deleted', false),
      supabase.from('messages').select('id', { count: 'exact', head: true }).eq('chat_id', chat.id).eq('deleted', false).in('file_type', ['image', 'video', 'file'])
    ])
    setStats({ msgs: msgs || 0, media: media || 0 })
  }

  async function searchUsers(v) {
    setQ(v); if (v.length < 2) { setRes([]); return }
    const { data } = await supabase.from('profiles').select('id,full_name,username,avatar_url,online').neq('id', session.user.id).or(`username.ilike.%${v}%,full_name.ilike.%${v}%`).limit(8)
    const ids = members.map(m => m.id)
    setRes(data?.filter(u => !ids.includes(u.id)) || [])
  }

  async function addMember(user) {
    await supabase.from('chat_members').insert({ chat_id: chat.id, user_id: user.id, role: 'member' })
    await loadMembers(); setQ(''); setRes([]); showToast(`${user.full_name} добавлен ✓`)
  }

  async function removeMember(userId) {
    const isSelf = userId === session.user.id
    if (!window.confirm(isSelf ? 'Покинуть группу?' : 'Удалить участника?')) return
    await supabase.from('chat_members').delete().eq('chat_id', chat.id).eq('user_id', userId)
    if (isSelf) { onClose(); onUpdated(null); return }
    await loadMembers(); showToast('Участник удалён')
  }

  async function changeRole(userId, role) {
    await supabase.from('chat_members').update({ role }).eq('chat_id', chat.id).eq('user_id', userId)
    await loadMembers(); setRoleMenu(null); showToast(`Роль: ${ROLE_L[role]}`)
  }

  async function saveName() {
    if (!gName.trim()) return; setLoading(true)
    const { data } = await supabase.from('chats').update({ name: gName.trim() }).eq('id', chat.id).select().single()
    onUpdated(data); showToast('Сохранено ✓'); setLoading(false)
  }

  async function changeAv(e) {
    const f = e.target.files[0]; if (!f) return; setAvLoading(true)
    const fn = `group_${chat.id}.${f.name.split('.').pop()}`
    await supabase.storage.from('avatars').upload(fn, f, { upsert: true })
    const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(fn)
    const { data } = await supabase.from('chats').update({ avatar_url: publicUrl + '?t=' + Date.now() }).eq('id', chat.id).select().single()
    onUpdated(data); setAvLoading(false); showToast('Фото обновлено ✓'); e.target.value = ''
  }

  async function clearGroupHistory() {
    if (!window.confirm('Очистить всю историю группы? (только ваши сообщения)')) return
    await supabase.from('messages').update({ deleted: true, content: null, file_url: null }).eq('chat_id', chat.id).eq('sender_id', session.user.id)
    showToast('История очищена')
  }

  async function deleteGroupFully() {
    if (myRole !== 'owner') { showToast('Только владелец может удалить группу'); return }
    if (!window.confirm('Удалить группу полностью? Это необратимо.')) return
    await supabase.from('chats').delete().eq('id', chat.id)
    onClose(); onUpdated(null); showToast('Группа удалена')
  }

  const canManage = myRole === 'owner' || myRole === 'admin'

  const tabs = [
    { id: 'info', label: 'Инфо' },
    { id: 'members', label: `Участники (${members.length})` },
    canManage && { id: 'add', label: '+ Добавить' },
    { id: 'media', label: 'Медиа' },
  ].filter(Boolean)

  return (
    <div className="overlay" onClick={e => { if (e.target === e.currentTarget) { onClose(); setRoleMenu(null) } }}>
      <div className="modal wide" style={{ maxWidth: 500 }}>
        <div className="modal-head">
          <span className="modal-title">⚙️ Настройки группы</span>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        {/* Stats banner */}
        <div className="grp-banner" style={{ marginBottom: 16 }}>
          <div style={{ position: 'relative', zIndex: 1, textAlign: 'center' }}>
            <div style={{ fontSize: 13, color: 'var(--text3)', marginBottom: 8 }}>Статистика группы</div>
            <div className="grp-stat">
              <div className="grp-stat-item"><div className="grp-stat-num">{members.length}</div><div className="grp-stat-label">Участников</div></div>
              <div className="grp-stat-item"><div className="grp-stat-num">{stats.msgs}</div><div className="grp-stat-label">Сообщений</div></div>
              <div className="grp-stat-item"><div className="grp-stat-num">{stats.media}</div><div className="grp-stat-label">Медиафайлов</div></div>
            </div>
          </div>
        </div>

        <div className="tabs">
          {tabs.map(t => <button key={t.id} className={`tab${tab === t.id ? ' on' : ''}`} onClick={() => setTab(t.id)}>{t.label}</button>)}
        </div>

        {/* ── INFO ── */}
        {tab === 'info' && (
          <div>
            <label htmlFor="grp-av">
              <div className="profile-av-big" style={{ background: chat.avatar_url ? 'transparent' : 'var(--accent)', fontSize: 32, cursor: canManage ? 'pointer' : 'default' }}>
                {chat.avatar_url ? <img src={chat.avatar_url} alt="" /> : (chat.name || 'G')[0].toUpperCase()}
                {avLoading && <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%' }}><div className="spin" style={{ width: 22, height: 22 }} /></div>}
              </div>
            </label>
            {canManage && <input id="grp-av" type="file" accept="image/*" style={{ display: 'none' }} onChange={changeAv} />}

            {canManage ? (
              <>
                <div className="f-group" style={{ marginTop: 16 }}>
                  <label className="f-label">Название группы</label>
                  <input className="f-input" value={gName} onChange={e => setGName(e.target.value)} />
                </div>
                <button className="btn-primary" onClick={saveName} disabled={loading || !gName.trim()}>{loading ? 'Сохранение...' : 'Сохранить изменения'}</button>
              </>
            ) : (
              <p style={{ textAlign: 'center', fontSize: 20, fontWeight: 700, marginTop: 16, marginBottom: 8 }}>{chat.name}</p>
            )}

            <div style={{ marginTop: 20 }}>
              <SectionTitle>Действия</SectionTitle>
              <SettItem icon="🧹" label="Очистить мою историю" onClick={clearGroupHistory} />
              <SettItem icon="🚪" label="Покинуть группу" onClick={() => removeMember(session.user.id)} danger />
              {myRole === 'owner' && <SettItem icon="🗑" label="Удалить группу" onClick={deleteGroupFully} danger />}
            </div>

            <div style={{ marginTop: 16 }}>
              <SectionTitle>Роли</SectionTitle>
              <div style={{ background: 'var(--bg3)', borderRadius: 12, padding: 12, fontSize: 13, color: 'var(--text2)', lineHeight: 1.8 }}>
                👑 <b style={{ color: '#f59e0b' }}>Владелец</b> — создатель, полный контроль<br />
                ⭐ <b style={{ color: '#a78bfa' }}>Админ</b> — удалять участников, закреплять, менять название<br />
                👤 <b style={{ color: 'var(--text3)' }}>Участник</b> — только писать и читать
              </div>
            </div>
          </div>
        )}

        {/* ── MEMBERS ── */}
        {tab === 'members' && (
          <div onClick={() => setRoleMenu(null)}>
            {members.map(m => (
              <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}
                onClick={e => { if (e.target.closest('button')) return; m.id !== session.user.id && onViewUser && onViewUser(m) }}>
                <Avatar name={m.full_name} url={m.avatar_url} size={44} online={m.online} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
                    {m.full_name}
                    {m.id === session.user.id && <span style={{ fontSize: 11, color: 'var(--text3)' }}>ты</span>}
                  </div>
                  <div style={{ fontSize: 12, color: ROLE_C[m.role] }}>{ROLE_L[m.role]}</div>
                </div>
                {canManage && m.id !== session.user.id && m.role !== 'owner' && (
                  <div style={{ display: 'flex', gap: 6, position: 'relative' }} onClick={e => e.stopPropagation()}>
                    <button className="btn-sm btn-ghost" onClick={() => setRoleMenu(roleMenu === m.id ? null : m.id)}>Роль ▾</button>
                    <button className="btn-sm" style={{ background: 'rgba(239,68,68,.15)', color: '#fca5a5', border: 'none' }} onClick={() => removeMember(m.id)}>✕</button>
                    {roleMenu === m.id && (
                      <div style={{ position: 'absolute', right: 0, top: '110%', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', zIndex: 50, minWidth: 180, boxShadow: '0 8px 24px rgba(0,0,0,.4)' }}>
                        {myRole === 'owner' && m.role !== 'admin' && (
                          <button className="ctx-item" onClick={() => changeRole(m.id, 'admin')}>⭐ Сделать админом</button>
                        )}
                        {m.role === 'admin' && (
                          <button className="ctx-item" onClick={() => changeRole(m.id, 'member')}>👤 Снять права</button>
                        )}
                        <button className="ctx-item danger" onClick={() => removeMember(m.id)}>🚪 Удалить из группы</button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* ── ADD ── */}
        {tab === 'add' && canManage && (
          <div>
            <div className="f-group"><input className="f-input" placeholder="Поиск пользователей..." value={q} onChange={e => searchUsers(e.target.value)} /></div>
            {res.length === 0 && q.length >= 2 && <div className="empty-hint">Никого не найдено</div>}
            {res.map(u => (
              <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                <Avatar name={u.full_name} url={u.avatar_url} size={40} online={u.online} />
                <div style={{ flex: 1 }}><div style={{ fontWeight: 600, fontSize: 14 }}>{u.full_name}</div><div style={{ fontSize: 12, color: 'var(--text3)' }}>@{u.username}</div></div>
                <button className="btn-sm btn-acc" onClick={() => addMember(u)}>+ Добавить</button>
              </div>
            ))}
          </div>
        )}

        {/* ── MEDIA ── */}
        {tab === 'media' && (
          <div>
            <SectionTitle>Статистика</SectionTitle>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 20 }}>
              {[
                { icon: '💬', label: 'Всего сообщений', val: stats.msgs },
                { icon: '🖼', label: 'Медиафайлов', val: stats.media },
                { icon: '👥', label: 'Участников', val: members.length },
                { icon: '⭐', label: 'Администраторов', val: members.filter(m => m.role === 'admin' || m.role === 'owner').length },
              ].map(s => (
                <div key={s.label} style={{ background: 'var(--bg3)', borderRadius: 12, padding: 14, textAlign: 'center' }}>
                  <div style={{ fontSize: 24, marginBottom: 4 }}>{s.icon}</div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--accent2)' }}>{s.val}</div>
                  <div style={{ fontSize: 11, color: 'var(--text3)' }}>{s.label}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
