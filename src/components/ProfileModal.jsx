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
export function SettingsModal({ profile, session, onClose, onUpdate, showToast }) {
  const [tab, setTab] = useState('account')

  async function logout() {
    await supabase.from('profiles').update({online:false}).eq('id',session.user.id)
    await supabase.auth.signOut()
  }

  return (
    <div className="overlay" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="modal wide">
        <div className="modal-head"><span className="modal-title">⚙️ Настройки</span><button className="modal-close" onClick={onClose}>×</button></div>
        <div className="tabs">
          <button className={`tab${tab==='account'?' on':''}`} onClick={()=>setTab('account')}>Аккаунт</button>
          <button className={`tab${tab==='install'?' on':''}`} onClick={()=>setTab('install')}>📱 Установка</button>
          <button className={`tab${tab==='about'?' on':''}`} onClick={()=>setTab('about')}>О приложении</button>
        </div>

        {tab==='account'&&(
          <div>
            <div style={{display:'flex',alignItems:'center',gap:14,padding:'14px',background:'var(--bg3)',borderRadius:14,marginBottom:20}}>
              <Avatar name={profile.full_name} url={profile.avatar_url} size={54}/>
              <div><div style={{fontWeight:700,fontSize:16}}>{profile.full_name}</div><div style={{color:'var(--text3)',fontSize:13}}>@{profile.username}</div></div>
            </div>
            <div className="settings-section">
              <div className="settings-section-title">Аккаунт</div>
              <div className="settings-row" onClick={onClose}>
                <span className="settings-row-icon">👤</span>
                <span className="settings-row-text">Редактировать профиль</span>
                <span className="settings-row-val">›</span>
              </div>
              <div className="settings-row" style={{cursor:'pointer'}} onClick={logout}>
                <span className="settings-row-icon">🚪</span>
                <span className="settings-row-text" style={{color:'#fca5a5'}}>Выйти</span>
              </div>
            </div>
          </div>
        )}

        {tab==='install'&&(
          <div>
            <div style={{textAlign:'center',fontSize:48,marginBottom:16}}>📲</div>
            <h3 style={{textAlign:'center',marginBottom:20,fontSize:18}}>Установить GrishaChat на телефон</h3>

            <div style={{background:'var(--bg3)',borderRadius:14,padding:16,marginBottom:14}}>
              <div style={{fontWeight:700,marginBottom:10,fontSize:15}}>🤖 Android (Chrome)</div>
              <div style={{fontSize:14,color:'var(--text2)',lineHeight:1.7}}>
                1. Открой <b style={{color:'var(--text)'}}>grishachat.vercel.app</b> в Chrome<br/>
                2. Нажми три точки <b style={{color:'var(--text)'}}>⋮</b> в правом верхнем углу<br/>
                3. Выбери <b style={{color:'var(--text)'}}>«Добавить на главный экран»</b><br/>
                4. Нажми <b style={{color:'var(--text)'}}>«Установить»</b><br/>
                5. Готово — иконка появится на рабочем столе! 🎉
              </div>
            </div>

            <div style={{background:'var(--bg3)',borderRadius:14,padding:16,marginBottom:14}}>
              <div style={{fontWeight:700,marginBottom:10,fontSize:15}}>🍎 iPhone / iPad (Safari)</div>
              <div style={{fontSize:14,color:'var(--text2)',lineHeight:1.7}}>
                1. Открой <b style={{color:'var(--text)'}}>grishachat.vercel.app</b> в Safari<br/>
                2. Нажми кнопку <b style={{color:'var(--text)'}}>«Поделиться» ⬆</b> внизу экрана<br/>
                3. Прокрути вниз и выбери <b style={{color:'var(--text)'}}>«На экран Домой»</b><br/>
                4. Нажми <b style={{color:'var(--text)'}}>«Добавить»</b><br/>
                5. Готово — приложение на главном экране! 🎉
              </div>
            </div>

            <div style={{background:'rgba(91,110,245,.1)',border:'1px solid var(--accent)',borderRadius:12,padding:12,fontSize:13,color:'var(--text2)'}}>
              💡 После установки приложение работает как нативное — без адресной строки, в полноэкранном режиме, с быстрым запуском
            </div>
          </div>
        )}

        {tab==='about'&&(
          <div style={{textAlign:'center'}}>
            <div style={{fontSize:64,marginBottom:16}}>💬</div>
            <h2 style={{fontSize:22,fontWeight:800,marginBottom:8}}>GrishaChat</h2>
            <p style={{color:'var(--text2)',marginBottom:20}}>Приватный мессенджер для своих</p>
            <div style={{background:'var(--bg3)',borderRadius:14,padding:16,textAlign:'left'}}>
              <div style={{fontSize:13,color:'var(--text2)',lineHeight:2}}>
                ✅ Только по инвайт-коду<br/>
                ✅ Личные и групповые чаты<br/>
                ✅ Фото и файлы до 50 МБ<br/>
                ✅ Реакции на сообщения<br/>
                ✅ Ответы и закреп<br/>
                ✅ Работает как приложение на телефоне<br/>
                ✅ Данные защищены через Supabase RLS
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
