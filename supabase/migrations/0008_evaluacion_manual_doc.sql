-- TecnoFal — Migración 0008: documentar las claves nuevas del JSON evaluacion_manual
-- (sin cambio de esquema: motivoDescarte y bloqueosDescartados viven dentro del jsonb)

comment on column listings.evaluacion_manual is
  'JSON: entrada, faltantes[{cantidad}], deducciones[{cantidad}], bloqueosDescartados[], motivoDescarte (motivo del descarte por publicación; clave legada: bloqueoManual) — detalle completo de la evaluación';
