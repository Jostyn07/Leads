import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Faltan las variables SUPABASE_URL / SUPABASE_ANON_KEY. ' +
    'Copia .env.local.example a .env.local y completa los valores.'
  );
}

// Cliente único para usar en componentes de cliente ("use client").
export const supabase = createClient(supabaseUrl, supabaseAnonKey);