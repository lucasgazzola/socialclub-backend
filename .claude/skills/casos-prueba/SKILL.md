---
name: casos-prueba
description: >-
  Genera casos de prueba para una Historia de Usuario en el formato EXACTO de la
  planilla del equipo (Plan de testing del producto). Usalo cuando haya que
  documentar los casos de una US — recibís la US (título + criterios de
  aceptación) y devolvés las filas listas para pegar en la hoja "Casos de Prueba".
---

# Skill: casos-prueba (Equipo Nullpointer)

Objetivo: producir casos de prueba **calcados al estándar del equipo**, anclados
al **comportamiento real del código**, no inventados.

## Fuentes de verdad (leer antes de generar)
- Plantilla y convenciones: `docs/documentacion/desarrollo-del-producto/01 ... Plan de testing del producto ...` (§4.1 Plantilla de Casos de Prueba).
- Definition of Done y flujo: `docs/documentacion/gestion-del-proyecto/03 ... Ciclo de vida ...`.
- El **código** del repo correspondiente: endpoints, validaciones de DTO, roles (`@Roles`), mensajes de error y auditoría. Los casos deben reflejar lo que el sistema hace de verdad (mensajes en español tal cual, roles reales, códigos HTTP reales).

## Entrada
La US a cubrir: **título + criterios de aceptación**. Si el usuario no los pega,
pedírselos o leerlos del issue de GitHub de esa US. Confirmar en qué repo vive la
funcionalidad (back/front) para revisar el código real.

## Columnas de salida (EXACTAS, en este orden)
`ID Caso` · `US asociada` · `Objetivo` · `Precondición` · `Datos de entrada` · `Pasos` · `Resultado Esperado` · `Prioridad` · `Tipo` · `Ejecutor`

> Verificado contra la planilla real (hoja **Casos de Prueba**, encabezados en la
> fila 2). Son **10 columnas**: no olvidar `Ejecutor`.

- **Prioridad**: `Alta` | `Media` | `Baja`.
- **Tipo** — solo estos cuatro valores, que son los que usa la planilla:
  `Unitario` | `Funcional` | `Integración` | `No funcional`.
  (Ojo: **no** existen "Unitaria", "Integral", "Regresión" ni "Aceptación".)
- **Pasos**: numerados y separados por **salto de línea real** dentro de la
  celda (`1. Abrir formulario\n2. Completar datos\n3. Guardar`), como están
  cargados hoy. No unirlos con ` / `.
- **Ejecutor**: nombre del integrante, formato `Apellido Nombre`
  (p. ej. `Gazzola Lucas`).

## Formato de entrega (por defecto)
Un archivo **CSV con todas las celdas entre comillas** (`QUOTE_ALL`) y BOM
(`utf-8-sig`), en `docs/exportables/casos-prueba-<US>.csv`, con las 10 columnas
y una fila por caso. Ese CSV es el dump (saltos reales en `Pasos`). **Para
pegar en Drive** hay un TSV aparte (`casos-prueba-para-pegar.tsv`): una fila =
una fila, pasos unidos con ` / `. No pegar el CSV ni un TSV con saltos de
línea dentro de la celda.

## De dónde sale el próximo `ID Caso`
**No numerar a mano.** Los `TC-XXX` los asigna únicamente `/exportar-casos`
(`scripts/exportar-casos.mjs`), que lee el máximo de la planilla `.xlsx` y de
`docs/exportables/*.csv`.

- Planilla: `docs/documentacion/desarrollo-del-producto/01 ... Plan de testing del producto ... .xlsx`
- Dump versionado: `docs/exportables/casos-prueba.csv` (`TC-001` a `TC-107`). El próximo ID libre es **`TC-108`**.
- Para pegar en Drive: `docs/exportables/casos-prueba-para-pegar.tsv` (desde A2). No pegar el CSV.

El `.xlsx` es un ZIP de XML y se puede leer con `python3 scripts/ids-planilla.py`
(sin instalar nada). Si ese script reporta duplicados, **no asignar IDs nuevos**
hasta resolverlo.

## Qué cubrir (marco, adaptar a la US)
- **Camino feliz** (Funcional/Aceptación, Prioridad Alta).
- **Validaciones y rechazos** (campos obligatorios, formatos, duplicados) → mensaje y código HTTP reales (Unitaria/Funcional).
- **Permisos por rol** — si el endpoint tiene `@Roles`, un caso de acceso denegado (Funcional/No funcional·seguridad).
- **Integración** entre capas o con otra US (Integral).
- **Regresión** si toca algo ya construido.
- Mantener el set **acotado** (no exhaustivo) salvo que pidan más. Prioridad según impacto.

## Reglas
- **No inventar comportamiento**: verificar contra el código (endpoint, DTO, guard, servicio, mensaje). Si algo no está implementado, marcarlo, no asumirlo.
- Textos en **español** (idioma del producto).
- No duplicar casos que ya existan en la planilla para esa US.
- Un caso = un objetivo claro y verificable.

## Mini-ejemplo (US-31, referencia de estilo)
```
US asociada	Objetivo	Precondición	Datos de entrada	Pasos	Resultado Esperado	Prioridad	Tipo
US-31	Validar el acceso con una entrada válida	Operador (ADMIN/COLABORADOR) logueado; entrada en estado VALIDA	Token del QR de una entrada VALIDA	1. Abrir Validar acceso / 2. Escanear el QR	El sistema permite el acceso y marca la entrada como USADA	Alta	Funcional
US-31	Rechazar una entrada ya utilizada	Existe una entrada en estado USADA	Token de una entrada USADA	1. Escanear el QR de una entrada ya usada	El sistema rechaza el acceso e informa que la entrada ya fue utilizada	Alta	Funcional
US-31	Impedir el acceso al endpoint sin rol autorizado	Usuario sin rol ADMIN/COLABORADOR	Petición a POST /entradas/validar	1. Llamar al endpoint con un usuario SOCIO	El sistema responde 403 (sin permisos)	Media	No funcional
```
