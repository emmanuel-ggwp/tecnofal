-- TecnoFal — Migración 0010: generación de CPU por modelo + referencia Dell 4ta–11va gen
-- Permite valorar listings cuyo título no menciona i3/i5/i7: se asume la CPU del modelo
-- (peor caso: rangos mixtos → i5; modelos solo-i7 → i7) y se avisa confirmar el procesador.

alter table modelos add column if not exists cpu_gen int;

comment on column modelos.cpu_gen is 'Generación Intel típica del modelo — CPU asumida cuando el título no la menciona';

-- Referencia Dell (upgradeabilidad 2013–2021); upsert: actualiza si el modelo ya existe
insert into modelos (marca, modelo, cpu_tipo, cpu_gen, ram_soldada, regla_compra, motivo_regla, notas) values
  -- Latitude: 2×SODIMM + M.2 (+2.5" en 5000) — perfil ideal compra-mejora-venta
  ('Dell', 'Latitude E5450', 'i5', 5, 'no', 'normal', null, '2×SODIMM DDR3L máx 16GB; M.2 o 2.5"'),
  ('Dell', 'Latitude E5470', 'i5', 6, 'no', 'normal', null, '2×SODIMM DDR4 máx 32GB; M.2 + 2.5" (variante dGPU: 1 slot)'),
  ('Dell', 'Latitude E5570', 'i5', 6, 'no', 'normal', null, '2×SODIMM DDR4 máx 32GB oficial; M.2 + 2.5"'),
  ('Dell', 'Latitude E7440', 'i5', 4, 'no', 'normal', null, 'mSATA + 2.5" (una a la vez); DDR3L máx 16GB'),
  ('Dell', 'Latitude E7450', 'i5', 5, 'no', 'normal', null, 'mSATA + 2.5" (una a la vez, sin NVMe); DDR3L máx 16GB'),
  ('Dell', 'Latitude E7470', 'i5', 6, 'no', 'normal', null, '2×SODIMM DDR4; M.2 SATA+NVMe'),
  ('Dell', 'Latitude 5480', 'i5', 7, 'no', 'normal', null, '2×SODIMM máx 32GB; M.2 + 2.5" + slot WWAN usable'),
  ('Dell', 'Latitude 5490', 'i5', 8, 'no', 'normal', null, '2×SODIMM máx 32GB; M.2 + 2.5" + slot WWAN'),
  ('Dell', 'Latitude 5580', 'i5', 7, 'no', 'normal', null, '2×SODIMM máx 32GB; M.2 + 2.5"'),
  ('Dell', 'Latitude 5590', 'i5', 8, 'no', 'normal', null, '2×SODIMM máx 32GB; M.2 + 2.5"'),
  ('Dell', 'Latitude 7480', 'i5', 7, 'no', 'normal', null, '2×SODIMM; M.2 SATA+NVMe; sin bahía 2.5"'),
  ('Dell', 'Latitude 3410', 'i5', 10, 'no', 'normal', null, '2×SODIMM máx 32GB; M.2 + 2.5"'),
  ('Dell', 'Latitude 3510', 'i5', 10, 'no', 'normal', null, '2×SODIMM máx 32GB; M.2 + 2.5"'),
  ('Dell', 'Latitude 3500', 'i5', 8, 'no', 'normal', null, '2×SODIMM máx 32GB; M.2 + 2.5"'),
  -- Inspiron: 5000/7000 bien; 3000 verificar config
  ('Dell', 'Inspiron 3541', 'i5', 5, 'no', 'condicional', '1 slot RAM y sin M.2 (solo 2.5" SATA) — verificar config', null),
  ('Dell', 'Inspiron 3542', 'i5', 5, 'no', 'condicional', '1 slot RAM y sin M.2 (solo 2.5" SATA) — verificar config', null),
  ('Dell', 'Inspiron 3543', 'i5', 5, 'no', 'condicional', '1 slot RAM y sin M.2 (solo 2.5" SATA) — verificar config', null),
  ('Dell', 'Inspiron 3567', 'i5', 7, 'no', 'condicional', 'Sin M.2 (solo 2.5" SATA)', null),
  ('Dell', 'Inspiron 3593', 'i5', 10, 'no', 'normal', null, '2×SODIMM; M.2 + 2.5"'),
  ('Dell', 'Inspiron 5570', 'i5', 8, 'no', 'normal', null, '2×SODIMM máx 32GB; M.2 + 2.5"'),
  ('Dell', 'Inspiron 5580', 'i5', 8, 'no', 'normal', null, '2×SODIMM máx 32GB; M.2 + 2.5"'),
  ('Dell', 'Inspiron 5593', 'i5', 10, 'no', 'normal', null, '2×SODIMM máx 32GB; M.2 + 2.5"'),
  ('Dell', 'Inspiron 7590', 'i5', 9, 'no', 'normal', null, '2×SODIMM; 2× M.2 PCIe; sin bahía 2.5"'),
  ('Dell', 'Inspiron 7501', 'i5', 10, 'parcial', 'condicional', '8GB soldados + 1 slot — máx 24GB', null),
  -- Vostro
  ('Dell', 'Vostro 3568', 'i5', 7, 'no', 'normal', null, '2×SODIMM; M.2 solo SATA + 2.5" (sin NVMe)'),
  ('Dell', 'Vostro 3500', 'i5', 11, 'no', 'normal', null, '2×SODIMM máx 32GB; M.2 NVMe + 2.5"'),
  ('Dell', 'Vostro 5590', 'i5', 10, 'no', 'normal', null, '2×SODIMM máx 32GB; M.2 + 2.5"'),
  -- XPS 13: TODAS con RAM soldada (solo SSD); el 9310 2-in-1 ni eso
  ('Dell', 'XPS 13 9343', 'i5', 5, 'total', 'normal', null, 'RAM soldada LPDDR3 máx 8GB; M.2 SATA removible'),
  ('Dell', 'XPS 13 9350', 'i5', 6, 'total', 'normal', null, 'RAM soldada máx 16GB; M.2 NVMe removible'),
  ('Dell', 'XPS 13 9360', 'i5', 7, 'total', 'normal', null, 'RAM soldada máx 16GB; M.2 NVMe removible'),
  ('Dell', 'XPS 13 9370', 'i5', 8, 'total', 'normal', null, 'RAM soldada máx 16GB; M.2 NVMe removible'),
  ('Dell', 'XPS 13 9380', 'i5', 8, 'total', 'normal', null, 'RAM soldada máx 16GB; M.2 NVMe removible'),
  ('Dell', 'XPS 13 9300', 'i5', 10, 'total', 'normal', null, 'RAM soldada LPDDR4x máx 32GB; M.2 removible'),
  ('Dell', 'XPS 13 9310', 'i5', 11, 'total', 'normal', null, 'RAM soldada; M.2 2230 removible'),
  ('Dell', 'XPS 13 9310 2-in-1', 'i5', 11, 'total', 'bloqueada', 'RAM y SSD soldados — sin upgrade posible', null),
  -- XPS 15/17: 2×SODIMM + M.2 — comprar
  ('Dell', 'XPS 15 9530', 'i7', 4, 'no', 'normal', null, '2×SODIMM DDR3L máx 16GB; solo mSATA (¡Dell reusó 9530 en 2023!)'),
  ('Dell', 'XPS 15 9550', 'i5', 6, 'no', 'normal', null, '2×SODIMM máx 32GB; M.2 + 2.5"; exigente con RAM (usar validada)'),
  ('Dell', 'XPS 15 9560', 'i5', 7, 'no', 'normal', null, '2×SODIMM máx 32GB; M.2 + 2.5"; exigente con RAM'),
  ('Dell', 'XPS 15 9570', 'i5', 8, 'no', 'normal', null, '2×SODIMM máx 32GB; M.2 + 2.5"; exigente con RAM'),
  ('Dell', 'XPS 15 9500', 'i5', 10, 'no', 'normal', null, '2×SODIMM máx 64GB; 2× M.2; sin bahía 2.5"'),
  ('Dell', 'XPS 15 9510', 'i5', 11, 'no', 'normal', null, '2×SODIMM máx 64GB; 2× M.2'),
  ('Dell', 'XPS 17 9700', 'i5', 10, 'no', 'normal', null, '2×SODIMM máx 64GB; 2× M.2'),
  -- Precision: workstations — el mejor perfil de reventa
  ('Dell', 'Precision M4800', 'i5', 4, 'no', 'normal', null, '2-4×SODIMM DDR3L; hasta 3 unidades (2.5" + caddy + mSATA)'),
  ('Dell', 'Precision M6800', 'i7', 4, 'no', 'normal', null, '4×SODIMM máx 32GB; 2× 2.5" + mSATA'),
  ('Dell', 'Precision 3510', 'i5', 6, 'no', 'normal', null, '2×SODIMM máx 32GB; M.2 + 2.5"'),
  ('Dell', 'Precision 3520', 'i5', 7, 'no', 'normal', null, '2×SODIMM máx 32GB; M.2 + 2.5" + WWAN'),
  ('Dell', 'Precision 3530', 'i5', 8, 'no', 'normal', null, '2×SODIMM máx 32GB; M.2 + 2.5"'),
  ('Dell', 'Precision 3540', 'i5', 8, 'no', 'normal', null, '2×SODIMM máx 32GB; M.2 + 2.5"'),
  ('Dell', 'Precision 5510', 'i5', 6, 'no', 'normal', null, '2×SODIMM máx 32GB; M.2 + 2.5"'),
  ('Dell', 'Precision 5520', 'i5', 7, 'no', 'normal', null, '2×SODIMM máx 32GB; M.2 + 2.5"'),
  ('Dell', 'Precision 5530', 'i5', 8, 'no', 'normal', null, '2×SODIMM máx 32GB; M.2 + 2.5"'),
  ('Dell', 'Precision 5540', 'i7', 9, 'no', 'normal', null, '2×SODIMM máx 64GB; 2× M.2 (2.5" solo con batería 56Wh)'),
  ('Dell', 'Precision 5550', 'i7', 10, 'no', 'normal', null, '2×SODIMM máx 64GB; 2× M.2; sin 2.5"'),
  ('Dell', 'Precision 7510', 'i5', 6, 'no', 'normal', null, '4×SODIMM máx 64GB; 2 unidades'),
  ('Dell', 'Precision 7520', 'i7', 7, 'no', 'normal', null, '4×SODIMM máx 64GB; 2 unidades'),
  ('Dell', 'Precision 7530', 'i5', 8, 'no', 'normal', null, '4×SODIMM máx 128GB; 3 unidades (hasta 6TB)'),
  ('Dell', 'Precision 7540', 'i7', 9, 'no', 'normal', null, '4×SODIMM máx 128GB; 2× M.2 + 2.5"'),
  ('Dell', 'Precision 7550', 'i7', 10, 'no', 'normal', null, '4×SODIMM máx 128GB; hasta 3 M.2 (6TB)'),
  ('Dell', 'Precision 7710', 'i7', 6, 'no', 'normal', null, '4×SODIMM máx 64GB; M.2 + 2.5"'),
  ('Dell', 'Precision 7720', 'i7', 7, 'no', 'normal', null, '4×SODIMM máx 64GB; 3 unidades')
on conflict (marca, modelo) do update set
  cpu_tipo = excluded.cpu_tipo,
  cpu_gen = excluded.cpu_gen,
  ram_soldada = excluded.ram_soldada,
  regla_compra = excluded.regla_compra,
  motivo_regla = excluded.motivo_regla,
  notas = coalesce(excluded.notas, modelos.notas);

-- Modelos ya sembrados en 0003 que ahora tienen CPU asumida
update modelos set cpu_tipo = 'i5', cpu_gen = 8  where marca = 'Dell' and modelo = 'Latitude 7490';
update modelos set cpu_tipo = 'i5', cpu_gen = 10 where marca = 'Dell' and modelo = 'Latitude 5510';
