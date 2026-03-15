import { useState, useEffect } from 'react'
import { supabase } from '../supabase'

function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  return Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

export default function AdminModal({ profile, session, onClose, showToast }) {
  const [codes, setCodes] = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(() => { loadCodes() }, [])

  async function loadCodes() {
    const { data } = await supabase
      .from('invite_codes')
      .select('*, profiles!invite_codes_used_by_fkey(full_name)')
      .eq('created_by', session.user.id)
      .order('created_at', { ascending: false })

    setCodes(data || [])
  }

  async function createCode() {
    setLoading(true)
    const code = generateCode()
    await supabase.from('invite_codes').insert({
      code,
      created_by: session.user.id,
      max_uses: 1,
      uses_count: 0
    })
    await loadCodes()
    setLoading(false)
    showToast(`Код создан: ${code}`)
  }

  async function deleteCode(id) {
    await supabase.from('invite_codes').delete().eq('id', id)
    await loadCodes()
  }

  function copyCode(code) {
    const link = `${window.location.origin}?invite=${code}`
    navigator.clipboard.writeText(link)
    showToast('Ссылка скопирована ✓')
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-title">
          🔑 Инвайт-коды
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>
          Создавай коды и отправляй друзьям. Без кода зарегистрироваться нельзя.
        </p>

        <button className="btn-primary" onClick={createCode} disabled={loading} style={{ marginBottom: 20 }}>
          {loading ? 'Создание...' : '+ Создать инвайт-код'}
        </button>

        {codes.length === 0 && (
          <p style={{ color: 'var(--text-muted)', fontSize: 14, textAlign: 'center' }}>
            Нет кодов. Создай первый!
          </p>
        )}

        {codes.map(code => (
          <div key={code.id} className={`invite-code${code.is_used ? ' invite-used' : ''}`}>
            <div style={{ flex: 1 }}>
              <div className="invite-code-text">{code.code}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                {code.is_used
                  ? `✓ Использован${code.profiles ? ` — ${code.profiles.full_name}` : ''}`
                  : 'Не использован'
                }
              </div>
            </div>
            {!code.is_used && (
              <button className="copy-btn" onClick={() => copyCode(code.code)} title="Скопировать ссылку">
                🔗
              </button>
            )}
            <button
              className="copy-btn"
              onClick={() => deleteCode(code.id)}
              title="Удалить"
              style={{ fontSize: 16 }}
            >
              🗑
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
