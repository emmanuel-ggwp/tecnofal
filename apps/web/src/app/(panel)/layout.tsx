'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { getSession, onAuthStateChange, signOut } from '@/data/auth';
import { ConversionRapida } from './cuentas/ConversionRapida';

const RUTAS: { href: string; nombre: string }[] = [
  { href: '/', nombre: 'Dashboard' },
  { href: '/inventario', nombre: 'Inventario' },
  { href: '/calculadora', nombre: 'Calculadora' },
  { href: '/lotes', nombre: 'Lotes' },
  { href: '/partes', nombre: 'Partes' },
  { href: '/ventas', nombre: 'Ventas' },
  { href: '/cuentas', nombre: 'Cuentas' },
  { href: '/configuracion', nombre: 'Configuración' },
];

/** Layout del panel: guardia de sesión + sidebar + header. Sin sesión → /login. */
export default function PanelLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [email, setEmail] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    let vivo = true;
    void getSession().then((s) => {
      if (!vivo) return;
      if (!s) {
        router.replace('/login');
      } else {
        setEmail(s.email);
        setCargando(false);
      }
    });
    const off = onAuthStateChange((s) => {
      if (!vivo) return;
      if (!s) router.replace('/login');
      else setEmail(s.email);
    });
    return () => {
      vivo = false;
      off();
    };
  }, [router]);

  const salir = async () => {
    await signOut();
    router.replace('/login');
  };

  if (cargando) {
    return <p className="p-8 text-sm text-slate-400">Cargando…</p>;
  }

  return (
    <div className="flex min-h-screen">
      <aside className="w-52 shrink-0 border-r border-slate-200 bg-white" aria-label="Navegación principal">
        <div className="border-b border-slate-200 p-4 text-lg font-bold">TecnoFal</div>
        <nav className="p-2">
          <ul className="space-y-1">
            {RUTAS.map((r) => (
              <li key={r.href}>
                <Link
                  href={r.href}
                  aria-current={pathname === r.href ? 'page' : undefined}
                  className={`block rounded-md px-3 py-2 text-sm hover:bg-slate-100 ${
                    pathname === r.href ? 'bg-slate-100 font-semibold' : 'text-slate-700'
                  }`}
                >
                  {r.nombre}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-2">
          <input
            type="search"
            placeholder="Buscar por alias…"
            aria-label="Búsqueda global por alias"
            className="w-64 rounded-md border border-slate-300 px-3 py-1.5 text-sm"
          />
          <button
            type="button"
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium hover:bg-slate-100"
            onClick={() => window.dispatchEvent(new CustomEvent('tecnofal:conversion-rapida'))}
          >
            ＋ Conversión
          </button>
          <div className="ml-auto flex items-center gap-3">
            <span data-testid="usuario-email" className="text-sm text-slate-500">
              {email}
            </span>
            <button
              type="button"
              data-testid="logout"
              onClick={() => void salir()}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-100"
            >
              Salir
            </button>
          </div>
        </header>
        <main className="flex-1 p-6">{children}</main>
      </div>
      <ConversionRapida />
    </div>
  );
}
