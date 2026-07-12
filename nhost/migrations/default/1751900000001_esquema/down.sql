do $$
declare t text; v text; f text; ty text;
begin
  foreach v in array array['v_sugerencia_partes_completas','v_ventas_ganancia','v_resultado_cambiario','v_laptop_desviacion','v_laptop_costos','v_laptop_precio_sugerido','paquete_costos'] loop
    execute format('drop view if exists public.%I cascade', v);
  end loop;
  foreach t in array array['lote_partes_encontradas','orden_partes_items','ordenes_partes','listings','por_pagar','por_cobrar','tasas_dia','conversiones','movimientos','cuentas','ventas','compradores','lote_reparto','costo_lineas','paquete_items','laptop_partes','partes_especificas','partes_compras','partes_stock','partes_catalogo','laptop_detalles','laptop_condicion','laptops','paquetes','lotes','parametros','detalles_catalogo','ajustes_config','precios_ideales','modelos'] loop
    execute format('drop table if exists public.%I cascade', t);
  end loop;
  foreach f in array array['prorratear_paquete','congelar_reparto_lote','recibir_orden_partes','prorratear_orden_partes','ajuste','fn_partes_promedio'] loop
    execute format('drop function if exists public.%I cascade', f);
  end loop;
  foreach ty in array array['cpu_tipo_t','ram_soldada_t','regla_compra_t','laptop_estado_t','paquete_metodo_t','paquete_estado_t','paquete_item_tipo_t','costo_ambito_t','costo_tipo_t','origen_compra_t','moneda_t','venta_estado_t','mov_tipo_t','mov_categoria_t','semaforo_t','listing_estado_t','detalle_categoria_t','pantalla_cond_t','cond_t','parte_origen_t','tasa_tipo_t','deuda_estado_t'] loop
    execute format('drop type if exists public.%I cascade', ty);
  end loop;
end $$;
