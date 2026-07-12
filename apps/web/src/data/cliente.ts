// ÚNICO archivo de la app que importa @supabase/supabase-js (§7b: portabilidad de proveedor).
// Los repositorios src/data/*.ts consumen `clienteSupabase()` y exponen funciones tipadas
// por dominio; ningún componente toca supabase-js directamente.
// eslint-disable-next-line no-restricted-imports
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let instancia: SupabaseClient | null = null;

/** Singleton del cliente Supabase para el navegador (sesión en localStorage). */
export function clienteSupabase(): SupabaseClient {
  if (instancia) return instancia;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error(
      'Faltan NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY — copia .env.local.example a .env.local',
    );
  }
  instancia = createClient(url, anonKey);
  return instancia;
}
