-- DT-25: la auditoría es inalterable también en la base (RF12 / RNF03).
-- AuditoriaService solo hace INSERT; estos triggers rechazan cualquier
-- UPDATE, DELETE o TRUNCATE sobre registros_auditoria, venga de donde venga
-- (otro módulo, un script o alguien con la credencial de la base).
--
-- Consecuencia buscada: un usuario con registros de auditoría no se puede
-- borrar físicamente (la FK pondría su responsableId en NULL, que es un
-- UPDATE). Los usuarios se dan de baja lógica.

CREATE OR REPLACE FUNCTION registros_auditoria_inalterable()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'La auditoría es inalterable: no se permite % sobre registros_auditoria', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$;

CREATE TRIGGER registros_auditoria_sin_update_ni_delete
  BEFORE UPDATE OR DELETE ON "registros_auditoria"
  FOR EACH ROW EXECUTE FUNCTION registros_auditoria_inalterable();

CREATE TRIGGER registros_auditoria_sin_truncate
  BEFORE TRUNCATE ON "registros_auditoria"
  FOR EACH STATEMENT EXECUTE FUNCTION registros_auditoria_inalterable();
