import { useState } from 'react'
import { supabase } from '../supabase'
import { Avatar, formatLastSeen } from './helpers.jsx'

export default function NewChatModal({ session, profile, onClose, onCreated, showToast }) {
  const [tab, setTab] = useState('direct')
  const [q, setQ] = useState('')
  const [results, setResults] = useState([])
  const [gName, setGName] = useState('')
  const [sel, setSel] = useState([])
  const [loading, setLoading] = useState(false)

  async function search(v) {
    setQ(v)
    if (v.length<2) { setResults([]); return }
    const { data } = await supabase.from('profiles').select('id,full_name,username,avatar_url,online,last_seen').neq('id',session.user.id).or(`username.ilike.%${v}%,full_name.ilike.%${v}%`).limit(10)
    setResults(data||[])
  }

  async function startDirect(user) {
    setLoading(true)
    const { data:m } = await supabase.from('chat_members').select('chat_id').eq('user_id',session.user.id)
    const ids = m?.map(x=>x.chat_id)||[]
    if (ids.length) {
      const { data:sh } = await supabase.from('chat_members').select('chat_id,chats(id,type)').eq('user_id',user.id).in('chat_id',ids)
      const ex = sh?.find(x=>x.chats?.type==='direct')
      if (ex) { onCreated({...ex.chats,displayName:user.full_name,displayAvatar:user.avatar_url,otherUser:user,type:'direct'}); setLoading(false); return }
    }
    const { data:chat } = await supabase.from('chats').insert({type:'direct',created_by:session.user.id}).select().single()
    await supabase.from('chat_members').insert([{chat_id:chat.id,user_id:session.user.id,role:'member'},{chat_id:chat.id,user_id:user.id,role:'member'}])
    onCreated({...chat,displayName:user.full_name,displayAvatar:user.avatar_url,otherUser:user,type:'direct'})
    setLoading(false)
  }

  async function createGroup() {
    if (!gName.trim()||!sel.length) { showToast('Введи название и добавь участников'); return }
    setLoading(true)
    const { data:chat } = await supabase.from('chats').insert({type:'group',name:gName.trim(),created_by:session.user.id}).select().single()
    await supabase.from('chat_members').insert([
      {chat_id:chat.id,user_id:session.user.id,role:'owner'},
      ...sel.map(u=>({chat_id:chat.id,user_id:u.id,role:'member'}))
    ])
    onCreated({...chat,displayName:gName.trim(),type:'group',myRole:'owner',otherMembers:sel})
    setLoading(false)
  }

  const toggle = u => setSel(p=>p.find(x=>x.id===u.id)?p.filter(x=>x.id!==u.id):[...p,u])

  return (
    <div className="overlay" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="modal">
        <div className="modal-head"><span className="modal-title">Новый чат</span><button className="modal-close" onClick={onClose}>×</button></div>
        <div className="tabs"><button className={`tab${tab==='direct'?' on':''}`} onClick={()=>setTab('direct')}>💬 Личный</button><button className={`tab${tab==='group'?' on':''}`} onClick={()=>setTab('group')}>👥 Группа</button></div>

        {tab==='group'&&<div className="f-group"><input className="f-input" placeholder="Название группы" value={gName} onChange={e=>setGName(e.target.value)}/></div>}

        <div className="f-group"><input className="f-input" placeholder="Поиск по имени или @username" value={q} onChange={e=>search(e.target.value)}/></div>

        {tab==='group'&&sel.length>0&&(
          <div style={{display:'flex',flexWrap:'wrap',gap:6,marginBottom:12}}>
            {sel.map(u=><span key={u.id} className="chip">{u.full_name}<span className="chip-x" onClick={()=>toggle(u)}>×</span></span>)}
          </div>
        )}

        {results.length===0&&q.length>=2&&<div className="empty-hint">Никого не найдено</div>}

        {results.map(user=>(
          <div key={user.id} className="user-row">
            <Avatar name={user.full_name} url={user.avatar_url} size={40} online={user.online}/>
            <div className="user-row-info"><div className="user-row-name">{user.full_name}</div><div className="user-row-un">@{user.username}</div></div>
            {tab==='direct'
              ? <button className="btn-sm btn-acc" onClick={()=>startDirect(user)} disabled={loading}>Написать</button>
              : <button className={`btn-sm ${sel.find(x=>x.id===user.id)?'btn-ghost':'btn-acc'}`} onClick={()=>toggle(user)}>{sel.find(x=>x.id===user.id)?'✓':'+ Добавить'}</button>
            }
          </div>
        ))}

        {tab==='group'&&<button className="btn-primary" style={{marginTop:16}} onClick={createGroup} disabled={loading||!sel.length||!gName.trim()}>{loading?'Создание...':'Создать группу'}</button>}
      </div>
    </div>
  )
}
