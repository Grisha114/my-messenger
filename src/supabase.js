import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://jqdbpehdaidhwfqujcbc.supabase.co'
const supabaseKey = 'sb_publishable_HkCUvTiw50vciraUBkvUow_Z-XtUFEC'

export const supabase = createClient(supabaseUrl, supabaseKey, {
  realtime: { params: { eventsPerSecond: 10 } }
})
