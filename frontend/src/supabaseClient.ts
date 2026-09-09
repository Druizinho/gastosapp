import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

let client;
try {
  // Verificamos si la URL es válida antes de intentar crear el cliente
  if (!supabaseUrl || !supabaseUrl.startsWith('http')) {
    console.error('URL de Supabase inválida o no definida:', supabaseUrl);
    // Creamos un cliente falso para que la app no crashee en pantalla azul
    client = createClient('https://ejemplo.supabase.co', 'dummy-key');
  } else {
    client = createClient(supabaseUrl, supabaseAnonKey);
  }
} catch (error) {
  console.error('Error inicializando Supabase:', error);
  client = createClient('https://ejemplo.supabase.co', 'dummy-key');
}

export const supabase = client;
