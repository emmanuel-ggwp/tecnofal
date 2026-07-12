'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSession, signIn } from '@/data/auth';
import { Boton } from '@/ui/Boton';
import { Campo } from '@/ui/Campo';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    // Con sesión activa, /login redirige al dashboard.
    void getSession().then((s) => {
      if (s) router.replace('/');
    });
  }, [router]);

  const entrar = async (e: React.FormEvent) => {
    e.preventDefault();
    setOcupado(true);
    setError(null);
    const msg = await signIn(email, password);
    if (msg) {
      setError(msg);
      setOcupado(false);
    } else {
      router.replace('/');
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <form
        onSubmit={(e) => void entrar(e)}
        className="w-full max-w-sm space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        <h1 className="text-xl font-bold">TecnoFal</h1>
        <p className="text-sm text-slate-500">Inicia sesión para continuar</p>
        <Campo
          label="Correo"
          type="email"
          name="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <Campo
          label="Contraseña"
          type="password"
          name="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error && (
          <p role="alert" data-testid="login-error" className="text-sm font-medium text-red-600">
            {error}
          </p>
        )}
        <Boton type="submit" disabled={ocupado} className="w-full">
          {ocupado ? 'Entrando…' : 'Entrar'}
        </Boton>
      </form>
    </main>
  );
}
