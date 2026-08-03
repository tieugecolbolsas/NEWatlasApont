import { createClient } from '@supabase/supabase-js';

const url = process.env.VITE_SUPABASE_URL;
const key = process.env.VITE_SUPABASE_ANON_KEY;

if (url && key) {
  const supabase = createClient(url, key);
  supabase.schema('SupervisorProd').from('vw_cronograma_pausas').select('*').limit(1).then(res => {
    console.log(JSON.stringify(res.data, null, 2));
    console.log(res.error);
  });
}
