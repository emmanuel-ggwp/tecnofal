// Helper de datos para pruebas e2e: cliente service_role (salta RLS) para sembrar/limpiar filas.
// Solo se usa en e2e/ — nunca en código de la app.
// eslint-disable-next-line no-restricted-imports
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export const E2E_EMAIL = 'e2e@tecnofal.test';
export const E2E_PASSWORD = 'tecnofal-e2e';

let admin: SupabaseClient | null = null;

/** Cliente supabase-js con service_role (ignora RLS). */
export function clienteAdmin(): SupabaseClient {
  if (admin) return admin;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error('Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY en apps/web/.env.local');
  }
  admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return admin;
}

/** Crea el usuario e2e si no existe y devuelve su user_id. */
export async function asegurarUsuarioE2e(): Promise<string> {
  const cli = clienteAdmin();
  const { data, error } = await cli.auth.admin.createUser({
    email: E2E_EMAIL,
    password: E2E_PASSWORD,
    email_confirm: true,
  });
  if (!error) return data.user.id;
  // Ya existe (el CLI de supabase devuelve email_exists / 422): buscarlo.
  const existente = await buscarUsuarioE2e();
  if (existente) return existente;
  throw new Error(`No se pudo crear ni encontrar el usuario e2e: ${error.message}`);
}

async function buscarUsuarioE2e(): Promise<string | null> {
  const cli = clienteAdmin();
  let page = 1;
  // listUsers pagina de a 50; el entorno local tiene pocos usuarios.
  for (;;) {
    const { data, error } = await cli.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`listUsers falló: ${error.message}`);
    const hit = data.users.find((u) => u.email === E2E_EMAIL);
    if (hit) return hit.id;
    if (data.users.length < 200) return null;
    page += 1;
  }
}

/** user_id del usuario e2e — para que cada spec siembre filas "como" ese usuario. */
export async function comoUsuario(): Promise<string> {
  return asegurarUsuarioE2e();
}
