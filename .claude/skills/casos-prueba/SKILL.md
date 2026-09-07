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
`ID Caso` · `US asociada` · `Objetivo` · `Precondición` · `Datos de entrada` · `Pasos` · `Resultado Esperado` · `Prioridad` · `Tipo`

- **Prioridad**: `Alta` | `Media` | `Baja`.
- **Tipo** (solo estos valores): `Unitaria` | `Integral` | `Funcional` | `Regresión` | `Aceptación` | `No funcional`.
- **Pasos**: numerados `1. ... 2. ...`. Para pegar en una sola celda, unir los pasos con ` / ` (una línea por caso).

## Formato de entrega (por defecto)
Bloque **TSV** (separado por tabs) **sin la columna `ID Caso`** (la planilla la
autonumera / se completa correlativa `TC-XXX` al pegar), con la fila de encabezados
y una fila por caso. Los pasos en una sola línea con ` / `. Ejemplo de encabezado:

```
US asociada	Objetivo	Precondición	Datos de entrada	Pasos	Resultado Esperado	Prioridad	Tipo
```

Si el usuario prefiere, ofrecer también: (a) con `ID Caso` correlativo, o (b)
apendear directamente al CSV `docs/.../Casos de Prueba.csv` respetando el quoting.

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
