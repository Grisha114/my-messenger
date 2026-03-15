import { useState, useEffect } from 'react'
import { supabase } from './supabase'
import AuthPage from './components/AuthPage'
import SetupPage from './components/SetupPage'
import MainPage from './components/MainPage'

export default function App() {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      if (session) loadProfile(session.user.id)
      else setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      if (session) loadProfile(session.user.id)
      else { setProfile(null); setLoading(false) }
    })

    return () => subscription.unsubscribe()
  }, [])

  async function loadProfile(userId) {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()
    setProfile(data)
    setLoading(false)
  }

  if (loading) return (
    <div className="loading">
      <div className="spinner"></div>
      <span>Загрузка...</span>
    </div>
  )

  if (!session) return <AuthPage />
  if (!profile) return <SetupPage session={session} onDone={(p) => setProfile(p)} />
  return <MainPage session={session} profile={profile} onProfileUpdate={setProfile} />
}
