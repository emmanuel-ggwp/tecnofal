drop function if exists fn_set_user_id() cascade; -- elimina también los triggers trg_user_id
-- las políticas caen con las tablas; para revertir solo RLS:
-- alter table <t> disable row level security; drop policy usuario_propio on <t>;
