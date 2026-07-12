import { useEffect, useState } from 'react';

const CLAVE = 'tecnofal_secciones_ui';

export type SeccionColapsable = 'partesFaltantes' | 'detalles' | 'costos';

const DEFAULT: Record<SeccionColapsable, boolean> = {
  partesFaltantes: true,
  detalles: true,
  costos: true,
};

// Recuerda qué secciones del panel dejó abiertas/cerradas el usuario, entre listings distintos.
export function useSeccionesPersistidas() {
  const [abiertas, setAbiertas] = useState(DEFAULT);

  useEffect(() => {
    chrome.storage.local.get(CLAVE).then((r) => {
      const guardado = r[CLAVE] as Partial<Record<SeccionColapsable, boolean>> | undefined;
      if (guardado) setAbiertas((prev) => ({ ...prev, ...guardado }));
    });
  }, []);

  const toggle = (s: SeccionColapsable) => {
    setAbiertas((prev) => {
      const next = { ...prev, [s]: !prev[s] };
      void chrome.storage.local.set({ [CLAVE]: next });
      return next;
    });
  };

  return { abiertas, toggle };
}
