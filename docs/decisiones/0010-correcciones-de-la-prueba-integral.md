# 0010 · Correcciones de la prueba integral que no se habían cerrado

- **Estado:** Aceptada
- **Fecha:** 15/11/2026
- **Código:** `src/reservas/`, `src/inscripcion/`, `src/eventos/`, `src/reportes/`, `src/socios/`, `src/usuarios/`, `prisma/seed.demo.ts` · frontend `src/lib/utils/cn.ts`, `src/features/eventos/`, `src/features/reportes/`, `src/features/documentacion/`, `src/features/socios/`, `src/features/usuarios/`, `src/features/portal-socio/`

## Contexto

La prueba integral del 11/11 dejó hallazgos que seguían abiertos después de
TASK-60 y del padrón demo. US-65 y US-66 (cancelar y evaluar una solicitud de
inscripción) entraron a `dev` el 16/11/2026. Esta tanda cierra correcciones
que no dependen de eso. El detalle de cada hallazgo está en
`docs/pruebas/evidencias/prueba-integral-2026-11-11/README.md`.

## Decisión

### 1. No se aprueba una reserva cuyo turno ya empezó (H04)

`ReservasService.aprobar` rechaza con «El turno seleccionado ya pasó», el
mismo mensaje que ya usa quien pide el turno. El plazo de la seña es el menor
entre las horas configuradas (`RESERVAS_HORAS_LIMITE_SENA`, 48 por defecto) y
el inicio del turno: no puede vencer después de que el turno empiece.

### 2. El delegado ve solo sus disciplinas (H07)

`GET /inscripcion` recibe al usuario. Si es `DELEGADO` y no es `ADMIN` ni
`COLABORADOR`, el listado queda en las disciplinas de `delegado_disciplinas`.
Sin ninguna asignada, no ve participantes. En la fila solo aparecen esas
disciplinas, aunque la persona juegue otra. Quien es delegado y socio (Diego,
Laura) entra por esta regla. Admin y colaborador siguen viendo el padrón.

**Ampliado en DT-61 (16/11/2026):** el estado documental de la fila, el filtro
de pendientes de aprobación y las pestañas Inscriptos y Baja también miran solo
sus disciplinas. Las consultas por id de una inscripción ajena responden 403.

### 3. «Menor precio» es un orden válido

El portal mandaba `ordenar=precio` y el `ValidationPipe` lo rechazaba. El
query acepta `precio` y ordena por `precio` ascendente, con paginación en la
base. `fecha` sigue significando «vigentes primero» (decisión 0007).

### 4. El estado financiero suma entradas y señas (H08)

Sin filtro de disciplina, `GET /reportes/estado-financiero` suma al
recaudado las compras de entradas `APROBADA` y las señas de reservas
`CONFIRMADA` cuyo cobro cae en los meses del rango, en hora del club. No son
deuda: adeudado y morosos siguen siendo solo cuotas. Aparecen como conceptos
`ENTRADAS` y `RESERVAS`. Con `disciplinaId`, el reporte sigue siendo solo la
cuota deportiva de esa disciplina.

**Ajustado en DT-63 (16/11/2026):** el porcentaje de cobranza mide solo cuotas,
la caja de cuotas usa el huso del club y una entrada online cuenta el día en
que la pasarela aprobó el pago.

### 5. El color que llega después gana

`cn()` usa `tailwind-merge`. Una clase de color pasada al botón deja de
perder contra la variante. «Dar de baja» y el resto de los botones que
pintaban de rojo o verde y se veían grises quedan con el color de la acción.

### 6. La bandeja de revisión muestra el nombre del documento

«Documentación para revisar» imprimía `tipo`. En el padrón ese texto libre
quedó con el enum (`CERTIFICADO_MEDICO_APTITUD_FISICA`). Las alertas ya
muestran la etiqueta. La bandeja usa `etiquetaTipoDocumento(tipoDocumento)`
cuando el documento tiene tipo de catálogo. El seed guarda esa misma etiqueta
y, si vuelve a correr, corrige las filas que todavía tienen el enum sin tocar
la revisión.

### 7. Lo exigido al inscribirse se exige (H13)

Un requisito con plazo 0 hay que presentarlo para poder inscribir. El alta del
club y la solicitud desde Mi club se rechazan con «Para inscribir hay que
presentar …» si no hay un documento aprobado y vigente de ese tipo, ni se
adjunta en la misma operación. Quien ya está inscripto sin ese documento queda
bloqueado el mismo día. Un plazo mayor sigue dejando la inscripción pendiente
hasta esa fecha. El grupo deja de llamarse «Documentación opcional»: es «Con
plazo para presentar». US-65 adjunta el archivo después de crear la solicitud:
con plazo 0, la solicitud no se abre si ese documento no está aprobado de antes.
Eso deja sin solicitud online a los menores de las categorías que exigen la
autorización de padres o tutores: está pendiente en DT-60.

### 8. Cambiar el email vuelve a verificarlo (DT-59)

Si el email guardado cambia, en el perfil o en la grilla, `emailVerificadoEn`
vuelve a vacío y se manda un enlace a la dirección nueva. El enlace solo
confirma el email. Hasta usarlo, un ingreso nuevo se rechaza con el mensaje
de siempre. La sesión abierta sigue y la contraseña no cambia. Si el email
queda igual, no se pide de nuevo. En el perfil, «Repetí el email» aparece
solo cuando la dirección cambia.

## Alternativas

- **Renombrar el estado financiero a «recaudación de cuotas»** y no sumar
  entradas ni señas. El hallazgo pedía que el reporte del club muestre lo que
  entra. Se suman como recaudación, no como deuda.
- **Que el delegado no vea la fila si la persona también juega otra
  disciplina.** Se descartó: si juega una disciplina a su cargo, la ve. Lo
  que no ve es la disciplina ajena.
- **Sacar «Menor precio» del portal** en vez de aceptarlo en la API. El
  control ya está en la pantalla y el orden es una columna real.

## Consecuencias

- Aprobar un turno vencido deja de bloquear la agenda y de fijar una seña
  para después del turno.
- Un delegado deja de ver participantes de disciplinas que no tiene a cargo.
- El filtro de precio del portal deja de responder 400.
- Después de una venta de entradas, el estado financiero la muestra. La
  asistencia a eventos ya la mostraba.
- Cualquier `className` de Tailwind que pise a otro, en todo el front, se
  resuelve a favor del último.
- En la bandeja de revisión el certificado se lee «Certificado médico de
  aptitud física», igual que en las alertas.
- Si alguien cambia el email, tiene que confirmarlo otra vez. Hasta entonces
  no puede volver a entrar. La sesión que ya tenía abierta no se corta.
