// Mismo contrato que provider-supabase: el catálogo que alimenta el pull jamás puede
// ser "vacío pero exitoso", y una escritura multi-paso aborta al primer error.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CompraDatos, ListingGuardar } from '@tecnofal/core';

let respuestas: { data?: unknown; error?: unknown }[] = [];
let peticiones: string[] = [];

vi.mock('@nhost/nhost-js', () => ({
  NhostClient: class {
    graphql = {
      request: async (doc: string) => {
        peticiones.push(doc);
        return respuestas.shift() ?? { data: null, error: [{ message: 'sin respuesta configurada' }] };
      },
    };
    auth = {
      client: { clientStorage: {}, clientStorageType: 'custom' },
      signIn: async () => ({ error: null }),
      signOut: async () => ({}),
      getSession: () => null,
      getUser: () => null,
      isAuthenticatedAsync: async () => false,
      onAuthStateChanged: () => () => {},
    };
  },
}));

const { ProveedorNhost } = await import('./index.js');

const almacen = { getItem: async () => null, setItem: async () => {}, removeItem: async () => {} };
const listing = (id: string): ListingGuardar => ({
  ebayItemId: id, url: 'u', titulo: 't', precioVisto: 100, semaforo: 'verde', specs: null,
  precioMaxPuja: 50, precioPujaDecente: 40, cantidadLaptops: 1,
  costoEstimadoTotal: 150, valorEsperadoTotal: 220, evaluacionManual: {}, estado: 'evaluado',
});
const compra = (): CompraDatos => ({
  listing: listing('777'), envioUsa: 10, cantidad: 1, metodo: 'barco', faltantes: [],
  modeloId: null, cpuTipo: 'i5', cpuGen: 8, ramGb: 8, ssdGb: 256, pantallaPulgadas: 14,
  pantallaTactil: false, valorEsperado: 220,
  cadena: { base: 110, conZinli: 110, conEbay: 117.7, extras: 0, seguro: 5.5, envioVzla: 12, revision: 5, total: 140.2 },
});

let p: InstanceType<typeof ProveedorNhost>;
beforeEach(() => {
  respuestas = []; peticiones = [];
  p = new ProveedorNhost('sub', 'us-east-1', almacen);
});

describe('provider-nhost: contrato de seguridad de datos', () => {
  it('error GraphQL (JWT vencido / columna inexistente) → catálogo null, nunca vacío-exitoso', async () => {
    respuestas = [{ data: null, error: [{ message: 'field "cpu_gen" not found' }] }];
    expect(await p.cargarCatalogo()).toBeNull();
  });

  it('comprar: si falla insert_lotes → throw sin insertar laptops ni líneas', async () => {
    respuestas = [{ data: null, error: [{ message: 'permission denied' }] }];
    await expect(p.comprar(compra())).rejects.toThrow(/permission/);
    expect(peticiones.filter((q) => q.includes('insert_laptops') || q.includes('insert_costo_lineas'))).toHaveLength(0);
  });

  it('guardarListing propaga el error (el sync NO debe marcarlo limpio)', async () => {
    respuestas = [{ data: null, error: [{ message: 'JWTExpired' }] }];
    await expect(p.guardarListing(listing('888'))).rejects.toThrow(/JWTExpired/);
  });
});
