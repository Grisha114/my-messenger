const COLORS = ['#5b6ef5','#2563eb','#059669','#dc2626','#d97706','#db2777','#7c3aed','#0891b2']

export function getColor(name) {
  const c = (name || '?').charCodeAt(0)
  return COLORS[c % COLORS.length]
}

export function Avatar({ name, url, size=46, online=false, onClick }) {
  const letter = (name || '?')[0].toUpperCase()
  return (
    <div className="av" style={{ width:size, height:size, background:url?'transparent':getColor(name), fontSize:size*.38, flexShrink:0 }} onClick={onClick}>
      {url ? <img src={url} alt={name}/> : letter}
      {online && <div className="dot"/>}
    </div>
  )
}

export function formatTime(ts) {
  if (!ts) return ''
  return new Date(ts).toLocaleTimeString('ru', { hour:'2-digit', minute:'2-digit' })
}

export function formatDate(ts) {
  const d = new Date(ts), now = new Date()
  if (d.toDateString()===now.toDateString()) return 'Сегодня'
  const y = new Date(now); y.setDate(y.getDate()-1)
  if (d.toDateString()===y.toDateString()) return 'Вчера'
  return d.toLocaleDateString('ru', { day:'numeric', month:'long', year:'numeric' })
}

export function formatSidebarTime(ts) {
  if (!ts) return ''
  const d = new Date(ts), now = new Date(), diff = now - d
  if (diff < 86400000) return d.toLocaleTimeString('ru', { hour:'2-digit', minute:'2-digit' })
  if (diff < 604800000) return d.toLocaleDateString('ru', { weekday:'short' })
  return d.toLocaleDateString('ru', { day:'2-digit', month:'2-digit' })
}

export function formatLastSeen(ts, online) {
  if (online) return 'в сети'
  if (!ts) return 'не в сети'
  const d = new Date(ts), now = new Date(), diff = now - d
  if (diff < 60000) return 'только что'
  if (diff < 3600000) return `был(а) ${Math.floor(diff/60000)} мин назад`
  if (d.toDateString()===now.toDateString()) return `был(а) сегодня в ${d.toLocaleTimeString('ru',{hour:'2-digit',minute:'2-digit'})}`
  const y = new Date(now); y.setDate(y.getDate()-1)
  if (d.toDateString()===y.toDateString()) return `был(а) вчера в ${d.toLocaleTimeString('ru',{hour:'2-digit',minute:'2-digit'})}`
  return `был(а) ${d.toLocaleDateString('ru',{day:'numeric',month:'long'})}`
}

export const SENDER_COLORS = ['#a78bfa','#60a5fa','#34d399','#fb923c','#f472b6','#38bdf8','#fbbf24','#4ade80']
export function senderColor(name) {
  return SENDER_COLORS[(name||'?').charCodeAt(0) % SENDER_COLORS.length]
}
