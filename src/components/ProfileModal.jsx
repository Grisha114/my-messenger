import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import { Avatar, formatLastSeen, getColor } from './helpers.jsx'

/* ─── PROFILE MODAL (own) ───────────────── */
export function ProfileModal({ profile, session, onClose, onUpdate, showToast }) {
  const [name, setName] = useState(profile.full_name||'')
  const [bio, setBio] = useState(profile.bio||'')
  const [loading, setLoading] = useState(false)
  const [avLoading, setAvLoading] = useState(false)

  async function save() {
    setLoading(true)
    const { data, error } = await supabase.from('profiles').update({full_name:name.trim(),bio:bio.trim()}).eq('id',session.user.id).select().single()
    if (!error) { onUpdate(data); showToast('Профиль обновлён ✓') }
    setLoading(false)
  }

  async function changeAv(e) {
    const f = e.target.files[0]; if(!f) return
    setAvLoading(true)
    const fn = `${session.user.id}.${f.name.split('.').pop()}`
    await supabase.storage.from('avatars').upload(fn, f, {upsert:true})
    const { data:{publicUrl} } = supabase.storage.from('avatars').getPublicUrl(fn)
    const { data } = await supabase.from('profiles').update({avatar_url:publicUrl+'?t='+Date.now()}).eq('id',session.user.id).select().single()
    onUpdate(data); setAvLoading(false); showToast('Фото обновлено ✓'); e.target.value=''
  }

  return (
    <div className="overlay" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="modal">
        <div className="modal-head"><span className="modal-title">Мой профиль</span><button className="modal-close" onClick={onClose}>×</button></div>
        <label htmlFor="av-own" style={{cursor:'pointer'}}>
          <div className="profile-av-big" style={{background:profile.avatar_url?'transparent':getColor(profile.full_name)}}>
            {profile.avatar_url?<img src={profile.avatar_url} alt=""/>:(profile.full_name||'?')[0].toUpperCase()}
            {avLoading&&<div style={{position:'absolute',inset:0,background:'rgba(0,0,0,.5)',display:'flex',alignItems:'center',justifyContent:'center',borderRadius:'50%'}}><div className="spin" style={{width:24,height:24}}/></div>}
          </div>
        </label>
        <input id="av-own" type="file" accept="image/*" style={{display:'none'}} onChange={changeAv}/>
        <p style={{textAlign:'center',color:'var(--text2)',fontSize:13,marginBottom:20}}>@{profile.username}</p>
        <div className="f-group"><label className="f-label">Имя</label><input className="f-input" value={name} onChange={e=>setName(e.target.value)}/></div>
        <div className="f-group"><label className="f-label">О себе</label><textarea className="f-input" value={bio} onChange={e=>setBio(e.target.value)} rows={3}/></div>
        <button className="btn-primary" onClick={save} disabled={loading}>{loading?'Сохранение...':'Сохранить'}</button>
      </div>
    </div>
  )
}

export default ProfileModal

/* ─── USER PROFILE (other user) ─────────── */
export function UserProfileModal({ user, session, onClose, onStartChat, showToast }) {
  const [loading, setLoading] = useState(false)

  async function startChat() {
    setLoading(true)
    const { data:m } = await supabase.from('chat_members').select('chat_id').eq('user_id',session.user.id)
    const ids = m?.map(x=>x.chat_id)||[]
    if (ids.length) {
      const { data:sh } = await supabase.from('chat_members').select('chat_id,chats(id,type)').eq('user_id',user.id).in('chat_id',ids)
      const ex = sh?.find(x=>x.chats?.type==='direct')
      if (ex) { onStartChat({...ex.chats,displayName:user.full_name,displayAvatar:user.avatar_url,otherUser:user,type:'direct'}); setLoading(false); return }
    }
    const { data:chat } = await supabase.from('chats').insert({type:'direct',created_by:session.user.id}).select().single()
    await supabase.from('chat_members').insert([{chat_id:chat.id,user_id:session.user.id,role:'member'},{chat_id:chat.id,user_id:user.id,role:'member'}])
    onStartChat({...chat,displayName:user.full_name,displayAvatar:user.avatar_url,otherUser:user,type:'direct'})
    setLoading(false)
  }

  return (
    <div className="overlay" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="modal" style={{textAlign:'center'}}>
        <div className="modal-head" style={{justifyContent:'flex-end'}}><button className="modal-close" onClick={onClose}>×</button></div>
        <div className="profile-av-big" style={{background:user.avatar_url?'transparent':getColor(user.full_name)}}>
          {user.avatar_url?<img src={user.avatar_url} alt=""/>:(user.full_name||'?')[0].toUpperCase()}
        </div>
        <h2 style={{fontSize:22,fontWeight:700,marginBottom:4}}>{user.full_name}</h2>
        <p style={{color:'var(--text3)',fontSize:14,marginBottom:6}}>@{user.username}</p>
        <p style={{fontSize:13,color:user.online?'var(--green)':'var(--text2)',marginBottom:20}}>{formatLastSeen(user.last_seen,user.online)}</p>
        {user.bio&&<div style={{background:'var(--bg3)',borderRadius:12,padding:'12px 16px',marginBottom:20,textAlign:'left'}}><p style={{fontSize:13,color:'var(--text2)',marginBottom:4}}>О себе</p><p>{user.bio}</p></div>}
        {user.id!==session.user.id&&<button className="btn-primary" onClick={startChat} disabled={loading}>{loading?'Открытие...':'💬 Написать'}</button>}
      </div>
    </div>
  )
}

/* ─── GROUP SETTINGS ─────────────────────── */
const ROLE_L = {owner:'👑 Владелец',admin:'⭐ Админ',member:'👤 Участник'}
const ROLE_C = {owner:'#f59e0b',admin:'#a78bfa',member:'var(--text3)'}

export function GroupSettingsModal({ chat, session, myRole, onClose, onUpdated, onViewUser, showToast }) {
  const [members, setMembers] = useState([])
  const [gName, setGName] = useState(chat.name||'')
  const [q, setQ] = useState('')
  const [res, setRes] = useState([])
  const [loading, setLoading] = useState(false)
  const [avLoading, setAvLoading] = useState(false)
  const [tab, setTab] = useState('info')
  const [roleMenu, setRoleMenu] = useState(null)

  useEffect(()=>{ loadMembers() },[])

  async function loadMembers() {
    const { data } = await supabase.from('chat_members').select('user_id,role,profiles(id,full_name,username,avatar_url,online,last_seen,bio)').eq('chat_id',chat.id)
    const list = (data||[]).map(m=>({...m.profiles,role:m.role||'member'}))
    list.sort((a,b)=>({owner:0,admin:1,member:2}[a.role]||2)-({owner:0,admin:1,member:2}[b.role]||2))
    setMembers(list)
  }

  async function searchUsers(v) {
    setQ(v); if(v.length<2){setRes([]);return}
    const { data } = await supabase.from('profiles').select('id,full_name,username,avatar_url,online').neq('id',session.user.id).or(`username.ilike.%${v}%,full_name.ilike.%${v}%`).limit(8)
    const ids = members.map(m=>m.id)
    setRes(data?.filter(u=>!ids.includes(u.id))||[])
  }

  async function addMember(user) {
    await supabase.from('chat_members').insert({chat_id:chat.id,user_id:user.id,role:'member'})
    await loadMembers(); setQ(''); setRes([]); showToast(`${user.full_name} добавлен ✓`)
  }

  async function removeMember(userId) {
    const isSelf = userId===session.user.id
    if (isSelf&&!window.confirm('Покинуть группу?')) return
    if (!isSelf&&!window.confirm('Удалить участника?')) return
    await supabase.from('chat_members').delete().eq('chat_id',chat.id).eq('user_id',userId)
    if (isSelf) { onClose(); onUpdated(null); return }
    await loadMembers(); showToast('Участник удалён')
  }

  async function changeRole(userId, role) {
    await supabase.from('chat_members').update({role}).eq('chat_id',chat.id).eq('user_id',userId)
    await loadMembers(); setRoleMenu(null); showToast(`Роль: ${ROLE_L[role]}`)
  }

  async function saveName() {
    if (!gName.trim()) return; setLoading(true)
    const { data } = await supabase.from('chats').update({name:gName.trim()}).eq('id',chat.id).select().single()
    onUpdated(data); showToast('Название обновлено ✓'); setLoading(false)
  }

  async function changeAv(e) {
    const f = e.target.files[0]; if(!f) return; setAvLoading(true)
    const fn = `group_${chat.id}.${f.name.split('.').pop()}`
    await supabase.storage.from('avatars').upload(fn,f,{upsert:true})
    const { data:{publicUrl} } = supabase.storage.from('avatars').getPublicUrl(fn)
    const { data } = await supabase.from('chats').update({avatar_url:publicUrl+'?t='+Date.now()}).eq('id',chat.id).select().single()
    onUpdated(data); setAvLoading(false); showToast('Фото обновлено ✓'); e.target.value=''
  }

  const canManage = myRole==='owner'||myRole==='admin'

  return (
    <div className="overlay" onClick={e=>{if(e.target===e.currentTarget){onClose();setRoleMenu(null)}}}>
      <div className="modal wide">
        <div className="modal-head"><span className="modal-title">⚙️ Группа</span><button className="modal-close" onClick={onClose}>×</button></div>
        <div className="tabs">
          <button className={`tab${tab==='info'?' on':''}`} onClick={()=>setTab('info')}>Инфо</button>
          <button className={`tab${tab==='members'?' on':''}`} onClick={()=>setTab('members')}>Участники ({members.length})</button>
          {canManage&&<button className={`tab${tab==='add'?' on':''}`} onClick={()=>setTab('add')}>+ Добавить</button>}
        </div>

        {tab==='info'&&(
          <div>
            <label htmlFor="grp-av-inp">
              <div className="profile-av-big" style={{background:chat.avatar_url?'transparent':'var(--accent)',fontSize:32}}>
                {chat.avatar_url?<img src={chat.avatar_url} alt=""/>:(chat.name||'G')[0].toUpperCase()}
                {avLoading&&<div style={{position:'absolute',inset:0,background:'rgba(0,0,0,.5)',display:'flex',alignItems:'center',justifyContent:'center',borderRadius:'50%'}}><div className="spin" style={{width:20,height:20}}/></div>}
              </div>
            </label>
            {canManage&&<input id="grp-av-inp" type="file" accept="image/*" style={{display:'none'}} onChange={changeAv}/>}
            <p style={{textAlign:'center',color:'var(--text3)',fontSize:13,marginBottom:20}}>{members.length} участников</p>
            {canManage&&(<><div className="f-group"><label className="f-label">Название</label><input className="f-input" value={gName} onChange={e=>setGName(e.target.value)}/></div><button className="btn-primary" onClick={saveName} disabled={loading||!gName.trim()}>{loading?'Сохранение...':'Сохранить'}</button></>)}
            <button onClick={()=>removeMember(session.user.id)} style={{width:'100%',marginTop:12,padding:12,background:'rgba(239,68,68,.1)',border:'1px solid rgba(239,68,68,.3)',borderRadius:10,color:'#fca5a5',cursor:'pointer',fontSize:14}}>🚪 Покинуть группу</button>
          </div>
        )}

        {tab==='members'&&(
          <div onClick={()=>setRoleMenu(null)}>
            {members.map(m=>(
              <div key={m.id} className="member-row" onClick={e=>{if(e.target.closest('button'))return;m.id!==session.user.id&&onViewUser&&onViewUser(m)}}>
                <Avatar name={m.full_name} url={m.avatar_url} size={42} online={m.online}/>
                <div className="member-info">
                  <div className="member-name">{m.full_name}{m.id===session.user.id&&<span style={{fontSize:11,color:'var(--text3)',marginLeft:6}}>ты</span>}</div>
                  <div className="member-role" style={{color:ROLE_C[m.role]}}>{ROLE_L[m.role]||'👤 Участник'}</div>
                </div>
                {canManage&&m.id!==session.user.id&&m.role!=='owner'&&(
                  <div style={{display:'flex',gap:6,position:'relative'}} onClick={e=>e.stopPropagation()}>
                    <button className="btn-sm btn-ghost" onClick={()=>setRoleMenu(roleMenu===m.id?null:m.id)}>Роль ▾</button>
                    <button className="btn-sm" style={{background:'rgba(239,68,68,.15)',color:'#fca5a5',border:'none'}} onClick={()=>removeMember(m.id)}>✕</button>
                    {roleMenu===m.id&&(
                      <div style={{position:'absolute',right:0,top:'110%',background:'var(--bg3)',border:'1px solid var(--border)',borderRadius:10,overflow:'hidden',zIndex:50,minWidth:170,boxShadow:'0 8px 24px rgba(0,0,0,.4)'}}>
                        {myRole==='owner'&&m.role!=='admin'&&<button className="ctx-item" onClick={()=>changeRole(m.id,'admin')}>⭐ Сделать админом</button>}
                        {m.role==='admin'&&<button className="ctx-item" onClick={()=>changeRole(m.id,'member')}>👤 Снять права</button>}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {tab==='add'&&canManage&&(
          <div>
            <div className="f-group"><input className="f-input" placeholder="Поиск..." value={q} onChange={e=>searchUsers(e.target.value)}/></div>
            {res.length===0&&q.length>=2&&<div className="empty-hint">Никого не найдено</div>}
            {res.map(u=>(
              <div key={u.id} className="user-row">
                <Avatar name={u.full_name} url={u.avatar_url} size={40} online={u.online}/>
                <div className="user-row-info"><div className="user-row-name">{u.full_name}</div><div className="user-row-un">@{u.username}</div></div>
                <button className="btn-sm btn-acc" onClick={()=>addMember(u)}>+ Добавить</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

/* ─── ADMIN (invite codes) ───────────────── */
function genCode() {
  const c='ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  return Array.from({length:8},()=>c[Math.floor(Math.random()*c.length)]).join('')
}

export function AdminModal({ profile, session, onClose, showToast }) {
  const [codes, setCodes] = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(()=>{ loadCodes() },[])

  async function loadCodes() {
    const { data } = await supabase.from('invite_codes').select('*, profiles!invite_codes_used_by_fkey(full_name)').eq('created_by',session.user.id).order('created_at',{ascending:false})
    setCodes(data||[])
  }

  async function create() {
    setLoading(true)
    await supabase.from('invite_codes').insert({code:genCode(),created_by:session.user.id,max_uses:1,uses_count:0})
    await loadCodes(); setLoading(false)
  }

  async function del(id) { await supabase.from('invite_codes').delete().eq('id',id); await loadCodes() }

  function copy(code) {
    navigator.clipboard.writeText(`${window.location.origin}?invite=${code}`)
    showToast('Ссылка скопирована ✓')
  }

  return (
    <div className="overlay" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="modal">
        <div className="modal-head"><span className="modal-title">🔑 Инвайт-коды</span><button className="modal-close" onClick={onClose}>×</button></div>
        <p style={{fontSize:13,color:'var(--text2)',marginBottom:16}}>Без инвайт-кода зарегистрироваться нельзя</p>
        <button className="btn-primary" onClick={create} disabled={loading} style={{marginBottom:20}}>{loading?'Создание...':'+ Создать инвайт-код'}</button>
        {codes.length===0&&<div className="empty-hint">Нет кодов</div>}
        {codes.map(c=>(
          <div key={c.id} className={`inv-row${c.is_used?' inv-used':''}`}>
            <div style={{flex:1}}>
              <div className="inv-code">{c.code}</div>
              <div className="inv-sub">{c.is_used?`✓ Использован${c.profiles?` — ${c.profiles.full_name}`:''}` : 'Не использован'}</div>
            </div>
            {!c.is_used&&<button className="icon-copy" onClick={()=>copy(c.code)} title="Скопировать ссылку">🔗</button>}
            <button className="icon-copy" onClick={()=>del(c.id)} title="Удалить" style={{fontSize:16}}>🗑</button>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ─── SETTINGS ───────────────────────────── */

/* ─── SETTINGS (full Telegram-style) ───── */
export function SettingsModal({ profile, session, onClose, onUpdate, showToast }) {
  const [tab, setTab] = useState('main')
  const [editName, setEditName] = useState(profile.full_name || '')
  const [editBio, setEditBio] = useState(profile.bio || '')
  const [saving, setSaving] = useState(false)
  const [avLoading, setAvLoading] = useState(false)
  const [confirmClear, setConfirmClear] = useState(null) // chatId to clear
  const [chats, setChats] = useState([])
  const [loadingChats, setLoadingChats] = useState(false)

  async function logout() {
    await supabase.from('profiles').update({ online: false }).eq('id', session.user.id)
    await supabase.auth.signOut()
  }

  async function saveProfile() {
    setSaving(true)
    const { data, error } = await supabase.from('profiles').update({ full_name: editName.trim(), bio: editBio.trim() }).eq('id', session.user.id).select().single()
    if (!error) { onUpdate(data); showToast('Сохранено ✓') }
    setSaving(false)
  }

  async function changeAv(e) {
    const f = e.target.files[0]; if (!f) return
    setAvLoading(true)
    const fn = `${session.user.id}.${f.name.split('.').pop()}`
    await supabase.storage.from('avatars').upload(fn, f, { upsert: true })
    const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(fn)
    const { data } = await supabase.from('profiles').update({ avatar_url: publicUrl + '?t=' + Date.now() }).eq('id', session.user.id).select().single()
    onUpdate(data); setAvLoading(false); showToast('Фото обновлено ✓'); e.target.value = ''
  }

  async function loadChatsForClear() {
    setLoadingChats(true)
    const { data: mem } = await supabase.from('chat_members').select('chat_id, chats(id, type, name), profiles!inner(full_name)').eq('user_id', session.user.id)
    // get all chats with names
    const { data: myMem } = await supabase.from('chat_members').select('chat_id').eq('user_id', session.user.id)
    const ids = myMem?.map(m => m.chat_id) || []
    const { data: cs } = await supabase.from('chats').select('*').in('id', ids)
    // get other member names for direct chats
    const enriched = await Promise.all((cs || []).map(async c => {
      if (c.type === 'direct') {
        const { data: others } = await supabase.from('chat_members').select('profiles(full_name, avatar_url)').eq('chat_id', c.id).neq('user_id', session.user.id)
        return { ...c, displayName: others?.[0]?.profiles?.full_name || '?', displayAvatar: others?.[0]?.profiles?.avatar_url }
      }
      return { ...c, displayName: c.name }
    }))
    setChats(enriched)
    setLoadingChats(false)
  }

  async function clearChat(chatId) {
    await supabase.from('messages').update({ deleted: true, content: null, file_url: null }).eq('chat_id', chatId).eq('sender_id', session.user.id)
    setConfirmClear(null)
    showToast('История очищена ✓')
  }

  async function deleteAccount() {
    if (!window.confirm('Удалить аккаунт? Это необратимо.')) return
    await supabase.from('profiles').delete().eq('id', session.user.id)
    await supabase.auth.signOut()
  }

  const SIcon = ({ emoji, bg }) => (
    <div className="si-icon" style={{ background: bg || 'var(--bg4)' }}>{emoji}</div>
  )

  return (
    <div className="overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal wide" style={{ maxWidth: 480 }}>
        <div className="modal-head">
          <span className="modal-title">
            {tab !== 'main' && <button onClick={() => setTab('main')} style={{ background: 'none', border: 'none', color: 'var(--accent2)', fontSize: 22, cursor: 'pointer', marginRight: 8, padding: 0 }}>‹</button>}
            {tab === 'main' ? '⚙️ Настройки' : tab === 'profile' ? '👤 Профиль' : tab === 'chats' ? '💬 Чаты' : tab === 'privacy' ? '🔒 Конфиденциальность' : tab === 'install' ? '📲 Установка' : tab === 'about' ? 'ℹ️ О приложении' : '⚙️ Настройки'}
          </span>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        {/* ── MAIN TAB ── */}
        {tab === 'main' && (
          <div>
            {/* Profile card */}
            <div className="sett-profile-card" onClick={() => setTab('profile')}>
              <Avatar name={profile.full_name} url={profile.avatar_url} size={62} />
              <div className="info">
                <div className="pname">{profile.full_name}</div>
                <div className="pun">@{profile.username}</div>
                {profile.bio && <div style={{ fontSize: 13, color: 'var(--text2)', marginTop: 4 }}>{profile.bio}</div>}
              </div>
              <span style={{ color: 'var(--text3)', fontSize: 20 }}>›</span>
            </div>

            <div className="sett-group">
              <div className="sett-group-title">Основное</div>
              <div className="sett-item" onClick={() => setTab('profile')}>
                <SIcon emoji="👤" bg="rgba(91,110,245,.2)" /><span className="si-label">Редактировать профиль</span><span className="si-arrow">›</span>
              </div>
              <div className="sett-item" onClick={() => { setTab('chats'); loadChatsForClear() }}>
                <SIcon emoji="💬" bg="rgba(34,197,94,.2)" /><span className="si-label">Чаты</span><span className="si-arrow">›</span>
              </div>
              <div className="sett-item" onClick={() => setTab('privacy')}>
                <SIcon emoji="🔒" bg="rgba(251,191,36,.2)" /><span className="si-label">Конфиденциальность</span><span className="si-arrow">›</span>
              </div>
            </div>

            <div className="sett-group">
              <div className="sett-group-title">Другое</div>
              <div className="sett-item" onClick={() => setTab('install')}>
                <SIcon emoji="📲" bg="rgba(56,189,248,.2)" /><span className="si-label">Установить на телефон</span><span className="si-arrow">›</span>
              </div>
              <div className="sett-item" onClick={() => setTab('about')}>
                <SIcon emoji="ℹ️" bg="rgba(167,139,250,.2)" /><span className="si-label">О приложении</span><span className="si-arrow">›</span>
              </div>
            </div>

            <div className="sett-group">
              <div className="sett-group-title">Аккаунт</div>
              <div className="sett-item danger" onClick={logout}>
                <SIcon emoji="🚪" bg="rgba(239,68,68,.15)" /><span className="si-label">Выйти</span>
              </div>
              <div className="sett-item danger" onClick={deleteAccount}>
                <SIcon emoji="🗑" bg="rgba(239,68,68,.15)" /><span className="si-label">Удалить аккаунт</span>
              </div>
            </div>

            <div className="by-grisha">
              💬 GrishaChat<br/>
              Сделано с <span className="heart">❤️</span> by <b>Grisha</b><br/>
              <span style={{ fontSize: 11 }}>Только для своих · Приватно · Бесплатно</span>
            </div>
          </div>
        )}

        {/* ── PROFILE TAB ── */}
        {tab === 'profile' && (
          <div>
            <label htmlFor="sett-av-inp" style={{ cursor: 'pointer' }}>
              <div className="profile-av-big" style={{ background: profile.avatar_url ? 'transparent' : getColor(profile.full_name), fontSize: 36 }}>
                {profile.avatar_url ? <img src={profile.avatar_url} alt="" /> : (profile.full_name || '?')[0].toUpperCase()}
                {avLoading && <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%' }}><div className="spin" style={{ width: 22, height: 22 }} /></div>}
              </div>
            </label>
            <input id="sett-av-inp" type="file" accept="image/*" style={{ display: 'none' }} onChange={changeAv} />
            <p style={{ textAlign: 'center', color: 'var(--text3)', fontSize: 13, marginBottom: 20 }}>Нажми на фото чтобы изменить</p>

            <div className="f-group"><label className="f-label">Имя</label><input className="f-input" value={editName} onChange={e => setEditName(e.target.value)} /></div>
            <div className="f-group"><label className="f-label">О себе</label><textarea className="f-input" value={editBio} onChange={e => setEditBio(e.target.value)} rows={3} placeholder="Расскажи о себе..." /></div>
            <div className="f-group"><label className="f-label">Username</label><input className="f-input" value={'@' + profile.username} disabled style={{ opacity: .5 }} /></div>
            <div className="f-group"><label className="f-label">Email</label><input className="f-input" value={session.user.email} disabled style={{ opacity: .5 }} /></div>
            <button className="btn-primary" onClick={saveProfile} disabled={saving}>{saving ? 'Сохранение...' : 'Сохранить изменения'}</button>
          </div>
        )}

        {/* ── CHATS TAB ── */}
        {tab === 'chats' && (
          <div>
            <div className="sett-group">
              <div className="sett-group-title">Управление чатами</div>
              {loadingChats && <div className="empty-hint">Загрузка...</div>}
              {!loadingChats && chats.map(chat => (
                <div key={chat.id} className="sett-item">
                  <Avatar name={chat.displayName} url={chat.displayAvatar} size={36} />
                  <span className="si-label" style={{ fontSize: 14 }}>{chat.displayName}</span>
                  <button className="btn-sm" style={{ background: 'rgba(239,68,68,.15)', color: '#fca5a5', border: 'none', fontSize: 12 }}
                    onClick={() => setConfirmClear(chat.id)}>
                    Очистить
                  </button>
                </div>
              ))}
            </div>

            <div className="sett-group">
              <div className="sett-group-title">Общее</div>
              <div className="sett-item" onClick={async () => {
                if (!window.confirm('Очистить историю ВСЕХ чатов? (только твои сообщения)')) return
                for (const c of chats) await clearChat(c.id)
                showToast('Все чаты очищены')
              }}>
                <SIcon emoji="🧹" bg="rgba(239,68,68,.15)" /><span className="si-label danger" style={{ color: '#fca5a5' }}>Очистить все чаты</span>
              </div>
            </div>

            {/* Confirm dialog */}
            {confirmClear && (
              <div style={{ background: 'var(--bg4)', borderRadius: 14, padding: 16, marginTop: 16 }}>
                <p style={{ marginBottom: 12, fontSize: 14 }}>Очистить историю? (удалятся только твои сообщения)</p>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button className="btn-sm btn-ghost" style={{ flex: 1 }} onClick={() => setConfirmClear(null)}>Отмена</button>
                  <button className="btn-sm" style={{ flex: 1, background: 'rgba(239,68,68,.2)', color: '#fca5a5', border: 'none' }} onClick={() => clearChat(confirmClear)}>Очистить</button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── PRIVACY TAB ── */}
        {tab === 'privacy' && (
          <div>
            <div className="sett-group">
              <div className="sett-group-title">Конфиденциальность</div>
              <div className="sett-item">
                <SIcon emoji="👁" bg="rgba(91,110,245,.2)" /><span className="si-label">Кто видит мой профиль</span><span className="si-val">Все участники</span>
              </div>
              <div className="sett-item">
                <SIcon emoji="🕐" bg="rgba(251,191,36,.2)" /><span className="si-label">Время последнего визита</span><span className="si-val">Все участники</span>
              </div>
            </div>

            <div className="sett-group">
              <div className="sett-group-title">Безопасность</div>
              <div className="sett-item">
                <SIcon emoji="🔑" bg="rgba(34,197,94,.2)" /><span className="si-label">Вход только по инвайту</span><span className="si-val" style={{ color: 'var(--green)' }}>Включено</span>
              </div>
              <div className="sett-item">
                <SIcon emoji="🛡" bg="rgba(34,197,94,.2)" /><span className="si-label">Защита данных (RLS)</span><span className="si-val" style={{ color: 'var(--green)' }}>Активна</span>
              </div>
            </div>

            <div style={{ background: 'rgba(91,110,245,.08)', border: '1px solid var(--accent)', borderRadius: 12, padding: 14, fontSize: 13, color: 'var(--text2)', lineHeight: 1.7 }}>
              🔒 Все данные хранятся в защищённой базе Supabase. Каждый пользователь видит только свои чаты. Посторонние не могут зарегистрироваться без инвайт-кода.
            </div>
          </div>
        )}

        {/* ── INSTALL TAB ── */}
        {tab === 'install' && (
          <div>
            <div style={{ textAlign: 'center', fontSize: 52, marginBottom: 14 }}>📲</div>
            <h3 style={{ textAlign: 'center', marginBottom: 20 }}>Установить на телефон</h3>

            <div style={{ background: 'var(--bg3)', borderRadius: 14, padding: 16, marginBottom: 12 }}>
              <div style={{ fontWeight: 700, marginBottom: 10 }}>🤖 Android (Chrome)</div>
              <div style={{ fontSize: 14, color: 'var(--text2)', lineHeight: 1.8 }}>
                1. Открой <b style={{ color: 'var(--text)' }}>grishachat.vercel.app</b> в Chrome<br />
                2. Нажми три точки <b style={{ color: 'var(--text)' }}>⋮</b> справа вверху<br />
                3. Выбери <b style={{ color: 'var(--text)' }}>«Добавить на главный экран»</b><br />
                4. Нажми <b style={{ color: 'var(--text)' }}>«Установить»</b> → готово 🎉
              </div>
            </div>

            <div style={{ background: 'var(--bg3)', borderRadius: 14, padding: 16, marginBottom: 12 }}>
              <div style={{ fontWeight: 700, marginBottom: 10 }}>🍎 iPhone / iPad (Safari)</div>
              <div style={{ fontSize: 14, color: 'var(--text2)', lineHeight: 1.8 }}>
                1. Открой <b style={{ color: 'var(--text)' }}>grishachat.vercel.app</b> в Safari<br />
                2. Нажми кнопку <b style={{ color: 'var(--text)' }}>«Поделиться» ⬆</b> внизу<br />
                3. Выбери <b style={{ color: 'var(--text)' }}>«На экран Домой»</b><br />
                4. Нажми <b style={{ color: 'var(--text)' }}>«Добавить»</b> → готово 🎉
              </div>
            </div>

            <div style={{ background: 'rgba(91,110,245,.1)', border: '1px solid var(--accent)', borderRadius: 12, padding: 12, fontSize: 13, color: 'var(--text2)' }}>
              💡 Приложение работает без адресной строки, в полноэкранном режиме, с быстрым запуском — как нативное
            </div>
          </div>
        )}

        {/* ── ABOUT TAB ── */}
        {tab === 'about' && (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 68, marginBottom: 16 }}>💬</div>
            <h2 style={{ fontSize: 24, fontWeight: 800, marginBottom: 6 }}>GrishaChat</h2>
            <p style={{ color: 'var(--text3)', marginBottom: 4, fontSize: 14 }}>Приватный мессенджер для своих</p>
            <p style={{ color: 'var(--text3)', fontSize: 13, marginBottom: 24 }}>Версия 1.0</p>

            <div style={{ background: 'var(--bg3)', borderRadius: 14, padding: 16, textAlign: 'left', marginBottom: 16 }}>
              <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 2 }}>
                ✅ Регистрация только по инвайт-коду<br />
                ✅ Личные и групповые чаты<br />
                ✅ Фото, файлы до 50 МБ<br />
                ✅ Реакции на сообщения<br />
                ✅ Ответы и закреп сообщений<br />
                ✅ Роли в группах (владелец, админ)<br />
                ✅ Удаление и очистка чатов<br />
                ✅ Работает как приложение на телефоне<br />
                ✅ Вставка фото через Ctrl+V<br />
                ✅ Защита данных через Supabase RLS
              </div>
            </div>

            <div className="by-grisha" style={{ fontSize: 15 }}>
              Сделано с <span className="heart">❤️</span> by <b style={{ color: 'var(--accent2)' }}>Grisha</b><br />
              <span style={{ fontSize: 12, color: 'var(--text3)' }}>2026 · Только для своих</span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
