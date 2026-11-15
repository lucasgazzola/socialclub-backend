# ESPECIFICACIÓN FUNCIONAL Y REFINAMIENTO DE USER STORY: US-34 "VER DASHBOARD"

## 1. REVISIÓN DEL BACKLOG Y MAPEO DEL DOMINIO

Para la estructuración formal de la User Story **US-34: Ver dashboard**, se realizó una revisión exhaustiva de la documentación técnica y de gestión del proyecto *SocialClub* (Facultad Regional Villa María - UTN, Cátedra de Proyecto Final 2026, Equipo 12 "Nullpointer"). A continuación se detallan los elementos de dominio, épicas, historias de usuario, reglas de negocio y entidades involucradas, junto con su respectiva fuente documental:

### 1.1. Épicas e Historias de Usuario Relacionadas

*   **Épica E10: Reportes y Métricas** *(Fuente: Documento 01 UTN FRVM - PF 2026 – Sprint 0 - Equipo 12 v1.0 - Product Backlog y User Story Mapping v1.1)*
    *   **US-34: Ver dashboard** (5 SP, Prioridad Media, Release 3 / Sprint 6, Asignado a: Mateo Gerbaudo - PO). Es la historia objeto de esta especificación.
    *   **US-35: Generar reporte de estado financiero** (5 SP, Prioridad Media). Aporta la lógica de cálculo de morosidad y recaudación acumulada por concepto.
    *   **US-36: Generar reporte de asistencia a eventos** (5 SP, Prioridad Baja). Aporta métricas de entradas validadas por QR y porcentaje de ocupación.
*   **Épica E4: Gestión de Socios y Épica E3: Portal del Socio** *(Fuente: Documento 01 UTN FRVM - PF 2026 – Sprint 0 / Documentación Sprint 4)*
    *   **US-12 (Alta socio), US-14 (Baja socio), US-15 (Consulta socio), US-42 (Baja voluntaria socio), US-43 (Reactivación ex-socio)**: Definen el ciclo de vida del socio y los estados transaccionales de membresía (`activo: true | false`).
*   **Épica E2: Gestión de Participantes** *(Fuente: Documento 01 UTN FRVM - PF 2026 – Sprint 0 / Documentación Sprint 6)*
    *   **US-05 (Registrar participante), US-07 (Baja participante), US-08 (Consultar participantes), US-63 a US-66 (Solicitudes de inscripción a disciplinas)**: Definen las inscripciones activas a disciplinas/categorías (`Inscripcion.activo = true`) y los estados documentales calculados (`HABILITADO`, `PENDIENTE`, `BLOQUEADO`).
*   **Épica E5: Cuotas Sociales y Épica E6: Cuotas Deportivas** *(Fuente: Documento 01 UTN FRVM - PF 2026 – Sprint 0 / Documentación Sprint 4 y Sprint 5)*
    *   **US-16/US-20 (Configurar cuotas), US-17/US-21 (Registrar pago de cuotas), US-19/US-23 (Ver morosos de cuota social y deportiva)**: Establecen la regla de cálculo de la deuda vencida (cuotas impagas cuyo vencimiento ocurrió el día 10 del mes actual o anterior) y la condición de `Al día` frente a `Moroso` mediante `PagosService.getMorososCuotaSocial` y `PagosDeportivosService.getMorosos`.
*   **Épica E7: Gestión Documental** *(Fuente: Documento 01 UTN FRVM - PF 2026 – Sprint 0 / Documentación Sprint 5)*
    *   **US-24 (Cargar documentación), US-25 (Ver estado documental), US-26 (Alertas por vencimiento en 10 días), US-27 (Bloqueo automático por vencimiento), US-28 (Habilitación excepcional)**: Definen la ventana de alerta de 10 días para vencimientos inminentes de certificados médicos/EMMAC, seguros y fichas federativas.
*   **Épica E8: Acceso a Eventos QR** *(Fuente: Documento 01 UTN FRVM - PF 2026 – Sprint 0 / Documentación Sprint 2)*
    *   **US-29 (Crear evento), US-30 (Generar entradas QR), US-31 (Validar acceso QR), US-53 (Consultar eventos), US-54 (Editar eventos)**: Establecen los datos de eventos (`EstadoEvento`: `PUBLICADO`, `BORRADOR`, `PAUSADO`, `CANCELADO`, `FINALIZADO`), fechas (`fechaEvento`, `fechaFin`), cupos de entradas (`capacidadMaxima`) y disponibilidad (`entradasDisponibles`).
*   **Épica E11: Autenticación y Seguridad y Épica E1: Gestión de Usuarios Administrativos** *(Fuente: Documento 02 UTN FRVM - Seguridad v1.0, Sección 2.5.3)*
    *   **US-01/US-02 (Gestión de usuarios y roles), US-39 (Iniciar sesión JWT), US-40 (Cerrar sesión)**: Definen la estructura de roles RBAC (`ADMIN`, `COLABORADOR`, `DELEGADO`, `SOCIO`).

### 1.2. Reglas de Negocio Vinculadas (RN)

*   **RN1 / RN2**: Registro previo obligatorio y asignación de uno o múltiples roles simultáneos por persona *(Propuesta y Alcance v1.1, Sección 2.5)*.
*   **RN5**: El estado del integrante respecto a sus pagos (`Al día` o `Moroso`) se calcula automáticamente en función de sus cuotas pendientes vencidas *(Propuesta y Alcance v1.1, Sección 2.5)*.
*   **RN7 / RN8**: La documentación obligatoria (EMMAC, apto físico, seguro) posee fecha de vencimiento cargada en el sistema *(Propuesta y Alcance v1.1, Sección 2.5)*.
*   **RN9**: El sistema contempla alertas ante vencimientos próximos (ventana de 10 días) *(Propuesta y Alcance v1.1, Sección 2.5)*.
*   **RN10**: No se permite habilitar la participación de un usuario con documentación obligatoria vencida o cuyo plazo de presentación haya expirado (bloqueo automático calculado en `estadoDeInscripcion`) *(Propuesta y Alcance v1.1, Sección 2.5)*.
*   **RN11 / RN12**: Eventos con capacidad máxima/cupo y entradas con código QR único *(Propuesta y Alcance v1.1, Sección 2.5)*.
*   **RN15**: El sistema debe permitir la generación de reportes y dashboard sobre el estado general de la organización *(Propuesta y Alcance v1.1, Sección 2.5)*.

### 1.3. Entidades de Base de Datos Envolventes

*(Fuente: Esquema Prisma ORM `prisma/schema.prisma`)*

*   `Usuario` / `Rol` / `UsuarioRol`: Identidades con roles RBAC (`ADMIN`, `COLABORADOR`, `DELEGADO`, `SOCIO`).
*   `Persona` / `Membresia`: Integrantes con categorías de socio (`CategoriaSocio`) y estado `activo: Boolean`.
*   `Inscripcion` / `Disciplina` / `CategoriaDisciplina` / `DisciplinaRequerimientoDoc` / `HabilitacionExcepcional`: Inscripciones activas de deportistas a disciplinas cuya habilitación documental (`HABILITADO`, `PENDIENTE`, `BLOQUEADO`) se calcula mediante `estadoDeInscripcion`.
*   `Documentacion`: Documentos cargados con `fechaVencimiento: DateTime?`, `tipo`, `tipoDocumento: TipoDocumentacionDisciplina?` y relación a `Persona`.
*   `Pago` / `PagoCuotaDeportiva` / `ConfiguracionCuotaSocial` / `ConfiguracionCuota`: Registros de pagos y configuraciones tarifarias utilizados por `PagosService` y `PagosDeportivosService` para el cálculo de morosidad.
*   `Evento` / `Entrada`: Eventos programados con `fechaEvento`, `fechaFin`, `lugarAcreditacion`, `estado` (`EstadoEvento.PUBLICADO`), `capacidadMaxima` y `entradasDisponibles`.

---

## 2. ESTADÍSTICAS E INDICADORES A MOSTRAR

Para garantizar que el dashboard provea una visión ejecutiva y operativa clara sin abrumar al usuario no técnico *(RNF01)*, los 5 indicadores requeridos por los Criterios de Aceptación se estructuran a continuación en la página exclusiva `/dashboard` (`DashboardGestionPage`), manteniendo la pantalla de inicio (`/`, `DashboardPage`) sin cambios y con su comportamiento original (incluidas las alertas de documentación de US-26):

### 2.1. Tabla de Indicadores Principales

| Nombre del Indicador | Definición Exacta y Fórmula de Cálculo | Criterio de Inclusión / Exclusión (Definición de Estados) | Fuente de Datos (Entidad / Módulo) | Forma de Visualización |
| :--- | :--- | :--- | :--- | :--- |
| **Total de Integrantes Activos** (`totalIntegrantesActivos`) | Conteo único de personas físicas registradas con `activo = true` que mantienen al menos una membresía social activa o al menos una inscripción deportiva activa.<br><br>$$N_{\text{activos}} = \| \{ p \in \text{Persona} \mid p.\text{activo} = \text{true} \land (\exists m \in p.\text{membresias}: m.\text{activo} \lor \exists i \in p.\text{inscripciones}: i.\text{activo}) \} \|$$ | **Incluye**: Personas con `activo = true` que posean al menos una `Membresia` con `activo = true` o al menos una `Inscripcion` con `activo = true`.<br>**Excluye**: Personas con baja lógica (`activo = false`) o sin membresías ni inscripciones activas. | Módulo Socios y Participantes (`Persona`, `Membresia`, `Inscripcion`) | Tarjeta de KPI numérica (*KPI Card*) con icono representativo y navegación a `/socios` |
| **Porcentaje de Morosos** (`porcentajeMorosos` y `cantidadMorosos`) | Proporción de personas únicas activas que presentan al menos una cuota social o deportiva vencida impaga sobre el total de integrantes activos.<br><br>$$P_{\text{morosos}} = \left( \frac{N_{\text{morosos}}}{N_{\text{activos}}} \right) \times 100$$ | **Cuenta como "Moroso"**: Persona activa (`id` en el conjunto de integrantes activos) presente en la unión de resultados de `PagosService.getMorososCuotaSocial` y `PagosDeportivosService.getMorosos` (personas únicas, no cantidad de deudas).<br>**Excluye**: Personas al día, personas inactivas o cuotas aún no vencidas.<br>**Manejo de cero activos**: Si $N_{\text{activos}} = 0$, $P_{\text{morosos}} = 0.0\%$. | Módulo Pagos (`PagosService`, `PagosDeportivosService`) | Tarjeta de KPI con porcentaje (1 decimal), cantidad absoluta ($N_{\text{morosos}}$), semáforo visual configurable (Verde < 15%, Amarillo 15-30%, Rojo > 30%) y gráfico de dona `Recharts` **"Morosos vs. Al día"** con etiquetas y valores |
| **Documentos por Vencer (Próximos 10 Días)** (`documentosPorVencer`) | Conteo de documentos cargados de personas activas cuya `fechaVencimiento` cae entre hoy (`00:00:00` UTC del día en Córdoba) y hoy + 10 días (`23:59:59.999` UTC del día +10 en Córdoba).<br><br>$$N_{\text{vencer}} = \| \{ d \in \text{Documentacion} \mid d.\text{persona}.\text{activo} = \text{true} \land T_{\text{hoy}} \le d.\text{fechaVencimiento} \le T_{\text{hoy}} + 10\text{d} \} \|$$ | **Cuenta como "Por vencer"**: Todo registro en `Documentacion` con `fechaVencimiento` entre `hoy` y `hoy + 10 días` (en zona horaria `America/Argentina/Cordoba`) de personas con `activo = true`.<br>**Excluye**: Documentos sin vencimiento (`null`), ya vencidos ($< T_{\text{hoy}}$), con vencimiento posterior a 10 días o de personas inactivas. | Módulo Gestión Documental (`Documentacion`, `Persona`) | Tarjeta de KPI con aviso de ventana de 10 días y navegación a `/participantes` |
| **Inscripciones Irregulares** (`inscripcionesIrregulares: { total, pendientes, bloqueadas }`) | Conteo de inscripciones activas de personas activas cuyo estado documental calculado en lote resulta en `PENDIENTE` o `BLOQUEADO`.<br><br>$$N_{\text{irregulares}} = N_{\text{pendientes}} + N_{\text{bloqueadas}}$$ | **Cuenta como `pendientes`**: Inscripción activa con estado documental `'PENDIENTE'` (documento obligatorio faltante dentro del plazo de tolerancia).<br>**Cuenta como `bloqueadas`**: Inscripción activa con estado documental `'BLOQUEADO'` (documento vencido o plazo de presentación vencido sin habilitación excepcional vigente).<br>**Excluye**: Inscripciones en estado `'HABILITADO'` o inactivas. | Módulo Documentación e Inscripciones (`Inscripcion`, `DisciplinaRequerimientoDoc`, `Documentacion`, `estadoDeInscripcion`) | Tarjeta de KPI con total y desglose en badges (`Pendientes` vs `Bloqueadas`) y gráfico de barras `Recharts` **"Inscripciones pendientes vs. bloqueadas"** con etiquetas y valores |
| **Próximos Eventos** (`proximosEventos`) | Listado resumido de hasta 5 eventos en estado `PUBLICADO` que aún no han finalizado. | **Incluye**: Eventos con `estado = PUBLICADO` y (`fechaFin >= ahora` o, si `fechaFin` es `null`, `fechaEvento >= ahora`).<br>**Excluye**: Eventos en estado `BORRADOR`, `PAUSADO`, `CANCELADO` o `FINALIZADO`, o ya finalizados.<br>**Límite y Orden**: Máximo 5 eventos, ordenados por `fechaEvento ASC`. | Módulo de Eventos (`Evento`) | Tabla a ancho completo con: Nombre, Fecha y Hora (`DD/MM/YYYY HH:mm`), Lugar de Acreditación y Entradas (`entradasVendidas / capacidadMaxima` y `entradasDisponibles`) |

---

## 3. CRITERIOS DE ACEPTACIÓN MEJORADOS (FORMATO GHERKIN)

### Escenario 1: Restricción de acceso a usuarios no autorizados (`SOCIO`, `DELEGADO` o Anónimo) y visibilidad del menú
*   **Dado** que un usuario se encuentra autenticado en el sistema con el rol `SOCIO` o `DELEGADO`, o es un visitante no autenticado (anónimo)
*   **Cuando** visualiza el menú lateral o intenta ingresar directamente a la ruta `/dashboard` (o al endpoint `GET /dashboard`)
*   **Entonces** la entrada **"Dashboard"** del menú lateral permanece oculta (siendo visible únicamente para `ADMIN` y `COLABORADOR`)
*   **Y** el backend deniega el acceso mediante `JwtAuthGuard` (`401 Unauthorized` si es anónimo) y `RolesGuard` (`403 Forbidden` si no posee rol `ADMIN` ni `COLABORADOR`)
*   **Y** en el frontend redirige automáticamente a los usuarios autenticados `SOCIO` y `DELEGADO` a `/mi-perfil` mostrando el mensaje de falta de permisos: *"No posee permisos para acceder al dashboard de gestión de la organización"*
*   **Y** redirige a los visitantes no autenticados (anónimos) a `/login`.

### Escenario 2: Acceso exitoso y carga de `/dashboard` como página propia para roles autorizados (`ADMIN` y `COLABORADOR`)
*   **Dado** que un usuario se encuentra autenticado en el sistema con el rol `ADMIN` o `COLABORADOR`
*   **Cuando** selecciona la entrada **"Dashboard"** en el menú lateral o navega a `/dashboard`
*   **Entonces** la pantalla de inicio (`/`) conserva su comportamiento original (accesos a módulos y alertas de documentación de US-26), mientras que `/dashboard` se renderiza como una página independiente (`DashboardGestionPage`)
*   **Y** el sistema valida su token JWT mediante cookie `httpOnly` en `GET /dashboard`
*   **Y** calcula y renderiza los indicadores clave de la organización:
     *   Tarjeta 1: **Total de Integrantes Activos** (`totalIntegrantesActivos`).
     *   Tarjeta 2: **Porcentaje de Morosos** (`porcentajeMorosos` con 1 decimal, `cantidadMorosos` y semáforo visual).
     *   Tarjeta 3: **Documentos por Vencer** (`documentosPorVencer` entre hoy y hoy + 10 días en horario de Córdoba).
     *   Tarjeta 4: **Inscripciones Irregulares** (`inscripcionesIrregulares.total` con desglose de `pendientes` y `bloqueadas`).
     *   Gráficos comparativos: Dona **"Morosos vs. Al día"** y Barras **"Inscripciones pendientes vs. bloqueadas"**.
     *   Tabla 5: **Próximos Eventos** (`proximosEventos` en estado `PUBLICADO`).

### Escenario 3: Manejo de casos borde (Organización sin integrantes activos o base vacía)
*   **Dado** que un usuario autorizado ingresa a `/dashboard` cuando no existen integrantes activos registrados ($N_{\text{activos}} = 0$) ni inscripciones irregulares
*   **Cuando** el sistema procesa el cálculo de métricas
*   **Entonces** el indicador "Total de Integrantes Activos" muestra el valor `0`
*   **Y** el indicador "Porcentaje de Morosos" evita el error de división por cero y muestra `0.0%`
*   **Y** el indicador "Documentos por Vencer" muestra `0`
*   **Y** el indicador "Inscripciones Irregulares" muestra `0`
*   **Y** los gráficos muestran sus respectivos estados vacíos informativos sin arrojar errores de renderizado.

### Escenario 4: Manejo de casos borde en la lista de próximos eventos (Sin eventos publicados)
*   **Dado** que un usuario autorizado visualiza `/dashboard`
*   **Y** no existen eventos con estado `PUBLICADO` vigentes o futuros
*   **Cuando** se renderiza la sección de "Próximos Eventos"
*   **Entonces** el sistema no muestra una tabla vacía sin formato
*   **Y** despliega el mensaje informativo: *"No hay eventos próximos programados o publicados en la organización"*.

### Escenario 5: Especificación del listado de Próximos Eventos (Formato, orden y límites)
*   **Dado** que existen múltiples eventos registrados en la base de datos con distintos estados y fechas
*   **Cuando** un usuario autorizado carga `/dashboard`
*   **Entonces** el sistema filtra y muestra únicamente aquellos eventos que cumplan simultáneamente:
    1.  `estado == "PUBLICADO"` (excluyendo `BORRADOR`, `PAUSADO`, `CANCELADO` y `FINALIZADO`).
    2.  `fechaFin >= ahora` o, si `fechaFin` es `null`, `fechaEvento >= ahora`.
*   **Y** limita el listado a un máximo de **5 eventos**.
*   **Y** los ordena cronológicamente de forma ascendente por `fechaEvento ASC`.
*   **Y** muestra para cada evento: Nombre (`nombre`), Fecha y Hora de inicio en formato `DD/MM/YYYY HH:mm` (`fechaEvento`), Lugar de Acreditación (`lugarAcreditacion`) y Entradas (`entradasVendidas / capacidadMaxima` y `entradasDisponibles`).

### Escenario 6: Manejo de errores de conectividad o fallo del servidor al cargar métricas
*   **Dado** que un usuario autorizado ingresa a `/dashboard`
*   **Cuando** la petición `GET /dashboard` se encuentra en curso o falla
*   **Entonces** durante la carga inicial el frontend muestra un *skeleton loader* con la estructura del dashboard
*   **Y** ante un error despliega el mensaje controlado: *"No se pudieron cargar las métricas del dashboard. Por favor, reintente en unos minutos."*
*   **Y** provee un botón explícito de **"Reintentar carga"**.

### Escenario 7: Visualización con gráficos (Dona de morosidad y Barras de inscripciones)
*   **Dado** que un usuario autorizado (`ADMIN` o `COLABORADOR`) visualiza la página `/dashboard`
*   **Cuando** se reciben los datos del endpoint `GET /dashboard`
*   **Entonces** el sistema renderiza con `Recharts` dos gráficos responsive utilizando exclusivamente los datos de `GET /dashboard`:
    1.  Gráfico de dona **"Morosos vs. Al día"** comparando `cantidadMorosos` frente a `totalIntegrantesActivos - cantidadMorosos`.
    2.  Gráfico de barras **"Inscripciones pendientes vs. bloqueadas"** comparando `inscripcionesIrregulares.pendientes` frente a `inscripcionesIrregulares.bloqueadas`.
*   **Y** ambos gráficos muestran explícitamente etiqueta y valor numérico (sin depender únicamente del color)
*   **Y** cuando los valores de un gráfico son `0`, muestra un estado vacío informativo sin errores.

---

## 4. REGLAS DE NEGOCIO Y REQUISITOS NO FUNCIONALES

### 4.1. Reglas de Negocio Aplicables (RN)

1.  **RN-DASH-01 (RBAC Estricto y Entrada de Menú)**: Únicamente los usuarios con rol `ADMIN` o `COLABORADOR` visualizan la entrada **"Dashboard"** en el menú lateral y tienen acceso a `/dashboard` y `GET /dashboard`. Los roles `DELEGADO` y `SOCIO` son redirigidos a `/mi-perfil` con mensaje de falta de permisos, y los usuarios anónimos son redirigidos a `/login`.
2.  **RN-DASH-02 (Cálculo Automático de Morosidad)**: Se reutilizan `PagosService.getMorososCuotaSocial` y `PagosDeportivosService.getMorosos`, contando personas únicas activas sobre el total de integrantes activos.
3.  **RN-DASH-03 (Ventana Temporal de Alerta Documental)**: Computa todo documento con `fechaVencimiento` entre hoy y hoy + 10 días inclusive (zona `America/Argentina/Cordoba`) perteneciente a personas activas (`persona.activo = true`).
4.  **RN-DASH-04 (Sin Auditoría de Lectura)**: El endpoint `GET /dashboard` es una consulta de solo lectura y no registra entradas en `registros_auditoria` (el enum `AccionAuditoria` se reserva para mutaciones y eventos de sesión).

### 4.2. Requisitos No Funcionales (RNF)

1.  **RNF01: Simplicidad de Interfaz y Accesibilidad (Usabilidad)**: Diseño claro de tarjetas KPI y gráficos `Recharts` con etiquetas y valores visibles (no solo color), jerarquía tipográfica, iconos de `lucide-react` y semáforo semántico (verde/amarillo/rojo).
2.  **RNF02: Diseño Web Responsive**: Grilla de 4 columnas en escritorio (`lg:grid-cols-4`), 2 en tablet (`sm:grid-cols-2`) y 1 en móvil (`grid-cols-1`) para las tarjetas KPI; grilla de 2 columnas en escritorio (`lg:grid-cols-2`) y 1 en móvil para los gráficos.
3.  **RNF-PERF-01: Rendimiento de Carga (< 2.0 s, sin N+1)**: Las consultas en `DashboardService` se ejecutan en paralelo con `Promise.all` y la evaluación documental de inscripciones se realiza en memoria sobre 3 consultas en lote (`inscripcion.findMany`, `disciplinaRequerimientoDoc.findMany`, `documentacion.findMany`), garantizando 0 consultas N+1.
4.  **RNF-SEC-01: Autenticación JWT y Cookies httpOnly**: Protegido mediante `JwtAuthGuard` y `RolesGuard`.

---

## 5. DECISIONES DE DISEÑO IMPLEMENTADAS

### 5.1. Separación entre Pantalla de Inicio (`/`) y Dashboard (`/dashboard`)
*   **Decisión**: La ruta `/` (`DashboardPage`) conserva intacto su comportamiento original de pantalla de inicio por rol (incluidas las alertas de documentación de US-26 para `ADMIN` y `DELEGADO`), mientras que el dashboard ejecutivo de la US-34 vive en su propia página independiente en la ruta `/dashboard` (`DashboardGestionPage`), accesible desde la entrada **"Dashboard"** del menú lateral (visible solo para `ADMIN` y `COLABORADOR`).

### 5.2. Actualización de datos en pantalla
*   **Decisión**: Uso de `TanStack Query` (`useDashboard`) con `staleTime: 30000` (30 s), `refetchOnWindowFocus: true`, botón **"Actualizar"** y texto **"Última actualización: HH:mm"** calculado en zona horaria `America/Argentina/Cordoba`.

### 5.3. Límite del listado de próximos eventos
*   **Decisión**: Máximo **5 eventos** en estado `PUBLICADO`, filtrados por `fechaFin >= ahora` (o `fechaEvento >= ahora` si `fechaFin` es `null`), ordenados por `fechaEvento ASC`, con enlace **"Ver todos"** hacia `/eventos`.

### 5.4. Layout y navegación de las tarjetas KPI
*   **Decisión**: Grilla superior de **4 tarjetas KPI** (Total de Integrantes Activos $\rightarrow$ `/socios`, Porcentaje de Morosos $\rightarrow$ `/cuotas/social/morosos`, Documentos por Vencer $\rightarrow$ `/participantes`, Inscripciones Irregulares $\rightarrow$ `/participantes`), seguida de la sección de gráficos comparativos y la tabla de **Próximos Eventos a ancho completo** debajo.

### 5.5. Visualización con gráficos
*   **Decisión**: Incorporación de dos gráficos con `Recharts` (`DashboardGraficos`) alimentados exclusivamente con los datos devueltos por `GET /dashboard`:
    1.  **Dona "Morosos vs. Al día"**: compara `cantidadMorosos` frente a `totalIntegrantesActivos - cantidadMorosos`.
    2.  **Barras "Inscripciones pendientes vs. bloqueadas"**: compara `inscripcionesIrregulares.pendientes` frente a `inscripcionesIrregulares.bloqueadas`.
    Ambos gráficos son responsive (`ResponsiveContainer`), exponen etiqueta y valor numérico (no dependiendo únicamente del color para su interpretación) y muestran un estado vacío controlado sin errores cuando los totales son `0`.

### 5.6. Caché del backend
*   **Decisión**: **Sin caché en el backend**. Consultas agregadas y en lote con Prisma ORM.

### 5.7. Zona horaria y cálculo de "hoy"
*   **Decisión**: Todos los cálculos de ventana de fechas y formateo visual utilizan la zona horaria **`America/Argentina/Cordoba`** (UTC-3).

### 5.8. Semáforo del Porcentaje de Morosos
*   **Decisión**: Umbrales definidos en la constante exportada `UMBRALES_MOROSIDAD` (`AMARILLO_DESDE: 15`, `ROJO_DESDE: 30`): **verde < 15 %**, **amarillo 15-30 %**, **rojo > 30 %**.

### 5.9. Auditoría de lecturas
*   **Decisión**: No se agrega `CONSULTAR_DASHBOARD` ni migración en `AccionAuditoria`; las consultas `GET /dashboard` no generan registros en `registros_auditoria`.
