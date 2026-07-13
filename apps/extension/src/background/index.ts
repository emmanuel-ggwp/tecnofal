// §22 LOCAL-FIRST: la UI lee/escribe SIEMPRE contra provider-local (IndexedDB).
// El backend remoto (Nhost/Supabase) es ESPEJO vía la capa de sync — nunca requisito.
import { ProveedorLocal } from '@tecnofal/provider-local';
import { evaluarListado } from '../lib/eval';
import { crearProveedor } from '../proveedor';
import type { Solicitud, SyncEstado } from '../lib/mensajes';

const almacen = {
  getItem: async (k: string) => ((await chrome.storage.local.get(k))[k] as string | undefined) ?? null,
  setItem: async (k: string, v: string) => chrome.storage.local.set({ [k]: v }),
  removeItem: async (k: string) => chrome.storage.local.remove(k),
};

const local = new ProveedorLocal();
const { proveedor: remoto, nombre: nombreEspejo } = crearProveedor(almacen);

let ultimoSync: number | null = null;

// ---------- Capa de sync (§22): push de pendientes + pull de config; fallo = reintento silencioso ----------
async function sincronizar(): Promise<void> {
  if (!remoto) return;
  try {
    const ses = await remoto.getSession();
    if (!ses.email) return; // sin sesión → seguimos solo-local

    for (const l of await local.listingsSucios()) {
      try {
        await remoto.guardarListing(l.datos);
        await local.marcarListingLimpio(l.ebayItemId);
      } catch (e) { console.error('[sync] listing', l.ebayItemId, e); /* reintento en el próximo ciclo */ }
    }
    for (const c of await local.comprasPendientes()) {
      try {
        const r = await remoto.comprar(c.datos);
        await local.marcarCompraSincronizada(c.id, r.loteId);
      } catch (e) { console.error('[sync] compra', c.id, e); /* reintento */ }
    }
    // §23: push de tipos y avisos de modelo (globales/compartidos)
    const tiposS = await local.tiposSucios();
    const avisosS = await local.avisosSucios();
    if ((tiposS.length > 0 || avisosS.length > 0) && remoto.publicarAvisos) {
      try {
        await remoto.publicarAvisos(
          tiposS.map((t) => ({ clave: t.clave, nombre: t.nombre })),
          avisosS.map((a) => {
            const [marca, ...resto] = a.modeloId.split('|');
            return { marca, modelo: resto.join('|'), tipoClave: a.tipoClave, severidad: a.severidad, motivo: a.motivo };
          }),
        );
        for (const t of tiposS) await local.marcarTipoLimpio(t.clave);
        for (const a of avisosS) await local.marcarAvisoLimpio(a.id);
      } catch { /* reintento */ }
    }
    // push de config local → espejo (aditivo: solo upsert, jamás borra; salta secciones vacías).
    // Va ANTES del pull: al subir y limpiar el flag, el pull deja de estar bloqueado y reconcilia.
    if ((await local.configDirty()) && remoto.guardarConfig) {
      try {
        await remoto.guardarConfig(await local.cargarCatalogo());
        await local.marcarConfigLimpio();
      } catch (e) { console.error('[sync] config', e); /* queda dirty → reintento en el próximo ciclo */ }
    }

    // pull de config: LWW — pero la config editada localmente y los overrides NUNCA se pisan
    const cat = await remoto.cargarCatalogo();
    if (cat) await local.aplicarConfigRemota(cat);
    ultimoSync = Date.now();
  } catch (e) { console.error('[sync]', e); }
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create('tecnofal-sync', { periodInMinutes: 5 });
});
chrome.alarms.onAlarm.addListener((a) => {
  if (a.name === 'tecnofal-sync') void sincronizar();
});

// §23 EFECTO RETROACTIVO: re-evaluar TODOS los listings capturados del modelo/familia
async function reevaluarPorModelos(nombres: string[]): Promise<number> {
  const cat = await local.cargarCatalogo();
  let n = 0;
  for (const f of await local.todosListings()) {
    const titulo = f.datos.titulo ?? '';
    if (!nombres.some((m) => m && titulo.toLowerCase().includes(m.toLowerCase()))) continue;
    if (f.datos.precioVisto == null) continue;
    const ev = evaluarListado(titulo, f.datos.precioVisto, 0, cat);
    await local.guardarListing({
      ...f.datos,
      semaforo: ev.resultado.semaforo,
      specs: ev.specs,
      precioMaxPuja: ev.resultado.sMax,
      precioPujaDecente: ev.resultado.sDecente,
      costoEstimadoTotal: ev.resultado.cadena.total,
      valorEsperadoTotal: ev.resultado.valorEsperado,
    });
    n++;
  }
  return n;
}

async function estadoSync(): Promise<SyncEstado> {
  const pendientes = await local.pendientes();
  let modo: SyncEstado['modo'] = 'solo_local';
  if (remoto) {
    const ses = await remoto.getSession().catch(() => ({ email: null }));
    if (ses.email) modo = pendientes > 0 ? 'pendientes' : 'sincronizado';
  }
  return { modo, pendientes, ultimo: ultimoSync, espejo: remoto ? nombreEspejo : 'ninguno' };
}

// ---------- Router: la UI habla con LOCAL; remoto solo para auth/cuentas/conversiones ----------
async function manejar(msg: Solicitud): Promise<unknown> {
  switch (msg.tipo) {
    case 'catalogo': return local.cargarCatalogo();
    case 'listings:check': return local.checkListings(msg.ids);
    case 'listings:obtener': return local.obtenerListing(msg.id);
    case 'listings:guardar': {
      await local.guardarListing(msg.listing);
      void sincronizar();
      return { ok: true };
    }
    case 'comprar': {
      const r = await local.comprar(msg.datos);
      void sincronizar();
      return { ok: true, loteId: r.loteId };
    }

    case 'config:leer': return local.leerConfig();
    case 'config:parametro': {
      await local.guardarParametro(msg.clave, msg.valor);
      void sincronizar();
      return { ok: true };
    }
    case 'config:seccion': {
      await local.reemplazarSeccion(msg.seccion, msg.filas);
      void sincronizar();
      return { ok: true };
    }
    case 'config:exportar': return { json: await local.exportarJSON() };
    case 'config:importar': {
      await local.importarJSON(msg.json);
      void sincronizar();
      return { ok: true };
    }

    case 'detalle:crear': {
      await local.crearDetalle(msg.detalle);
      void sincronizar();
      return { ok: true };
    }
    case 'modelo:marcar': {
      await local.marcarModelo(msg.datos);
      const reevaluados = await reevaluarPorModelos(msg.datos.modelos);
      void sincronizar();
      return { ok: true, reevaluados };
    }
    case 'sync:estado': return estadoSync();
    case 'sync:ahora': {
      await sincronizar();
      return estadoSync();
    }

    case 'auth:estado': {
      if (!remoto) return { configurado: false, email: null };
      const s = await remoto.getSession();
      return { configurado: true, email: s.email };
    }
    case 'auth:login': {
      if (!remoto) throw new Error('Sin espejo configurado (.env): la extensión sigue funcionando 100% local');
      const s = await remoto.signIn(msg.email, msg.password);
      void sincronizar();
      return { configurado: true, email: s.email };
    }
    case 'auth:logout': {
      await remoto?.signOut();
      return { ok: true };
    }
    case 'cuentas:listar': return remoto ? remoto.listarCuentas().catch(() => []) : [];
    case 'conversion:registrar': {
      if (!remoto) throw new Error('Las conversiones requieren el espejo (Nhost) con sesión');
      const r = await remoto.registrarConversion(msg.datos);
      return { ok: true, tasaImplicita: r.tasaImplicita };
    }
  }
}

chrome.runtime.onMessage.addListener((msg: Solicitud, _sender, sendResponse) => {
  manejar(msg)
    .then(sendResponse)
    .catch((e: unknown) => sendResponse({ error: e instanceof Error ? e.message : String(e) }));
  return true; // respuesta asíncrona
});
