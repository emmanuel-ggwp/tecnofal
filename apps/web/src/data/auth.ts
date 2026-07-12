// Repositorio de autenticación — email + password contra Supabase local.
import { clienteSupabase } from './cliente';

export interface SesionInfo {
  email: string | null;
}

/** Inicia sesión; devuelve mensaje de error legible o null si todo salió bien. */
export async function signIn(email: string, password: string): Promise<string | null> {
  const { error } = await clienteSupabase().auth.signInWithPassword({ email, password });
  if (!error) return null;
  if (error.message === 'Invalid login credentials') return 'Correo o contraseña incorrectos';
  return error.message;
}

export async function signOut(): Promise<void> {
  await clienteSupabase().auth.signOut();
}

/** Sesión actual (o null). */
export async function getSession(): Promise<SesionInfo | null> {
  const { data } = await clienteSupabase().auth.getSession();
  if (!data.session) return null;
  return { email: data.session.user.email ?? null };
}

/** Se suscribe a cambios de sesión; devuelve la función para desuscribirse. */
export function onAuthStateChange(cb: (sesion: SesionInfo | null) => void): () => void {
  const { data } = clienteSupabase().auth.onAuthStateChange((_evento, session) => {
    cb(session ? { email: session.user.email ?? null } : null);
  });
  return () => data.subscription.unsubscribe();
}
