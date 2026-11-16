# 0008 · El panel y Mi club no se navegan entre sí

- **Estado:** Aceptada (15/11/2026) e implementada en el frontend, salvo el botón «Comprar entradas» del panel: se pidió no tocar entradas en esta tanda.
- **Reemplaza, si se acepta:** el párrafo de [0006](0006-landing-mi-club-y-panel.md) que dice «Lo personal vive en Mi club, también para la gestión» y manda poner un acceso «Mi club» en el panel y «Ir al panel de gestión» en el portal. El resto de 0006 (tres zonas, landing, alta con pago, vigencia de entradas) sigue vigente.
- **Código a tocar:** solo frontend, `socialclub-frontend`. No hay cambio de API ni de schema.

## Contexto

0006 separó el sitio en tres zonas para que cada rol vea la suya:

| Zona | Ruta | Quién entra al iniciar sesión |
|---|---|---|
| Sitio público | `/` | Nadie: es la puerta, sin sesión |
| Mi club | `/mi-club` | Quien no tiene rol de gestión (`destinoAlIngresar`) |
| Panel | `/admin` | ADMIN, COLABORADOR, DELEGADO |

Esa entrada por rol está bien y no se toca. Lo que se agregó después es un puente para ir y volver: el panel tiene un botón «Mi club» y el portal, para quien también gestiona, un ítem «Panel de gestión». No fue el diseño. Las dos vistas dividen por rol; no son dos módulos del mismo usuario.

El caso que se vio el 15/11, con la sesión de `admin@socialclub.local` en `http://localhost:5173/admin/eventos`: **Comprar entradas** cambia el layout entero y abre `/mi-club/eventos/:id/entradas`. El admin sigue logueado, pero queda parado en el portal del socio.

### Por qué «Comprar entradas» salta

`ROUTES.comprarEntradas` está definido una sola vez y apunta siempre al portal:

```ts
comprarEntradas: (eventoId: number) => `${MI_CLUB}/eventos/${eventoId}/entradas`
```

(`src/routes/paths.ts`, cerca de la línea 29).

Esa ruta la renderiza `PortalComprarEntradasPage` dentro de `PortalSocioLayout` (`AppRouter.tsx`, `mi-club/eventos/:eventoId/entradas`). No existe una pantalla de compra dentro de `/admin`.

La tarjeta y el modal del **panel** usan ese helper sin mirar en qué zona están:

- `src/features/eventos/components/EventoCard.tsx`, el `Link` de «Comprar entradas».
- `src/features/eventos/components/EventoDetalleModal.tsx`, el mismo `Link`.

`EventosPage` solo se monta en el panel (`AppRouter.tsx`, `admin/eventos`, `modo="gestion"`). El portal no la usa: tiene `PortalEventosPage` y `PortalModals`, que también llaman a `ROUTES.comprarEntradas` y ahí el salto es correcto, porque ya están en Mi club.

El test lo fija como comportamiento esperado: `EventosPage.test.tsx` («muestra la acción de comprar entradas…») afirma que el admin obtiene `href="/mi-club/eventos/12/entradas"`. `EventoCard.test.tsx` afirma lo mismo para el id 42.

## Qué más cruza de una zona a la otra

Esto es navegación elegida, no una guarda. Hay que sacarla si se acepta la propuesta.

| Dónde | Qué hace | Archivo |
|---|---|---|
| Encabezado de todas las pantallas del panel | Botón «Mi club» → `/mi-club` | `src/components/layout/AppLayout.tsx` (el `NavLink` comentado TASK-60) |
| Menú de cuenta del portal | Si `esDeGestion`, ítem «Panel de gestión» → `/admin` | `src/features/portal-socio/components/PortalSocioLayout.tsx`, `linksCuenta` |
| Header de la landing, con sesión y rol de gestión | Muestra **los dos**: «Panel» y «Mi club» | `src/features/landing/components/SitioHeader.tsx` |
| Hero y cierre de la landing, con cualquier sesión | El botón dice «Ir a Mi club» y va a `/mi-club`, también si quien está logueado es admin | `src/features/landing/pages/LandingPage.tsx` (dos `Link`, hoy `usuario ? ROUTES.miClub : ROUTES.hacermeSocio`) |

Esto no es un puente y se queda:

- `destinoAlIngresar`: al entrar, la gestión va a `/admin` y el resto a `/mi-club`.
- `ProtectedRoute` con `soloGestion`: un socio que escribe `/admin` vuelve a Mi club. No tiene panel.
- `DashboardPage`: mismo desvío si alguien sin rol de gestión cae en el inicio del panel.
- Cerrar sesión → landing (`ROUTES.inicio`).
- «Sitio del club» en el menú del portal → la landing pública. No es el otro panel.
- `/pagos/resultado` y `/pagos/simulador` siguen en el layout del portal: los arma la API en el mail y en la vuelta de Mercado Pago (0006). La compra, si sale del portal, vuelve al portal.
- Los redirects de rutas viejas (`rutaNuevaDe`): un marcador `/eventos/4/entradas` sigue yendo a Mi club.

## Decisión propuesta

Cada persona entra a la zona de su rol. El puente a la otra zona existe solo si esa misma persona es las dos audiencias: tiene un rol de gestión (`ADMIN`, `COLABORADOR` o `DELEGADO`) **y** el rol `SOCIO`.

En la seed eso es solo Diego Navarro y Laura Ferreyra (`DELEGADO` + `SOCIO`). Alejandro Ramos es `ADMIN` solo, Franco Bustos es `COLABORADOR` solo y Lucía Vázquez es `SOCIO` sola: ninguno ve el otro lado.

1. **En el panel no se compra.** `EventosPage` en `modo="gestion"` no muestra «Comprar entradas», ni en la tarjeta ni en el detalle. Comprar es del socio y ya está en `PortalEventosPage` → `PortalComprarEntradasPage`, que no cambia de zona. El cruce no puede ser un efecto de una acción de la pantalla actual: si Diego quiere comprar, entra a Mi club con el botón y compra ahí.
2. **El puente queda condicionado.** «Mi club» en `AppLayout` y «Panel de gestión» en `PortalSocioLayout` se renderizan solo con `esDeGestion(roles) && roles.includes('SOCIO')`. Para el resto no están.
3. **La landing muestra un solo destino, salvo el caso doble.** Con gestión y sin `SOCIO`, el botón es «Panel». Con sesión y sin gestión, «Mi club». Con las dos cosas, se ven los dos. Sin sesión, «Quiero ser socio» / «Ingresar», como ahora.

## Alternativas

- **Dejar el botón «Comprar entradas» y hacer que el admin se compre una entrada a sí mismo dentro de `/admin`.** No es el caso. La venta por teléfono o en secretaría, a nombre de otra persona, es otra cosa y queda en [0009](0009-venta-de-entradas-en-secretaria.md).
- **Sacar el puente también para el delegado que es socio.** Los obliga a una segunda cuenta para ver sus propias entradas y cuotas. Se descartó el 15/11: el puente se conserva solo cuando la persona tiene rol de gestión y `SOCIO`.
- **Mantener 0006 (el puente para cualquier usuario de gestión).** Le muestra Mi club a un admin que no es socio, que es el salto que se vio. Se descarta.

## Consecuencias, cuando se implemente

- Un admin en `/admin/eventos` se queda en el panel y no ve «Mi club». Diego y Laura sí ven el botón, en las dos zonas. La peña se compra desde Mi club.
- Tests a actualizar (dejan de exigir el cruce):
  - `src/features/eventos/pages/EventosPage.test.tsx`: el admin no ve el link a `/mi-club/eventos/12/entradas`.
  - `src/features/eventos/components/EventoCard.test.tsx`: la tarjeta del panel no ofrece la compra. Si el link se condiciona con una prop, el test del portal no pasa por esta tarjeta.
  - `src/components/layout/AppLayout.test.tsx`: con `ADMIN` no está «Mi club»; con `DELEGADO` + `SOCIO`, sí.
  - `src/features/landing/pages/LandingPage.test.tsx`: admin solo ve el panel; socio solo ve Mi club; delegado+socio ve los dos.
  - `PortalSocioLayout.test.tsx`: Lucía no ve «Panel de gestión»; un usuario `DELEGADO` + `SOCIO`, sí. Un `ADMIN` sin `SOCIO` tampoco.
- No se toca el backend. `GET /eventos` y la compra siguen igual.
- 0006 se actualiza con una línea «el puente entre zonas quedó reemplazado por 0008» recién cuando esta propuesta pase a Aceptada.

## Implementación (15/11/2026)

La regla vive en `socialclub-frontend/src/routes/paths.ts`: `cruzaZonas` y `destinosDeSesion`. La usan el encabezado del panel (`AppLayout`), el menú de cuenta del portal (`PortalSocioLayout`), el header de la landing (`SitioHeader`) y los llamados de `LandingPage`.

Quedó afuera, a pedido, todo lo de entradas. «Comprar entradas» sigue en la tarjeta y en el detalle del panel, y sigue yendo a `/mi-club/eventos/:id/entradas`. Se saca cuando se trabaje esa pantalla. La venta en secretaría es [0009](0009-venta-de-entradas-en-secretaria.md) y no está hecha.

## Cómo comprobarlo

1. Sesión `admin@socialclub.local` en `/admin`: el encabezado no tiene «Mi club».
2. Sesión `diego.navarro@socialclub.local` (delegado y socio): en el panel está «Mi club» y, del otro lado, «Panel de gestión».
3. Sesión `lucia.vazquez@club.local` en `/mi-club`: en el menú de la cuenta no está «Panel de gestión». «Comprar entradas» de un evento del portal sigue en `/mi-club`.
4. Landing: el admin ve solo «Panel»; Lucía, solo «Mi club»; Diego, los dos.
5. Escribir `/admin` con Lucía sigue llevando a Mi club (la guarda, no un menú).
