delete from detalles_catalogo
  where nombre in ('Solo 4GB RAM', 'Solo 128GB SSD', 'Solo 128GB HDD', 'RAM soldada', 'SSD soldado');

update detalles_catalogo
  set categoria = 'Teclado'
  where nombre = 'Tecla(s) faltante(s)';

update detalles_catalogo
  set categoria = 'Carcasa'
  where nombre = 'Carcasa marcada';
