# Prueba integral · 11/11/2026

Recorrido manual con todos los roles en local (rama dev + DT-54), con pagos en el sandbox de Mercado Pago. Capturas `NN-*.jpeg` en esta carpeta.

**Resumen:** 1 crítico, 7 altos, 10 medios, 6 bajos.

> **Actualización 15/11/2026.** Este archivo es el registro de ese día: los hallazgos de abajo no se reescriben. Desde entonces se cerraron, en código: H01 (la entrada de otro evento ya no se marca usada), H02 (el precio de socio se muestra antes de pagar), H03 (el ausentismo no cuenta eventos que no terminaron), H05 en la puerta (no abre antes de tiempo, rechaza el evento cancelado y nombra el evento), H14 (después del login vuelve a la ruta pedida) y H18 (Mis entradas agrupa por evento y muestra el estado, DT-57). DT-54 está resuelta; el email que se cambia sin re-verificar quedó como DT-59. Espacios y solicitar reserva (US-55 a US-59) ya tienen pantalla. El 15/11 se cerraron también H04 (no se aprueba un turno vencido y la seña no pasa del inicio), H07 (el delegado ve solo sus disciplinas) y H08 (el estado financiero suma entradas y señas). El 16/11 se cerró H12 (DT-59): cambiar el email vuelve a pedir verificación. El mismo día entraron a `dev` US-65 (cancelar la solicitud y adjuntar documentación) y US-66 (evaluarla desde el panel).

## Hallazgos

| ID | Severidad | Área | Hallazgo | Dónde | Evidencia |
|---|---|---|---|---|---|
| H01 | Crítico | Validar QR | **Una entrada mostrada en la puerta equivocada queda «usada».** POST /entradas/validar recibe solo el token y marca la entrada USADA. Recién después el front compara el evento y muestra «Entrada de otro evento». La entrada de la Fiesta probada en el Stand-Up quedó USADA (entrada 655) y la auditoría dice «Acceso validado». Su dueño sería rechazado en la Fiesta por «ya utilizada». | Back: entradas.service validarAcceso recibe eventoId y rechaza antes del updateMany. Front: ValidarAccesoPage envía el evento. | 21, 39 |
| H02 | Alto | Entradas | **El precio mostrado al socio no incluye su descuento.** Fiesta de Fin de Año (10% socio): la pantalla y el modal de confirmación dicen $10.000 por 2 entradas; Mercado Pago cobra $9.000 (lo correcto). En una demo, el monto cambia entre una pantalla y otra. | Front: ComprarEntradasPage calcula total = cantidad × precio sin descuentoSocio. | 07, 08, 09 |
| H03 | Alto | Reportes | **El ausentismo cuenta eventos que todavía no ocurrieron.** Asistencia a eventos calcula ausentes = vendidas − validadas para todos los eventos. La Fiesta (20/12) suma 125 ausentes y el Interclubes 65; el ausentismo general da 38,6%. | Back: reportes.service (línea ~299) solo debería contar ausentes en eventos ya realizados. | 38 |
| H04 | Alto | Reservas | **Se puede aprobar una reserva cuyo turno ya pasó.** RES-SEED01 (turno 08/11) se aprobó el 11/11 con plazo de seña hasta el 13/11, posterior al turno. La superposición sí se detecta bien. | Back: reservas.service aprobar() debe rechazar turnos pasados y topear el límite de seña al inicio del turno. | 44, 45, 46 |
| H05 | Alto | Validar QR | **La validación no controla la fecha del evento ni muestra su nombre.** Se permitió el ingreso a un evento del 20/12 el 11/11. Al entrar por /eventos/:id/validar el título queda «Control de Acceso:» y el texto dice «para ""» o «evento seleccionado». El rechazo por otro evento no suma en «Rechazados» ni queda en el historial. | Back: validarAcceso controla que el evento esté en curso (con tolerancia). Front: cargar el evento por id. | 18, 19, 21 |
| H06 | Alto | Infraestructura | **GitHub Actions bloqueado: no corren tareas automáticas ni el despliegue.** Por el bloqueo de facturación de la cuenta, no corren el cierre de eventos, el vencimiento de señas y órdenes ni los avisos de documentación, y tampoco el CD a test. Por eso hay eventos PUBLICADOS con fecha pasada (Clínica de Natación 25/10) y señas vencidas sin cancelar. | Destrabar la cuenta (Education o soporte) antes de la presentación; o correr las tareas a mano desde «Tareas automáticas». | 11, 01 |
| H07 | Alto | Permisos | **El delegado ve todos los participantes, no solo los de sus disciplinas.** Diego (Fútbol Mayor, Fútbol Femenino, Natación) ve los 29 participantes, incluidos los de Hockey y Fútbol Prueba. Las alertas sí están filtradas. | Back: inscripcion.service findAll filtra por disciplinas del delegado (como en alertas, DT-42). | 50, 51 |
| H08 | Alto | Reportes | **El Estado financiero no incluye entradas ni señas de reservas.** Solo suma cuotas sociales y deportivas: la venta de entradas de hoy ($9.000) y las señas no aparecen. Para un «estado financiero» del club falta la mitad de los ingresos. | Back: reportes.service suma órdenes de pago aprobadas de ENTRADAS y RESERVA (o renombrar el reporte a «Recaudación de cuotas»). | 37 |
| H09 | Medio | Reportes | **Los totales de morosos no coinciden entre pantallas.** El reporte dice «Ver morosos de cuota social (27)» y la pantalla a la que lleva muestra 28: uno cuenta el período elegido y otra toda la deuda. Con datos de demo, la cobranza da 2,8%. | Aclarar en el link «27 en el período» o filtrar la pantalla de morosos por el mismo período. | 34, 37 |
| H10 | Medio | Cuotas | **Configurar la cuota del mes actual la corre al mes siguiente sin avisar.** Se pidió 11/2026 y se guardó 2026-12. Una tarifa futura figura «Inactivo» (sería «Programada»). Además se pueden editar tarifas históricas (2020-01), lo que puede alterar montos de períodos pasados. | Front/back: avisar el período efectivo, estado «Programada», bloquear la edición de tarifas pasadas. | 31, 32, 33 |
| H11 | Medio | Cuotas | **El cobro permite saltear las cuotas más viejas.** Se cobró 2026-10 dejando impagas 2026-08 y 2026-09. Puede estar bien, pero es una regla de negocio a definir (lo habitual es imputar a la deuda más antigua). | Definir la regla con el PO. | 35, 36 |
| H12 | Medio | DT-54 | **El socio cambia su email en «Mi perfil» sin verificarlo.** Las altas ahora piden el email dos veces y lo verifican, pero el socio puede cambiarlo en su perfil sin repetirlo ni verificar la dirección nueva. | Pedir confirmación y re-verificar. Desde el 15/11/2026 esto es DT-59. | 05 |
| H13 | Medio | Inscripción | **Documentación «exigida al inscribirse» que no se exige.** La ficha técnica de Gimnasio dice «Exigida al inscribirse», pero el alta pasa sin ella y le da plazo «hasta el 11/11/2026» (hoy). El certificado médico, que es obligatorio con 15 días de plazo, figura como «Documentación opcional». | Corregir rótulos: «Al inscribirse» y «Con plazo de N días»; decidir si la primera bloquea el alta. | 23, 24 |
| H14 | Medio | Navegación | **Después de loguearse no vuelve a la página que se quería ver.** Un invitado que toca «Comprar entradas» va al login y después al Inicio: pierde el evento que estaba comprando. | Front: guardar returnTo en ProtectedRoute y usarlo en LoginPage. | 03 |
| H15 | Medio | Inicio | **Los Inicio por rol no ayudan en la demo.** Socio: no muestra deuda, entradas ni reservas. Admin: 27 alertas rotuladas «próximos 10 días», la mayoría vencidas hace meses, con la misma persona repetida. Colaborador: tarjetas a Usuarios y Auditoría que terminan en «No tenés permisos». US-34 (dashboard con indicadores) sigue pendiente. | Rehacer el Inicio por rol (US-34). | 04, 17, 48, 49 |
| H16 | Medio | Responsive | **En el celular el menú lateral no se colapsa.** A 390 px el menú ocupa media pantalla y las tablas quedan inutilizables. | Front: menú en drawer debajo de ~768 px. | 51 |
| H17 | Medio | Reservas | **Mis reservas muestra avisos de seña vencida.** Aviso «Pagá la seña antes del 04/11» el 11/11, sin botón de pago. Las reservas pendientes no se pueden cancelar desde el socio. | Front: ocultar el aviso si venció; habilitar cancelar pendientes. | 11 |
| H18 | Medio | Entradas | **Mis entradas no escala.** Grilla de QR sin agrupar por evento ni compra, sin fecha, lugar ni estado (vigente/usada/vencida, DT-57). | Agrupar por evento con fecha y estado; QR al expandir. | 10 |
| H19 | Bajo | Inscripción | **El catálogo ofrece disciplinas en las que el socio no puede anotarse.** Básquet muestra «Solicitar inscripción» aunque ninguna categoría admite a la socia; recién lo dice el modal. | Mostrar «No cumplís los requisitos» en la tarjeta. | 13 |
| H20 | Bajo | Formularios | **Inconsistencias de formularios.** Alta de participante sin «Prefiero no decirlo» en Género. Filtros de fecha y período con el selector nativo del navegador en Eventos, Cuota social y Asistencia (el resto usa dd/mm/aaaa). «GENERO» sin tilde. Fecha de nacimiento con aspecto editable aunque está bloqueada. Hora «07:48 p. m.» en Mis solicitudes (el resto usa 24 h). «1 documentos obligatorios». Breadcrumb «Inscripcion». | Pasada de consistencia de UI. | 05, 12, 15, 23, 31, 01 |
| H21 | Bajo | Eventos | **Gestión de eventos con tarjetas grandes y edición de finalizados.** La vista de admin reutiliza las tarjetas del catálogo público (14 eventos = scroll largo; la preferencia del equipo es tabla). Deja editar eventos finalizados. En Nuevo evento, «entradas > capacidad» solo lo avisa un toast del backend y el mensaje de fin de venta queda cortado. | Tabla en gestión; bloquear edición de finalizados; validar en el campo. | 40, 41, 42 |
| H22 | Bajo | Validar QR | **Validar QR ofrece eventos finalizados.** La lista para escanear incluye eventos finalizados, tiene un filtro por «categoría» que no existe en el resto de eventos y el buscador no filtró al escribir. El menú resalta «Eventos» y el encabezado dice «SocialClub». | Mostrar solo eventos en curso o de hoy. | 18, 19 |
| H23 | Bajo | General | **Encabezado genérico y menú resaltado doble.** En Comprar entradas, Resultado del pago, Validar QR y Cuota social el encabezado superior dice «SocialClub». En Cobrar cuota deportiva se resaltan «Cuotas» y «Cobrar cuota deportiva» a la vez. | Título por ruta. | 07, 27, 31 |
| H24 | Bajo | Pagos | **Detalles del checkout y del cobro.** El ítem de entradas en Mercado Pago se llama «Productos». Los cobros por secretaría no piden confirmación ni generan comprobante. El historial deportivo dice «Categoría sin categoría» y no muestra el método de cobro. | Título del ítem; comprobante; datos del historial. | 08, 27, 29 |

## Datos a limpiar para la demo

- Disciplinas de prueba: «Administrador» (desc. «asd», restringida a No binario), «Algo», «Fútbol Prueba». Aparecen en el catálogo, en reportes y en filtros.
- «Jockey Femenino» debe ser «Hockey Femenino».
- Natación con arancel de $80/mes (recauda $80 en el reporte).
- Eventos de prueba «Prueba DT-33», «… integrada», «… acceso» (este último PUBLICADO con fecha pasada).
- Reservas RES-SEED* con fechas relativas al último seed: hoy tienen turnos pasados y señas vencidas. Re-sembrar con SEED_RESETEAR_RESERVAS=1 el día de la demo.
- Usuarios y personas creados en pruebas (Socia Prueba, Reg Publico, Prueba Verificacion, Demo Sofía/Valentina, Tomás Ibarra, Martina Quiroga, Carla Ferreyra).
- Cobranza 2,8% y ausentismo 38,6%: con estos datos los reportes se ven mal en la demo.

## Funcionalidad pendiente que se nota

| US | Qué | Cómo se nota |
|---|---|---|
| US-55 a US-58 | Espacios (crear, editar, eliminar, consultar) | No hay pantallas. Las reservas solo existen por el seed. |
| US-59 | Solicitar reserva de espacio | El socio no tiene cómo pedir una reserva. |
| US-65 | Cancelar solicitud de inscripción | «Mis solicitudes» no tiene acción. |
| US-66 | Evaluar solicitudes de inscripción | No hay pantalla de admin: la solicitud de Lucía queda pendiente para siempre. |
| US-34 | Dashboard | El Inicio no tiene indicadores (ver H15). |
| Cuota deportiva online | Pago de cuota deportiva por el socio | «Mis cuotas» solo muestra la cuota social; la deportiva no aparece para el socio. |

## Vistas a unificar o separar

- **Unificar: Cobrar cuota deportiva + Historial deportivo.** Son la misma pantalla (buscador por DNI y el mismo botón «Inscribir nuevo participante»). Una sola «Cuenta del participante» con pestañas Deuda / Pagos y la acción Cobrar.
- **Unificar: Hub «Cuotas» + 5 entradas sueltas del menú.** El hub tiene Cuota social, Cuota deportiva y Morosos social, pero Cobrar, Historial y Morosos deportiva están sueltos en el menú. Un hub con dos columnas (Social / Deportiva: tarifas, cobrar, historial, morosos) y una sola entrada «Cuotas» en el menú.
- **Unificar: Morosos social + Morosos deportiva + Estado financiero.** Los tres miden deuda con números que no coinciden. Un módulo «Cobranza» con filtro por concepto y período, y el estado financiero como resumen.
- **Unificar: Inicio y Mi perfil del socio.** El Inicio solo muestra categoría, fecha de alta y DNI, y un botón «Editar mis datos» que duplica «Mi perfil». El Inicio debería resumir deuda, próximas entradas y reservas.
- **Unificar: Validar QR (lista) + Eventos.** La lista de Validar QR repite el listado de eventos. Basta con un botón «Control de acceso» en cada evento de hoy.
- **Separar: Menú lateral del admin (24 entradas).** Mezcla «Mis cuotas / Mis entradas / Mis reservas…» (la cuenta personal) con la gestión del club. Mover lo personal a un menú «Mi cuenta» desde el avatar y agrupar gestión en Socios · Deportes · Eventos · Finanzas · Administración.
- **Separar: Mi perfil.** Junta datos personales, la baja como socio (acción destructiva) y seguridad. Pestañas Datos / Membresía / Seguridad.
- **Separar: Inicio del admin.** La tabla de 27 alertas ocupa el Inicio. Llevarla a una vista «Documentación» (o al listado de Participantes con filtro) y dejar en el Inicio un contador por estado.
- **Separar: Eventos: catálogo público vs gestión.** La misma vista de tarjetas sirve al público y a la gestión. Catálogo en tarjetas para socios/invitados; tabla para gestión (estado, vendidas, acciones).

## Lo que funcionó bien

- Pago de cuota social y compra de entradas con Mercado Pago (sandbox) de punta a punta: preferencia, pago aprobado, acreditación, entradas con QR.
- Descuento de socio aplicado correctamente en el backend ($9.000).
- Validación de QR: reingreso rechazado con aviso claro.
- Alta de participante con requisitos por categoría, cuota generada y carga de documentación con validación de archivo.
- Cobro de cuota deportiva y social por secretaría; el historial y morosos se actualizan al instante.
- Auditoría completa e inalterable: cada cobro, carga, inscripción y verificación quedó registrada con responsable.
- Detección de turnos superpuestos en reservas.
- Permisos por rol: el colaborador no entra a Usuarios; el delegado recibe solo las alertas de sus disciplinas.
- DT-54: alta con email repetido, cuenta pendiente y link de verificación (probado en la sesión anterior y otra vez hoy con un participante).
- Mi documentación del socio: clara, con estado por documento y motivo del bloqueo.

## Cobertura por US

| US | Historia | Estado | Nota |
|---|---|---|---|
| US-01..04 | Usuarios administrativos | Funciona | Alta con DT-54, grilla, permisos (sesión anterior y hoy) |
| US-05 | Registrar participante | Con hallazgos | H13, H20 |
| US-06 | Editar participante | No probada |  |
| US-07 | Baja de participante | No probada |  |
| US-08 | Consultar participantes | Con hallazgos | H07 (delegado ve todos) |
| US-09 | Registrarme como socio | No probada |  |
| US-10 | Pagar cuota como socio | Funciona | Mercado Pago aprobado y acreditado |
| US-11 | Editar datos personales | Con hallazgos | H12 |
| US-12..15 | Socios (alta, consulta) | Funciona | Alta con DT-54 probada; edición y baja no |
| US-16 | Configurar cuota social | Con hallazgos | H10 |
| US-17 | Registrar pago de cuota social | Con hallazgos | H11 |
| US-18 | Historial de cuotas sociales | No probada |  |
| US-19 | Morosos de cuota social | Con hallazgos | H09 |
| US-20 | Configurar cuota deportiva | No probada |  |
| US-21 | Pago de cuota deportiva | Funciona | Sin comprobante (H24) |
| US-22 | Historial de cuota deportiva | Con hallazgos | H24 |
| US-23 | Morosos de cuota deportiva | No probada | Solo visto en el estado financiero |
| US-24 | Cargar documentación | Funciona |  |
| US-25 | Estado documental | Funciona |  |
| US-26 | Alertas de documentación | Con hallazgos | H15 |
| US-27 | Bloqueo por documentación | Funciona | Visto en Mi documentación |
| US-28 | Habilitación excepcional | No probada |  |
| US-29 | Crear evento | Con hallazgos | H21 |
| US-30 | Entradas con QR | Funciona |  |
| US-31 | Validar acceso por QR | Con hallazgos | H01, H05, H22 |
| US-32 | Logs de operaciones | Funciona |  |
| US-33 | Consultar log | Funciona |  |
| US-34 | Dashboard | Parcial | H15 |
| US-35 | Estado financiero | Con hallazgos | H08, H09 |
| US-36 | Asistencia a eventos | Con hallazgos | H03 |
| US-37 | Exportar reportes | Parcial | Botones presentes; no se descargó |
| US-38..41 | Registro, login, logout, contraseña | Funciona | Registro con DT-54 en la sesión anterior; H14 |
| US-42..43 | Baja y reactivación del socio | No probada |  |
| US-44..51 | Disciplinas y categorías | Parcial | Solo listado; H20 |
| US-52 | Comprar entradas | Con hallazgos | H02, H14 |
| US-53 | Consultar eventos | Con hallazgos | Orden y menú del invitado |
| US-54 | Editar eventos | No probada |  |
| US-55..59 | Espacios y solicitar reserva | No implementada |  |
| US-60 | Evaluar solicitud de reserva | Con hallazgos | H04 |
| US-61 | Cancelar reserva | Parcial | H17 |
| US-62 | Mis reservas | Con hallazgos | H17 |
| US-63 | Solicitar inscripción | Funciona | H19 |
| US-64 | Mis solicitudes | Funciona |  |
| US-65..66 | Cancelar / evaluar solicitudes | No implementada |  |

## Evidencias

| N.º | Rol | Qué muestra |
|---|---|---|
| [01](01-eventos-publicos.jpeg) | Invitado | Catálogo público de eventos: finalizados primero y menú con opciones de socio |
| [02](02-invitado-mis-entradas.jpeg) | Invitado | «Mis entradas» sin sesión redirige al login |
| [03](03-invitado-comprar.jpeg) | Invitado | «Comprar entradas» sin sesión: va al login y después al Inicio (pierde el evento) |
| [04](04-socio-inicio.jpeg) | Socio | Inicio del socio: no muestra deuda, entradas ni reservas |
| [05](05-socio-mi-perfil.jpeg) | Socio | Mi perfil: el email se cambia sin confirmar ni re-verificar |
| [06](06-socio-mi-perfil-abajo.jpeg) | Socio | Mi perfil: baja como socio y cambio de contraseña |
| [07](07-socio-comprar-entradas.jpeg) | Socio | Comprar entradas: muestra $5.000 por entrada sin el 10% de socio |
| [08](08-mp-checkout-entradas.jpeg) | Socio | Checkout de Mercado Pago: el ítem de entradas se llama «Productos» |
| [09](09-entradas-pago-aprobado.jpeg) | Socio | Pago aprobado: $9.000 (con descuento), distinto de lo mostrado antes |
| [10](10-mis-entradas.jpeg) | Socio | Mis entradas: QR sin agrupar, sin fecha ni estado |
| [11](11-mis-reservas.jpeg) | Socio | Mis reservas: aviso de seña con plazo vencido y sin botón de pago |
| [12](12-solicitar-inscripcion.jpeg) | Socio | Catálogo de disciplinas con datos de prueba |
| [13](13-solicitar-basquet-no-cumple.jpeg) | Socio | Básquet: no cumple ninguna categoría, pero la tarjeta ofrece solicitar |
| [14](14-solicitud-enviada.jpeg) | Socio | Solicitud de inscripción a Pelota Paleta enviada |
| [15](15-mis-solicitudes.jpeg) | Socio | Mis solicitudes: sin opción de cancelar, hora en formato 12 h |
| [16](16-mi-documentacion.jpeg) | Socio | Mi documentación: bloqueo por certificado vencido |
| [17](17-admin-inicio.jpeg) | Admin | Inicio del admin: 27 alertas bajo «próximos 10 días» |
| [18](18-validar-qr-sin-nombre.jpeg) | Admin | Validar QR: título del evento vacío |
| [19](19-validar-qr-ok.jpeg) | Admin | Acceso permitido a un evento del 20/12, validado el 11/11 |
| [20](20-validar-qr-reuso.jpeg) | Admin | Reingreso rechazado (mensaje duplicado) |
| [21](21-validar-qr-otro-evento.jpeg) | Admin | Entrada de otro evento: la pantalla la rechaza, pero el backend la marcó usada |
| [22](22-participantes.jpeg) | Admin | Listado de participantes |
| [23](23-nuevo-participante.jpeg) | Admin | Alta de participante con requisitos de documentación |
| [24](24-participante-inscripto.jpeg) | Admin | Participante inscripto, cuota deportiva generada |
| [25](25-documentacion-cargada.jpeg) | Admin | Carga de documentación: valida archivo obligatorio |
| [26](26-documentacion-cargada-ok.jpeg) | Admin | Certificado cargado y vigente |
| [27](27-cobrar-deportiva.jpeg) | Admin | Cobro de cuota deportiva por DNI |
| [28](28-historial-deportivo.jpeg) | Admin | Historial deportivo: misma pantalla que Cobrar |
| [29](29-historial-deportivo-tomas.jpeg) | Admin | Historial deportivo de Tomás: «Categoría sin categoría» |
| [30](30-cuotas-hub.jpeg) | Admin | Hub de Cuotas incompleto |
| [31](31-config-cuota-social.jpeg) | Admin | Cuota social: tarifas históricas editables |
| [32](32-configurar-cuota-social-modal.jpeg) | Admin | Modal de nueva cuota social |
| [33](33-cuota-social-periodo-actual.jpeg) | Admin | Cuota pedida para 11/2026 guardada como 2026-12, figura «Inactivo» |
| [34](34-morosos-social.jpeg) | Admin | Morosos de cuota social |
| [35](35-cobrar-social-modal.jpeg) | Admin | Cobro de cuota social por secretaría |
| [36](36-cobrar-social-salteado.jpeg) | Admin | Cobro de 2026-10 dejando impagos 2026-08 y 2026-09 |
| [37](37-estado-financiero.jpeg) | Admin | Estado financiero: solo cuotas; morosos 27 vs 28 |
| [38](38-asistencia-eventos.jpeg) | Admin | Asistencia a eventos: eventos futuros cuentan como ausentes |
| [39](39-auditoria.jpeg) | Admin | Auditoría: «Acceso validado» de la entrada probada en otro evento |
| [40](40-eventos-admin.jpeg) | Admin | Eventos (admin) en tarjetas grandes, editable aun finalizado |
| [41](41-nuevo-evento-validaciones.jpeg) | Admin | Nuevo evento: validación de fin de venta |
| [42](42-nuevo-evento-capacidad.jpeg) | Admin | Entradas > capacidad: solo lo frena un toast del backend |
| [43](43-evento-creado.jpeg) | Admin | Evento creado |
| [44](44-solicitudes-reserva.jpeg) | Admin | Solicitudes de reserva con turnos superpuestos y ya pasados |
| [45](45-aprobar-reserva-pasada.jpeg) | Admin | Confirmación para aprobar una reserva del 08/11 |
| [46](46-reserva-pasada-aprobada.jpeg) | Admin | Reserva pasada aprobada con plazo de seña al 13/11 |
| [47](47-disciplinas.jpeg) | Admin | Disciplinas: tabla desbordada y datos de prueba |
| [48](48-colaborador-inicio.jpeg) | Colaborador | Inicio del colaborador con accesos a Usuarios y Auditoría |
| [49](49-colaborador-usuarios.jpeg) | Colaborador | Usuarios: «No tenés permisos» |
| [50](50-delegado-inicio.jpeg) | Delegado | Alertas filtradas por sus disciplinas |
| [51](51-movil-participantes.jpeg) | Delegado | Móvil: menú fijo tapa la pantalla; ve todos los participantes |
