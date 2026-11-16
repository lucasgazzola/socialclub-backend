---
name: backlog
description: >-
  Lee el Product Backlog del equipo directo desde Google Drive (planilla «Sprint 0»):
  historias con descripción, criterios de aceptación, SP, sprint, estado y encargado.
  Usalo para revisar o corregir criterios, preparar casos de prueba o planificar un
  sprint sin pedirle al usuario que pegue el Excel. Requiere el conector de Google
  Drive; si no está, usa la copia local o pide los datos.
---

# Skill: backlog (Equipo Nullpointer)

Objetivo: tener el backlog **actualizado** a mano sin que nadie lo descargue ni lo pegue.
Las planillas y sus IDs de Drive están en `docs/README.md` § *Planillas en Drive*.

## Pasos

1. **Bajar el backlog de Drive** (si la sesión tiene el conector de Google Drive):
   - `download_file_content` con el ID del backlog (ver `docs/README.md`).
   - La respuesta es grande y queda guardada en un archivo JSON: convertirla con
     `python3 scripts/drive-a-xlsx.py <archivo-guardado> <scratchpad>/backlog.xlsx`.
   - Si el ID ya no existe (alguien subió otro archivo), buscarlo con `search_files`
     por título (`Sprint 0`) y avisar que hay que actualizar el ID en `docs/README.md`.
2. **Leerlo:**
   ```bash
   python3 scripts/leer-backlog.py --xlsx <scratchpad>/backlog.xlsx --us 26 44   # detalle y criterios
   python3 scripts/leer-backlog.py --xlsx <...> --sprint 5                       # un sprint
   python3 scripts/leer-backlog.py --xlsx <...> --encargado Gazzola              # de un integrante
   python3 scripts/leer-backlog.py --xlsx <...> --us 26 --csv                    # para editar y pegar
   ```
3. **Si no hay conector de Drive:** correr el mismo script sin `--xlsx` (usa la
   copia local de `docs/documentacion/desarrollo-del-producto/`, si existe; avisar
   que puede estar desactualizada) o pedirle al usuario las historias. **Nunca
   fallar por no tener Drive.**

## Al corregir criterios de aceptación
- Contrastar cada criterio con el código real (endpoint, validaciones, mensajes).
- Devolver los criterios corregidos **listos para pegar** en la celda de la planilla
  (un párrafo, una oración por criterio) y, aparte, qué cambió y por qué.
- No escribir en Drive: el usuario los pega.

## Reglas
- El backlog de Drive es la fuente de verdad; el issue de GitHub es secundario.
- Si el estado de una US en la planilla no coincide con lo mergeado en `dev`
  (p. ej. figura «To Do» y ya está implementada), avisarlo.
