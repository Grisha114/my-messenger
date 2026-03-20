import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import { Avatar, formatLastSeen, getColor } from './helpers.jsx'

/* ── OWN PROFILE ── */
export function ProfileModal({ profile, session, onClose, onUpdate, showToast }) {
  const [name, setName] = useState(profile.full_name||'')
  const [bio, setBio] = useState(profile.bio||'')
  const [saving, setSaving] = useState(false)
  const [avLoading, setAvLoading] = useState(false)

  async function save() {
    setSaving(true)
    const { data,error } = await supabase.from('profiles').update({full_name:name.trim(),bio:bio.trim()}).eq('id',session.user.id).select().single()
    if (!error) { onUpdate(data); showToast('Сохранено ✓') }
    setSaving(false)
  }

  async function changeAv(e) {
    const f = e.target.files[0]; if(!f) return; setAvLoading(true)
    const fn = `${session.user.id}.${f.name.split('.').pop()}`
    await supabase.storage.from('avatars').upload(fn,f,{upsert:true})
    const {data:{publicUrl}} = supabase.storage.from('avatars').getPublicUrl(fn)
    const {data} = await supabase.from('profiles').update({avatar_url:publicUrl+'?t='+Date.now()}).eq('id',session.user.id).select().single()
    onUpdate(data); setAvLoading(false); showToast('Фото обновлено ✓'); e.target.value=''
  }

  return (
    <div className="overlay" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="modal">
        <div className="modal-head"><span className="modal-title">👤 Мой профиль</span><button className="modal-close" onClick={onClose}>×</button></div>
        <label htmlFor="av-own" style={{cursor:'pointer'}}>
          <div className="profile-av-big" style={{background:profile.avatar_url?'transparent':getColor(profile.full_name)}}>
            {profile.avatar_url?<img src={profile.avatar_url} alt=""/>:(profile.full_name||'?')[0].toUpperCase()}
            {avLoading&&<div style={{position:'absolute',inset:0,background:'rgba(0,0,0,.5)',display:'flex',alignItems:'center',justifyContent:'center',borderRadius:'50%'}}><div className="spin" style={{width:22,height:22}}/></div>}
          </div>
        </label>
        <input id="av-own" type="file" accept="image/*" style={{display:'none'}} onChange={changeAv}/>
        <p style={{textAlign:'center',color:'var(--text3)',fontSize:13,marginBottom:20}}>@{profile.username}</p>
        <div className="f-group"><label className="f-label">Имя</label><input className="f-input" value={name} onChange={e=>setName(e.target.value)}/></div>
        <div className="f-group"><label className="f-label">О себе</label><textarea className="f-input" value={bio} onChange={e=>setBio(e.target.value)} rows={3} placeholder="Расскажи о себе..."/></div>
        <button className="btn-primary" onClick={save} disabled={saving}>{saving?'Сохранение...':'Сохранить'}</button>
      </div>
    </div>
  )
}
export default ProfileModal

/* ── USER PROFILE (other) ── */
export function UserProfileModal({ user, session, onClose, onStartChat, onBlock, onUnblock, isBlocked, showToast }) {
  const [loading, setLoading] = useState(false)
  const [nickname, setNickname] = useState('')
  const [editNick, setEditNick] = useState(false)

  useEffect(() => { loadNickname() }, [user.id])

  async function loadNickname() {
    const {data} = await supabase.from('contact_nicknames').select('nickname').eq('user_id',session.user.id).eq('contact_id',user.id).single()
    if (data) setNickname(data.nickname)
  }

  async function saveNickname() {
    if (nickname.trim()) {
      await supabase.from('contact_nicknames').upsert({user_id:session.user.id,contact_id:user.id,nickname:nickname.trim()},{onConflict:'user_id,contact_id'})
    } else {
      await supabase.from('contact_nicknames').delete().eq('user_id',session.user.id).eq('contact_id',user.id)
    }
    setEditNick(false); showToast('Прозвище сохранено ✓')
  }

  async function startChat() {
    setLoading(true)
    const {data:m} = await supabase.from('chat_members').select('chat_id').eq('user_id',session.user.id)
    const ids = m?.map(x=>x.chat_id)||[]
    if (ids.length) {
      const {data:sh} = await supabase.from('chat_members').select('chat_id,chats(id,type)').eq('user_id',user.id).in('chat_id',ids)
      const ex = sh?.find(x=>x.chats?.type==='direct')
      if (ex) { onStartChat({...ex.chats,displayName:user.full_name,displayAvatar:user.avatar_url,otherUser:user,type:'direct'}); setLoading(false); return }
    }
    const {data:chat} = await supabase.from('chats').insert({type:'direct',created_by:session.user.id}).select().single()
    await supabase.from('chat_members').insert([{chat_id:chat.id,user_id:session.user.id,role:'member'},{chat_id:chat.id,user_id:user.id,role:'member'}])
    onStartChat({...chat,displayName:user.full_name,displayAvatar:user.avatar_url,otherUser:user,type:'direct'})
    setLoading(false)
  }

  const reallyOnline = user.online && user.last_seen && (Date.now()-new Date(user.last_seen))<3*60*1000
  const displayName = nickname || user.full_name

  return (
    <div className="overlay" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="modal" style={{textAlign:'center'}}>
        <div className="modal-head" style={{justifyContent:'flex-end'}}><button className="modal-close" onClick={onClose}>×</button></div>
        <div className="profile-av-big" style={{background:user.avatar_url?'transparent':getColor(user.full_name)}}>
          {user.avatar_url?<img src={user.avatar_url} alt=""/>:(user.full_name||'?')[0].toUpperCase()}
        </div>
        <h2 style={{fontSize:22,fontWeight:700,marginBottom:2}}>{displayName}</h2>
        {nickname&&<p style={{fontSize:13,color:'var(--text3)',marginBottom:2}}>{user.full_name}</p>}
        <div style={{display:'flex',alignItems:'center',justifyContent:'center',gap:6,marginBottom:6}}>
          <p style={{color:'var(--text3)',fontSize:14}}>@{user.username}</p>
          <button onClick={()=>{navigator.clipboard.writeText('@'+user.username);showToast('Username скопирован ✓')}} style={{background:'none',border:'none',color:'var(--accent2)',cursor:'pointer',fontSize:14}}>📋</button>
        </div>
        <p style={{fontSize:13,color:reallyOnline?'var(--green)':'var(--text2)',marginBottom:16}}>{formatLastSeen(user.last_seen,reallyOnline)}</p>
        {user.bio&&<div style={{background:'var(--bg3)',borderRadius:12,padding:'12px 16px',marginBottom:16,textAlign:'left'}}><p style={{fontSize:13,color:'var(--text2)',marginBottom:4}}>О себе</p><p style={{fontSize:14}}>{user.bio}</p></div>}

        {/* Nickname */}
        <div style={{marginBottom:16,textAlign:'left'}}>
          {editNick ? (
            <div style={{display:'flex',gap:8}}>
              <input className="f-input" placeholder="Прозвище (необязательно)" value={nickname} onChange={e=>setNickname(e.target.value)} style={{flex:1}}/>
              <button className="btn-sm btn-acc" onClick={saveNickname}>✓</button>
              <button className="btn-sm btn-ghost" onClick={()=>setEditNick(false)}>✕</button>
            </div>
          ) : (
            <button className="btn-sm btn-ghost" style={{width:'100%'}} onClick={()=>setEditNick(true)}>
              ✏️ {nickname ? `Прозвище: «${nickname}»` : 'Добавить прозвище'}
            </button>
          )}
        </div>

        {user.id!==session.user.id&&(
          <div style={{display:'flex',flexDirection:'column',gap:8}}>
            <button className="btn-primary" onClick={startChat} disabled={loading}>{loading?'Открытие...':'💬 Написать'}</button>
            {isBlocked
              ? <button className="btn-sm btn-ghost" style={{padding:12}} onClick={()=>{onUnblock&&onUnblock(user.id);onClose()}}>🔓 Разблокировать</button>
              : <button className="btn-sm" style={{padding:12,background:'rgba(239,68,68,.1)',color:'#fca5a5',border:'none',borderRadius:10}} onClick={()=>{onBlock&&onBlock(user.id);onClose()}}>🚫 Заблокировать</button>
            }
          </div>
        )}
      </div>
    </div>
  )
}

/* ── ADMIN (invite codes) ── */
function genCode(){const c='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';return Array.from({length:8},()=>c[Math.floor(Math.random()*c.length)]).join('')}

export function AdminModal({ profile, session, onClose, showToast }) {
  const [codes, setCodes] = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(()=>{ loadCodes() },[])

  async function loadCodes() {
    const {data} = await supabase.from('invite_codes').select('*').or(`created_by.eq.${session.user.id},created_by.is.null`).order('created_at',{ascending:false})
    setCodes(data||[])
  }

  async function create() {
    setLoading(true)
    const {error} = await supabase.from('invite_codes').insert({code:genCode(),created_by:session.user.id,max_uses:1,uses_count:0})
    if (error) showToast('Ошибка: '+error.message)
    await loadCodes(); setLoading(false)
  }

  async function del(id) {
    const {error} = await supabase.from('invite_codes').delete().eq('id',id).eq('created_by',session.user.id)
    if (error) { showToast('Ошибка удаления'); return }
    await loadCodes(); showToast('Удалено')
  }

  function copy(code) { navigator.clipboard.writeText(`${window.location.origin}?invite=${code}`); showToast('Ссылка скопирована ✓') }

  return (
    <div className="overlay" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="modal">
        <div className="modal-head"><span className="modal-title">🔑 Инвайт-коды</span><button className="modal-close" onClick={onClose}>×</button></div>
        <p style={{fontSize:13,color:'var(--text2)',marginBottom:16}}>Без инвайт-кода зарегистрироваться нельзя.</p>
        <button className="btn-primary" onClick={create} disabled={loading} style={{marginBottom:20}}>{loading?'Создание...':'+ Создать инвайт-код'}</button>
        {codes.length===0&&<div className="empty-hint">Нет кодов. Создай первый!</div>}
        {codes.map(c=>(
          <div key={c.id} className={`inv-row${c.is_used?' inv-used':''}`}>
            <div style={{flex:1}}>
              <div className="inv-code">{c.code}</div>
              <div className="inv-sub">{c.is_used?'✓ Использован':'Не использован'}</div>
            </div>
            {!c.is_used&&<button className="icon-copy" onClick={()=>copy(c.code)} title="Скопировать">🔗</button>}
            <button className="icon-copy" onClick={()=>del(c.id)} title="Удалить" style={{fontSize:16,color:'#fca5a5'}}>🗑</button>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ── SETTINGS (full) ── */
const CHANGELOG = [
  {
    version:'v1.3 — Большое обновление',
    date:'20 марта 2026',
    entries:[
      '✅ Полный редизайн — тёмная тема, градиентные пузырьки',
      '✅ Реакции на сообщения (зажми сообщение)',
      '✅ Ответы на сообщения (двойной клик / зажатие)',
      '✅ Редактирование сообщений (ПКМ → Изменить)',
      '✅ Удаление сообщений для себя и всех',
      '✅ Закрепление сообщений',
      '✅ Кто просмотрел в группе (аватарки под сообщением)',
      '✅ Голосовой ввод текста (кнопка 🎙)',
      '✅ Вставка фото через Ctrl+V',
      '✅ Поиск по сообщениям (кнопка 🔍 в чате)',
      '✅ Предпросмотр чата при наведении (ПК)',
      '✅ Видео и аудио в чатах',
      '✅ @упоминания в группах',
      '✅ Кнопка прокрутки вниз ↓',
      '✅ Прозвища для контактов',
      '✅ Блокировка пользователей',
      '✅ Описание групп',
      '✅ Голосовой ввод',
    ]
  },
  {
    version:'v1.2 — Группы',
    date:'18 марта 2026',
    entries:[
      '✅ Групповые чаты с ролями (Владелец, Админ, Участник)',
      '✅ Настройки группы — фото, название, участники',
      '✅ Инвайт-система — только по ссылке',
      '✅ Правый клик на чат — закрепить / удалить',
    ]
  },
  {
    version:'v1.0 — Запуск',
    date:'15 марта 2026',
    entries:[
      '🚀 Первый запуск GrishaChat',
      '✅ Личные и групповые чаты',
      '✅ Фото и файлы',
      '✅ Статус онлайн/оффлайн',
      '✅ Работает как приложение на телефоне (PWA)',
    ]
  }
]

export function SettingsModal({ profile, session, onClose, onUpdate, showToast, chats=[] }) {
  const [tab, setTab] = useState('main')
  const [editName, setEditName] = useState(profile.full_name||'')
  const [editBio, setEditBio] = useState(profile.bio||'')
  const [editUsername, setEditUsername] = useState(profile.username||'')
  const [newPw, setNewPw] = useState('')
  const [saving, setSaving] = useState(false)
  const [avLoading, setAvLoading] = useState(false)
  const [confirmClear, setConfirmClear] = useState(null)

  function Row({icon, label, value, onClick, danger}) {
    return (
      <div className={`sett-row${danger?' danger':''}${onClick?' clickable':''}`} onClick={onClick}
        style={{cursor:onClick?'pointer':'default'}}>
        <span className="sett-icon">{icon}</span>
        <span className="sett-label">{label}</span>
        {value&&<span className="sett-val">{value}</span>}
        {onClick&&<span className="sett-arrow">›</span>}
      </div>
    )
  }

  async function saveProfile() {
    setSaving(true)
    const updates = {full_name:editName.trim(), bio:editBio.trim()}
    // Username change: check uniqueness
    if (editUsername.trim() !== profile.username) {
      const uname = editUsername.toLowerCase().trim().replace(/[^a-z0-9_]/g,'')
      if (uname.length < 3) { showToast('Username мин. 3 символа'); setSaving(false); return }
      const {data:ex} = await supabase.from('profiles').select('id').eq('username',uname).neq('id',session.user.id).single()
      if (ex) { showToast('Username уже занят'); setSaving(false); return }
      updates.username = uname
      updates.username_changed_at = new Date().toISOString()
    }
    const {data,error} = await supabase.from('profiles').update(updates).eq('id',session.user.id).select().single()
    if (!error) { onUpdate(data); showToast('Сохранено ✓') }
    setSaving(false)
  }

  async function changePw() {
    if (newPw.length < 6) { showToast('Пароль мин. 6 символов'); return }
    const {error} = await supabase.auth.updateUser({password:newPw})
    if (error) showToast('Ошибка смены пароля')
    else { showToast('Пароль изменён ✓'); setNewPw('') }
  }

  async function changeAv(e) {
    const f = e.target.files[0]; if(!f) return; setAvLoading(true)
    const fn = `${session.user.id}.${f.name.split('.').pop()}`
    await supabase.storage.from('avatars').upload(fn,f,{upsert:true})
    const {data:{publicUrl}} = supabase.storage.from('avatars').getPublicUrl(fn)
    const {data} = await supabase.from('profiles').update({avatar_url:publicUrl+'?t='+Date.now()}).eq('id',session.user.id).select().single()
    onUpdate(data); setAvLoading(false); showToast('Фото обновлено ✓'); e.target.value=''
  }

  async function clearChatHistory(chatId) {
    await supabase.from('messages').update({deleted:true,content:null,file_url:null}).eq('chat_id',chatId).eq('sender_id',session.user.id)
    setConfirmClear(null); showToast('История очищена ✓')
  }

  async function logout() {
    await supabase.from('profiles').update({online:false}).eq('id',session.user.id)
    await supabase.auth.signOut()
  }

  async function deleteAccount() {
    if (!window.confirm('Удалить аккаунт? Это необратимо.')) return
    await supabase.from('profiles').delete().eq('id',session.user.id)
    await supabase.auth.signOut()
  }

  const backBtn = tab!=='main' && (
    <button onClick={()=>setTab('main')} style={{background:'none',border:'none',color:'var(--accent2)',fontSize:22,cursor:'pointer',padding:0,marginRight:6}}>‹</button>
  )

  const titles = {main:'⚙️ Настройки',profile:'👤 Профиль',security:'🔒 Безопасность',chats_tab:'💬 Чаты',install:'📲 Установка',changelog:'📋 Changelog',about:'ℹ️ О приложении'}

  return (
    <div className="overlay" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="modal wide" style={{maxWidth:480}}>
        <div className="modal-head">
          <span className="modal-title">{backBtn}{titles[tab]||'Настройки'}</span>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        {/* MAIN */}
        {tab==='main'&&(
          <div className="sett-wrap">
            <div className="sett-profile" onClick={()=>setTab('profile')}>
              <Avatar name={profile.full_name} url={profile.avatar_url} size={56}/>
              <div className="sp-info">
                <div className="sp-name">{profile.full_name}</div>
                <div className="sp-un">@{profile.username}</div>
                {profile.bio&&<div style={{fontSize:13,color:'var(--text2)',marginTop:3}}>{profile.bio}</div>}
              </div>
              <span style={{color:'var(--text3)'}}>›</span>
            </div>

            <div className="sett-section">
              <div className="sett-section-title">Аккаунт</div>
              <div className="sett-section">
                <Row icon="👤" label="Редактировать профиль" onClick={()=>setTab('profile')}/>
                <Row icon="🔒" label="Безопасность и вход" onClick={()=>setTab('security')}/>
              </div>
            </div>

            <div className="sett-section">
              <div className="sett-section-title">Чаты и контент</div>
              <div className="sett-section">
                <Row icon="💬" label="Управление чатами" onClick={()=>setTab('chats_tab')}/>
              </div>
            </div>

            <div className="sett-section">
              <div className="sett-section-title">Другое</div>
              <div className="sett-section">
                <Row icon="📲" label="Установить приложение" onClick={()=>setTab('install')}/>
                <Row icon="📋" label="История обновлений" onClick={()=>setTab('changelog')}/>
                <Row icon="ℹ️" label="О приложении" onClick={()=>setTab('about')}/>
                <Row icon="📝" label="Помощник" onClick={()=>setTab('exam')}/>
              </div>
            </div>

            <div className="sett-section">
              <div className="sett-section-title">Сессия</div>
              <div className="sett-section">
                <Row icon="🚪" label="Выйти" onClick={logout} danger/>
                <Row icon="🗑" label="Удалить аккаунт" onClick={deleteAccount} danger/>
              </div>
            </div>

            <div className="by-grisha">
              💬 GrishaChat<br/>
              Сделано с <span className="heart">❤️</span> by <b style={{color:'var(--accent2)'}}>Grisha</b><br/>
              <span style={{fontSize:11}}>Только для своих · Приватно · Бесплатно</span>
            </div>
          </div>
        )}

        {/* PROFILE */}
        {tab==='profile'&&(
          <div>
            <label htmlFor="sett-av">
              <div className="profile-av-big" style={{background:profile.avatar_url?'transparent':getColor(profile.full_name)}}>
                {profile.avatar_url?<img src={profile.avatar_url} alt=""/>:(profile.full_name||'?')[0].toUpperCase()}
                {avLoading&&<div style={{position:'absolute',inset:0,background:'rgba(0,0,0,.5)',display:'flex',alignItems:'center',justifyContent:'center',borderRadius:'50%'}}><div className="spin" style={{width:22,height:22}}/></div>}
              </div>
            </label>
            <input id="sett-av" type="file" accept="image/*" style={{display:'none'}} onChange={changeAv}/>
            <p style={{textAlign:'center',color:'var(--text3)',fontSize:12,marginBottom:20}}>Нажми на фото чтобы изменить</p>
            <div className="f-group"><label className="f-label">Имя</label><input className="f-input" value={editName} onChange={e=>setEditName(e.target.value)}/></div>
            <div className="f-group"><label className="f-label">Username</label><input className="f-input" value={editUsername} onChange={e=>setEditUsername(e.target.value)} placeholder="только латиница и цифры"/></div>
            <div className="f-group"><label className="f-label">О себе</label><textarea className="f-input" value={editBio} onChange={e=>setEditBio(e.target.value)} rows={3} placeholder="Расскажи о себе..."/></div>
            <div className="f-group"><label className="f-label">Email</label><input className="f-input" value={session.user.email} disabled/></div>
            <button className="btn-primary" onClick={saveProfile} disabled={saving}>{saving?'Сохранение...':'Сохранить изменения'}</button>
          </div>
        )}

        {/* SECURITY */}
        {tab==='security'&&(
          <div>
            <div className="sett-section">
              <div className="sett-section-title">Смена пароля</div>
              <div className="f-group"><label className="f-label">Новый пароль</label><input className="f-input" type="password" value={newPw} onChange={e=>setNewPw(e.target.value)} placeholder="Минимум 6 символов"/></div>
              <button className="btn-primary" onClick={changePw} disabled={newPw.length<6}>Сменить пароль</button>
            </div>

            <div className="sett-section" style={{marginTop:24}}>
              <div className="sett-section-title">Защита данных</div>
              <div style={{background:'rgba(34,197,94,.08)',border:'1px solid rgba(34,197,94,.2)',borderRadius:12,padding:14,fontSize:13,color:'var(--text2)',lineHeight:1.8}}>
                🔑 Вход только по инвайт-коду<br/>
                🛡 Защита данных через Supabase RLS<br/>
                📧 Уникальный email у каждого аккаунта<br/>
                🔤 Уникальный @username у каждого<br/>
                🔒 Пароли хранятся в зашифрованном виде
              </div>
            </div>

            <div className="sett-section" style={{marginTop:20}}>
              <div className="sett-section-title">Активные сессии</div>
              <div style={{background:'var(--bg3)',borderRadius:12,padding:14}}>
                <div style={{fontWeight:600,marginBottom:4}}>💻 Текущий сеанс</div>
                <div style={{fontSize:13,color:'var(--text2)'}}>{navigator.userAgent.includes('Mobile')?'📱 Мобильный':'🖥 Компьютер'} · {new Date().toLocaleDateString('ru')}</div>
                <div style={{fontSize:11,color:'var(--green)',marginTop:4}}>● Активен сейчас</div>
              </div>
            </div>
          </div>
        )}

        {/* CHATS */}
        {tab==='chats_tab'&&(
          <div>
            <div className="sett-section-title">Очистить историю</div>
            {chats.length===0&&<div className="empty-hint">Нет чатов</div>}
            {chats.map(chat=>(
              <div key={chat.id} style={{display:'flex',alignItems:'center',gap:12,padding:'9px 0',borderBottom:'1px solid var(--border)'}}>
                <Avatar name={chat.is_favorite?'Избранное':chat.displayName} url={chat.displayAvatar} size={38}/>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontWeight:600,fontSize:14,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{chat.is_favorite?'⭐ Избранное':chat.displayName}</div>
                </div>
                <button className="btn-sm" style={{background:'rgba(239,68,68,.15)',color:'#fca5a5',border:'none'}} onClick={()=>setConfirmClear(chat.id)}>Очистить</button>
              </div>
            ))}
            {confirmClear&&(
              <div style={{background:'var(--bg4)',borderRadius:14,padding:16,marginTop:16}}>
                <p style={{marginBottom:12,fontSize:14}}>Очистить историю? (только твои сообщения)</p>
                <div style={{display:'flex',gap:10}}>
                  <button className="btn-sm btn-ghost" style={{flex:1}} onClick={()=>setConfirmClear(null)}>Отмена</button>
                  <button className="btn-sm" style={{flex:1,background:'rgba(239,68,68,.2)',color:'#fca5a5',border:'none'}} onClick={()=>clearChatHistory(confirmClear)}>Очистить</button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* INSTALL */}
        {tab==='install'&&(
          <div>
            <div style={{textAlign:'center',fontSize:52,marginBottom:14}}>📲</div>
            <h3 style={{textAlign:'center',marginBottom:20}}>Установить на телефон</h3>
            <div style={{background:'var(--bg3)',borderRadius:14,padding:16,marginBottom:12}}>
              <div style={{fontWeight:700,marginBottom:10}}>🤖 Android (Chrome)</div>
              <div style={{fontSize:14,color:'var(--text2)',lineHeight:1.9}}>
                1. Открой <b style={{color:'var(--text)'}}>grishachat.vercel.app</b> в Chrome<br/>
                2. Нажми три точки <b style={{color:'var(--text)'}}>⋮</b> справа вверху<br/>
                3. Выбери <b style={{color:'var(--text)'}}>«Добавить на главный экран»</b><br/>
                4. Нажми <b style={{color:'var(--text)'}}>«Установить»</b> → готово 🎉
              </div>
            </div>
            <div style={{background:'var(--bg3)',borderRadius:14,padding:16,marginBottom:12}}>
              <div style={{fontWeight:700,marginBottom:10}}>🍎 iPhone / iPad (Safari)</div>
              <div style={{fontSize:14,color:'var(--text2)',lineHeight:1.9}}>
                1. Открой <b style={{color:'var(--text)'}}>grishachat.vercel.app</b> в Safari<br/>
                2. Нажми кнопку <b style={{color:'var(--text)'}}>«Поделиться» ⬆</b> внизу<br/>
                3. Выбери <b style={{color:'var(--text)'}}>«На экран Домой»</b><br/>
                4. Нажми <b style={{color:'var(--text)'}}>«Добавить»</b> → готово 🎉
              </div>
            </div>
          </div>
        )}

        {/* CHANGELOG */}
        {tab==='changelog'&&(
          <div>
            {CHANGELOG.map((cl,i)=>(
              <div key={i} className="changelog-item">
                <div className="changelog-version">{cl.version}</div>
                <div className="changelog-date">📅 {cl.date}</div>
                <div className="changelog-entry">{cl.entries.join('\n')}</div>
              </div>
            ))}
          </div>
        )}

        {/* EXAM HELPER - hidden feature */}
        {tab==='exam'&&(
          <div>
            <div style={{textAlign:'center',fontSize:48,marginBottom:12}}>📝</div>
            <h3 style={{textAlign:'center',marginBottom:8}}>Помощник</h3>
            <p style={{textAlign:'center',fontSize:13,color:'var(--text3)',marginBottom:20}}>Инструменты для учёбы</p>

            <div style={{background:'var(--bg3)',borderRadius:14,padding:16,marginBottom:12}}>
              <div style={{fontWeight:700,marginBottom:8}}>🎙 Голосовой диктант</div>
              <div style={{fontSize:13,color:'var(--text2)',lineHeight:1.8}}>
                В чате нажми 🎙 — говори, текст вводится автоматически.<br/>
                Работает в Chrome и Edge (Android, ПК).<br/>
                На iPhone — в Safari через голосовую клавиатуру.
              </div>
            </div>

            <div style={{background:'var(--bg3)',borderRadius:14,padding:16,marginBottom:12}}>
              <div style={{fontWeight:700,marginBottom:8}}>📤 Быстрая отправка</div>
              <div style={{fontSize:13,color:'var(--text2)',lineHeight:1.8}}>
                Ctrl+Enter — отправить сообщение быстро.<br/>
                Enter — новая строка (можно писать несколько строк).<br/>
                Ctrl+V — вставить скопированное фото прямо в чат.
              </div>
            </div>

            <div style={{background:'var(--bg3)',borderRadius:14,padding:16,marginBottom:12}}>
              <div style={{fontWeight:700,marginBottom:8}}>🔍 Поиск в чате</div>
              <div style={{fontSize:13,color:'var(--text2)',lineHeight:1.8}}>
                В чате нажми 🔍 — поиск по всем сообщениям.<br/>
                Находит любое слово или фразу.
              </div>
            </div>

            <div style={{background:'rgba(239,68,68,.08)',border:'1px solid rgba(239,68,68,.15)',borderRadius:12,padding:12,fontSize:12,color:'var(--text3)'}}>
              Этот раздел не рекламируется — только для своих 🤫
            </div>
          </div>
        )}

        {/* ABOUT */}
        {tab==='about'&&(
          <div style={{textAlign:'center'}}>
            <div style={{fontSize:68,marginBottom:16}}>💬</div>
            <h2 style={{fontSize:24,fontWeight:800,marginBottom:6}}>GrishaChat</h2>
            <p style={{color:'var(--text3)',marginBottom:4,fontSize:14}}>Приватный мессенджер для своих</p>
            <p style={{color:'var(--text3)',fontSize:13,marginBottom:24}}>Версия 1.3 · 2026</p>
            <div style={{background:'var(--bg3)',borderRadius:14,padding:16,textAlign:'left',marginBottom:16}}>
              <div style={{fontSize:13,color:'var(--text2)',lineHeight:2.2}}>
                ✅ Только по инвайт-коду<br/>
                ✅ Личные и групповые чаты<br/>
                ✅ Фото, видео, аудио, файлы до 50 МБ<br/>
                ✅ Реакции, ответы, закреп, редактирование<br/>
                ✅ Роли в группах (Владелец / Админ / Участник)<br/>
                ✅ Голосовой ввод текста<br/>
                ✅ @упоминания, прозвища, блокировка<br/>
                ✅ Работает как приложение (PWA)<br/>
                ✅ Защита данных Supabase RLS
              </div>
            </div>
            <div className="by-grisha" style={{fontSize:16}}>
              Сделано с <span className="heart">❤️</span> by <b style={{color:'var(--accent2)'}}>Grisha</b><br/>
              <span style={{fontSize:12,color:'var(--text3)'}}>2026 · Только для своих</span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
