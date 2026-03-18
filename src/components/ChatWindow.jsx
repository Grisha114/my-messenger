import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '../supabase'
import GroupSettingsModal from './GroupSettingsModal'
import { UserProfileModal } from './ProfileModal'
import { Avatar, formatTime, formatDate, formatLastSeen, senderColor } from './helpers.jsx'

const EMOJIS = ['👍','❤️','😂','😮','😢','🔥','👏','🎉','🤩','💯']

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
  const [ctx, setCtx] = useState(null)
  const [reactions, setReactions] = useState({})
  const [pinnedMsg, setPinnedMsg] = useState(null)
  const [viewUser, setViewUser] = useState(null)
  const [pasteFile, setPasteFile] = useState(null) // pasted image
  const [typing, setTyping] = useState(false)
  const bottomRef = useRef(null)
  const taRef = useRef(null)
  const fileRef = useRef(null)
  const chRef = useRef(null)

  useEffect(() => {
    setCurChat(chat)
    if (!chat) return
    setMsgs([]); setReplyTo(null); setCtx(null); setPasteFile(null)
    loadMsgs(); loadMembers(); markRead()

    if (chRef.current) supabase.removeChannel(chRef.current)
    chRef.current = supabase.channel(`cw:${chat.id}`)
      .on('postgres_changes',{event:'INSERT',schema:'public',table:'messages',filter:`chat_id=eq.${chat.id}`},
        p => { setMsgs(prev=>[...prev,p.new]); markRead() })
      .on('postgres_changes',{event:'UPDATE',schema:'public',table:'messages',filter:`chat_id=eq.${chat.id}`},
        p => { if(p.new.deleted) setMsgs(prev=>prev.filter(m=>m.id!==p.new.id)); else setMsgs(prev=>prev.map(m=>m.id===p.new.id?p.new:m)) })
      .on('postgres_changes',{event:'*',schema:'public',table:'reactions'}, loadReactions)
      .subscribe()

    return () => { if(chRef.current) supabase.removeChannel(chRef.current) }
  }, [chat?.id])

  useEffect(() => { bottomRef.current?.scrollIntoView({behavior:'smooth'}) }, [msgs])

  // Auto-resize textarea
  useEffect(() => {
    if (taRef.current) {
      taRef.current.style.height = 'auto'
      taRef.current.style.height = Math.min(taRef.current.scrollHeight, 140) + 'px'
    }
  }, [text])

  // Close ctx on click
  useEffect(() => {
    const h = () => setCtx(null)
    window.addEventListener('click', h)
    return () => window.removeEventListener('click', h)
  }, [])

  // Paste image
  useEffect(() => {
    function onPaste(e) {
      const items = e.clipboardData?.items
      if (!items) return
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          const f = item.getAsFile()
          setPasteFile(f)
          e.preventDefault()
          break
        }
      }
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [])

  async function loadMembers() {
    const { data } = await supabase.from('chat_members')
      .select('user_id,role,profiles(id,full_name,username,avatar_url,online,last_seen,bio)')
      .eq('chat_id', chat.id)
    if (data) {
      const map = {}
      data.forEach(m => { map[m.user_id]={...m.profiles,role:m.role}; if(m.user_id===session.user.id) setMyRole(m.role||'member') })
      setMembers(map)
    }
  }

  async function loadMsgs() {
    const { data } = await supabase.from('messages').select('*').eq('chat_id',chat.id).eq('deleted',false).order('created_at',{ascending:true}).limit(300)
    setMsgs(data||[])
    loadReactions()
    loadPinned()
  }

  async function loadReactions() {
    if (!chat) return
    const { data:m } = await supabase.from('messages').select('id').eq('chat_id',chat.id).eq('deleted',false)
    if (!m?.length) return
    const { data:r } = await supabase.from('reactions').select('*').in('message_id',m.map(x=>x.id))
    if (!r) return
    const g = {}
    r.forEach(x => { if(!g[x.message_id]) g[x.message_id]={}; if(!g[x.message_id][x.emoji]) g[x.message_id][x.emoji]=[]; g[x.message_id][x.emoji].push(x.user_id) })
    setReactions(g)
  }

  async function loadPinned() {
    if (!chat?.pinned_message_id) { setPinnedMsg(null); return }
    const { data } = await supabase.from('messages').select('*').eq('id',chat.pinned_message_id).single()
    setPinnedMsg(data||null)
  }

  async function markRead() {
    await supabase.from('messages').update({is_read:true}).eq('chat_id',chat.id).neq('sender_id',session.user.id).eq('is_read',false)
  }

  async function send() {
    // Send pasted image first
    if (pasteFile) { await sendFileObj(pasteFile); setPasteFile(null) }
    const content = text.trim()
    if (!content && !pasteFile) return
    if (!content) return
    setSending(true); setText('')
    const msg = { chat_id:chat.id, sender_id:session.user.id, content, is_read:false, deleted:false }
    if (replyTo) msg.reply_to = replyTo.id
    await supabase.from('messages').insert(msg)
    setReplyTo(null); setSending(false)
    taRef.current?.focus()
  }

  async function sendFileObj(file) {
    if (file.size > 50*1024*1024) { showToast('Макс. размер файла — 50 МБ'); return }
    const isImg = file.type.startsWith('image/')
    const fn = `${chat.id}/${Date.now()}_${file.name||'image.png'}`
    const { error } = await supabase.storage.from('chat-files').upload(fn, file)
    if (error) { showToast('Ошибка загрузки'); return }
    const { data:{publicUrl} } = supabase.storage.from('chat-files').getPublicUrl(fn)
    await supabase.from('messages').insert({ chat_id:chat.id, sender_id:session.user.id, content:isImg?null:file.name, file_url:publicUrl, file_type:isImg?'image':'file', is_read:false, deleted:false })
  }

  async function pickAndSend(e) {
    const f = e.target.files[0]; if (!f) return
    setSending(true); await sendFileObj(f); setSending(false); e.target.value=''
  }

  async function deleteMsgFn(msg) {
    await supabase.from('messages').update({deleted:true,content:null,file_url:null}).eq('id',msg.id)
    setMsgs(prev=>prev.filter(m=>m.id!==msg.id))
    setCtx(null); showToast('Сообщение удалено')
  }

  async function pinMsgFn(msg) {
    await supabase.from('chats').update({pinned_message_id:msg.id}).eq('id',chat.id)
    setCurChat(p=>({...p,pinned_message_id:msg.id})); setPinnedMsg(msg)
    setCtx(null); showToast('Закреплено 📌')
  }

  async function unpin() {
    await supabase.from('chats').update({pinned_message_id:null}).eq('id',chat.id)
    setCurChat(p=>({...p,pinned_message_id:null})); setPinnedMsg(null); showToast('Откреплено')
  }

  async function toggleReaction(msgId, emoji) {
    const mine = reactions[msgId]?.[emoji]?.includes(session.user.id)
    if (mine) await supabase.from('reactions').delete().eq('message_id',msgId).eq('user_id',session.user.id).eq('emoji',emoji)
    else await supabase.from('reactions').insert({message_id:msgId,user_id:session.user.id,emoji})
    setCtx(null); loadReactions()
  }

  function onKeyDown(e) {
    if (e.key==='Enter' && !e.shiftKey) { e.preventDefault(); send() }
    if (e.key==='Escape') setReplyTo(null)
  }

  function openCtx(e, msg) {
    e.preventDefault(); e.stopPropagation()
    setCtx({ msg, x:Math.min(e.clientX,window.innerWidth-220), y:Math.min(e.clientY,window.innerHeight-280) })
  }

  const canDel = m => m.sender_id===session.user.id||myRole==='owner'||myRole==='admin'
  const canPin = myRole==='owner'||myRole==='admin'

  // Group messages
  const grouped = []
  let lastDate = null
  msgs.forEach(msg => {
    const d = new Date(msg.created_at).toDateString()
    if (d!==lastDate) { grouped.push({type:'date',date:msg.created_at}); lastDate=d }
    grouped.push({type:'msg',...msg})
  })

  if (!chat) return (
    <div className="chat-win">
      <div className="chat-empty">
        <div className="big">💬</div>
        <p style={{fontSize:18,fontWeight:700}}>Выбери чат</p>
        <p>или начни новый разговор</p>
      </div>
    </div>
  )

  const otherUser = chat.otherUser
  const headerName = curChat?.name||chat.displayName
  const headerStatus = chat.type==='direct' ? formatLastSeen(otherUser?.last_seen,otherUser?.online) : `${Object.keys(members).length} участников`

  return (
    <div className={`chat-win mobile${visible?' visible':''}`}>

      {/* Header */}
      <div className="chat-head" onClick={()=>{ if(chat.type==='direct'&&otherUser) setViewUser(otherUser) }}>
        <button className="back-btn" onClick={e=>{e.stopPropagation();onBack()}}>‹</button>
        <Avatar name={headerName} url={curChat?.avatar_url||chat.displayAvatar} size={40} onClick={e=>{ if(chat.type==='group'){e.stopPropagation();setShowGrpSettings(true)} }}/>
        <div className="chat-head-info">
          <div className="chat-head-name">{headerName}</div>
          <div className={`chat-head-status${otherUser?.online?' on':''}`}>{headerStatus}</div>
        </div>
        {chat.type==='group' && <button className="ico-btn" onClick={e=>{e.stopPropagation();setShowGrpSettings(true)}}>⚙️</button>}
      </div>

      {/* Pinned */}
      {pinnedMsg && (
        <div className="pinned-bar">
          <span className="pin-icon">📌</span>
          <div className="pin-text">
            <div className="pin-label">Закреплено</div>
            <div className="pin-content">{pinnedMsg.content||(pinnedMsg.file_type==='image'?'🖼 Фото':'📎 Файл')}</div>
          </div>
          {canPin && <button onClick={unpin} className="reply-close">×</button>}
        </div>
      )}

      {/* Reply bar */}
      {replyTo && (
        <div className="reply-bar">
          <div className="reply-line"/>
          <div className="reply-info">
            <div className="reply-who">{members[replyTo.sender_id]?.full_name||'Сообщение'}</div>
            <div className="reply-what">{replyTo.content||(replyTo.file_type==='image'?'🖼 Фото':'📎 Файл')}</div>
          </div>
          <button className="reply-close" onClick={()=>setReplyTo(null)}>×</button>
        </div>
      )}

      {/* Paste preview */}
      {pasteFile && (
        <div className="paste-preview">
          <img src={URL.createObjectURL(pasteFile)} alt=""/>
          <div className="paste-preview-info">Изображение вставлено — нажми ➤ чтобы отправить</div>
          <button className="paste-preview-close" onClick={()=>setPasteFile(null)}>×</button>
        </div>
      )}

      {/* Messages */}
      <div className="msgs" onClick={()=>setCtx(null)}>
        {grouped.map((item,i) => {
          if (item.type==='date') return <div key={`d${i}`} className="date-sep">{formatDate(item.date)}</div>

          const sent = item.sender_id===session.user.id
          const sender = members[item.sender_id]
          const next = grouped[i+1]
          const isLast = !next||next.type==='date'||next.sender_id!==item.sender_id
          const rcts = reactions[item.id]
          const replyMsg = item.reply_to ? msgs.find(m=>m.id===item.reply_to) : null

          return (
            <div key={item.id} className={`msg-row${sent?' s':' r'}${isLast?' gap':''}`}>
              <div className="msg-inner">
                {/* Avatar for received messages */}
                {!sent && (
                  isLast
                    ? <div className={`msg-av-ph`} style={{background:sender?'transparent':'var(--accent)',width:30,height:30,flexShrink:0,alignSelf:'flex-end',cursor:'pointer'}} onClick={()=>sender&&sender.id!==session.user.id&&setViewUser(sender)}>
                        {sender?.avatar_url ? <div className="msg-av"><img src={sender.avatar_url} alt=""/></div> : (sender?.full_name||'?')[0].toUpperCase()}
                      </div>
                    : <div className="msg-av-gap"/>
                )}

                <div className={`bubble${sent?' s':' r'}`} onContextMenu={e=>openCtx(e,item)} onDoubleClick={()=>setReplyTo(item)}>

                  {/* Group sender name */}
                  {chat.type==='group'&&!sent&&isLast&&sender&&(
                    <div className="bubble-sender" style={{color:senderColor(sender.full_name),cursor:'pointer'}} onClick={()=>setViewUser(sender)}>
                      {sender.full_name}
                    </div>
                  )}

                  {/* Reply preview */}
                  {replyMsg&&(
                    <div className="bubble-reply">
                      <div className="bubble-reply-who">{members[replyMsg.sender_id]?.full_name||'?'}</div>
                      <div className="bubble-reply-text">{replyMsg.content||(replyMsg.file_type==='image'?'🖼 Фото':'📎 Файл')}</div>
                    </div>
                  )}

                  {/* Image */}
                  {item.file_type==='image'&&item.file_url&&(
                    <img className="bubble-img" src={item.file_url} alt="фото" onClick={()=>setLightbox(item.file_url)}/>
                  )}

                  {/* File */}
                  {item.file_type==='file'&&item.file_url&&(
                    <a className="bubble-file" href={item.file_url} target="_blank" rel="noreferrer">
                      <span className="bubble-file-icon">📎</span>
                      <div><div className="bubble-file-name">{item.content||'Файл'}</div><div className="bubble-file-sub">Открыть</div></div>
                    </a>
                  )}

                  {/* Text */}
                  {item.content&&!item.file_type&&<span>{item.content}</span>}

                  {/* Meta */}
                  <div className="bubble-meta">
                    <span>{formatTime(item.created_at)}</span>
                    {sent&&<span style={{opacity:item.is_read?1:.5}}>{item.is_read?'✓✓':'✓'}</span>}
                  </div>
                </div>
              </div>

              {/* Reactions */}
              {rcts&&Object.keys(rcts).length>0&&(
                <div className="reactions" style={{paddingLeft:sent?0:36,justifyContent:sent?'flex-end':'flex-start'}}>
                  {Object.entries(rcts).map(([emoji,users])=>(
                    <button key={emoji} className={`reaction-btn${users.includes(session.user.id)?' mine':''}`} onClick={()=>toggleReaction(item.id,emoji)}>
                      {emoji}<span className="reaction-count">{users.length}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )
        })}
        <div ref={bottomRef}/>
      </div>

      {/* Context menu */}
      {ctx&&(
        <>
          <div className="ctx-overlay" onClick={()=>setCtx(null)}/>
          <div className="ctx" style={{left:ctx.x,top:ctx.y}}>
            <div className="ctx-emojis">
              {EMOJIS.map(e=><button key={e} className="ctx-emoji" onClick={()=>toggleReaction(ctx.msg.id,e)}>{e}</button>)}
            </div>
            <button className="ctx-item" onClick={()=>{setReplyTo(ctx.msg);setCtx(null);taRef.current?.focus()}}>↩️ Ответить</button>
            {canPin&&<button className="ctx-item" onClick={()=>pinnedMsg?.id===ctx.msg.id?unpin():pinMsgFn(ctx.msg)}>📌 {pinnedMsg?.id===ctx.msg.id?'Открепить':'Закрепить'}</button>}
            {canDel(ctx.msg)&&<button className="ctx-item danger" onClick={()=>deleteMsgFn(ctx.msg)}>🗑 Удалить</button>}
          </div>
        </>
      )}

      {/* Input */}
      <div className="msg-input-area">
        <div className="msg-input-wrap">
          <button className="attach-btn" onClick={()=>fileRef.current?.click()}>📎</button>
          <textarea ref={taRef} className="msg-textarea" placeholder="Сообщение..." value={text}
            onChange={e=>setText(e.target.value)} onKeyDown={onKeyDown} rows={1}/>
        </div>
        <button className="send-btn" onClick={send} disabled={(!text.trim()&&!pasteFile)||sending}>➤</button>
        <input ref={fileRef} type="file" style={{display:'none'}} onChange={pickAndSend}/>
      </div>

      {/* Lightbox */}
      {lightbox&&<div className="lightbox" onClick={()=>setLightbox(null)}><img src={lightbox} alt=""/></div>}

      {/* Modals */}
      {showGrpSettings&&(
        <GroupSettingsModal chat={curChat} session={session} myRole={myRole}
          onClose={()=>setShowGrpSettings(false)}
          onUpdated={u=>{if(u){setCurChat(p=>({...p,...u}));onRefresh()}else{onBack();onRefresh()}}}
          onViewUser={setViewUser} showToast={showToast}/>
      )}
      {viewUser&&<UserProfileModal user={viewUser} session={session} onClose={()=>setViewUser(null)} onStartChat={c=>{setViewUser(null);onBack();setTimeout(onRefresh,100)}} showToast={showToast}/>}
    </div>
  )
}
