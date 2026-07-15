import { describe, expect, it } from 'vitest';
import { avisosDeVendedor } from './vendedor.js';

describe('avisosDeVendedor', () => {
  it('menos de 15 ventas → advierte; sin dato → sin aviso', () => {
    expect(avisosDeVendedor({ vendedorTotalVentas: 8 })).toEqual([
      { texto: 'Menos de 15 ventas (8)', tipo: 'advierte' },
    ]);
    expect(avisosDeVendedor({ vendedorTotalVentas: 15 })).toEqual([]);
    expect(avisosDeVendedor({})).toEqual([]);
  });

  it('% positivo debajo de 80 → bloquea; en o sobre 80 → sin aviso', () => {
    expect(avisosDeVendedor({ vendedorPctPositivo: 65 })).toEqual([
      { texto: '65% positivo — debajo de 80%', tipo: 'bloquea' },
    ]);
    expect(avisosDeVendedor({ vendedorPctPositivo: 80 })).toEqual([]);
    expect(avisosDeVendedor({ vendedorPctPositivo: 100 })).toEqual([]);
  });

  it('menos de 5 ofertas → positivo (aunque suene contraintuitivo, poca competencia es bueno)', () => {
    expect(avisosDeVendedor({ cantidadOfertas: 0 })).toEqual([
      { texto: 'Solo 0 ofertas — poca competencia', tipo: 'positivo' },
    ]);
    expect(avisosDeVendedor({ cantidadOfertas: 1 })).toEqual([
      { texto: 'Solo 1 oferta — poca competencia', tipo: 'positivo' },
    ]);
    expect(avisosDeVendedor({ cantidadOfertas: 5 })).toEqual([]);
  });

  it('vendedor conocido (ya comprado antes) → positivo; normaliza trim+lowercase; vacío/ausente ⇒ sin aviso', () => {
    expect(avisosDeVendedor({ vendedor: 'sam-74545', vendedoresConocidos: ['sam-74545'] })).toEqual([
      { texto: 'Ya le has comprado antes', tipo: 'positivo' },
    ]);
    expect(avisosDeVendedor({ vendedor: 'Sam-74545 ', vendedoresConocidos: ['sam-74545'] })).toEqual([
      { texto: 'Ya le has comprado antes', tipo: 'positivo' },
    ]);
    expect(avisosDeVendedor({ vendedor: 'otro', vendedoresConocidos: ['sam-74545'] })).toEqual([]);
    expect(avisosDeVendedor({ vendedor: 'sam-74545', vendedoresConocidos: [] })).toEqual([]);
    expect(avisosDeVendedor({ vendedor: 'sam-74545' })).toEqual([]);
    expect(avisosDeVendedor({ vendedoresConocidos: ['sam-74545'] })).toEqual([]);
  });

  it('vendedor muestra % de batería → positivo; normaliza trim+lowercase; vacío/ausente ⇒ sin aviso', () => {
    expect(avisosDeVendedor({ vendedor: 'sam-74545', vendedoresBateria: ['sam-74545'] })).toEqual([
      { texto: 'Indica el % de batería en sus publicaciones', tipo: 'positivo' },
    ]);
    expect(avisosDeVendedor({ vendedor: 'Sam-74545 ', vendedoresBateria: ['sam-74545'] })).toEqual([
      { texto: 'Indica el % de batería en sus publicaciones', tipo: 'positivo' },
    ]);
    expect(avisosDeVendedor({ vendedor: 'otro', vendedoresBateria: ['sam-74545'] })).toEqual([]);
    expect(avisosDeVendedor({ vendedor: 'sam-74545', vendedoresBateria: [] })).toEqual([]);
    expect(avisosDeVendedor({ vendedor: 'sam-74545' })).toEqual([]);
  });

  it('combina varias condiciones a la vez, en el orden esperado', () => {
    const avisos = avisosDeVendedor({
      vendedor: 'sam-74545',
      vendedorTotalVentas: 5,
      vendedorPctPositivo: 60,
      cantidadOfertas: 2,
      vendedoresConocidos: ['sam-74545'],
      vendedoresBateria: ['sam-74545'],
    });
    expect(avisos).toEqual([
      { texto: 'Menos de 15 ventas (5)', tipo: 'advierte' },
      { texto: '60% positivo — debajo de 80%', tipo: 'bloquea' },
      { texto: 'Solo 2 ofertas — poca competencia', tipo: 'positivo' },
      { texto: 'Ya le has comprado antes', tipo: 'positivo' },
      { texto: 'Indica el % de batería en sus publicaciones', tipo: 'positivo' },
    ]);
  });
});
