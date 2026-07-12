// Selección de proveedor por variable de entorno (§21). Cambiar de Nhost a Supabase
// = cambiar 2 env vars y recompilar; la lógica de negocio no se toca.
import { ProveedorNhost } from '@tecnofal/provider-nhost';
import { ProveedorSupabase } from '@tecnofal/provider-supabase';
import type { AlmacenKV, Proveedor } from '@tecnofal/core';

export function crearProveedor(almacen: AlmacenKV): { proveedor: Proveedor | null; nombre: string } {
  const tipo = ((import.meta.env.VITE_PROVIDER as string | undefined) ?? 'nhost').toLowerCase();
  if (tipo === 'supabase') {
    const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
    const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
    return { proveedor: url && key ? new ProveedorSupabase(url, key, almacen) : null, nombre: tipo };
  }
  const sub = import.meta.env.VITE_NHOST_SUBDOMAIN as string | undefined;
  const region = (import.meta.env.VITE_NHOST_REGION as string | undefined) ?? 'us-east-1';
  return { proveedor: sub ? new ProveedorNhost(sub, region, almacen) : null, nombre: tipo };
}
