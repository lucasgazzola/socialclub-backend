# Evidencia de pruebas · US-53

## Consultar eventos del club

Fecha de verificación: 12/10/2026  
Módulos: `socialclub-backend` (`src/eventos/`) y `socialclub-frontend` (`src/features/eventos/`)

Se implementó y verificó la funcionalidad para que cualquier usuario (autenticado o visitante anónimo) pueda consultar el catálogo de eventos del club con sus detalles relevantes, disponibilidad y período de venta, delegando paginación, búsqueda por palabras clave y filtrado por rango de fechas al servidor.

---

### Criterios de Aceptación Verificados

1. **Filtro de Estado en Backend y exclusión de Borradores**:
   - `GET /api/v1/eventos` devuelve únicamente eventos en estados visibles para el público (`PUBLICADO`, `CANCELADO`, `FINALIZADO`). Los eventos en estado `BORRADOR` quedan excluidos de forma estricta salvo que un usuario con rol `ADMIN` envíe explícitamente `incluirBorradores=true`.
2. **Información Detallada del Evento y Modal de Detalle**:
   - Cada evento presenta su nombre, descripción, fecha/hora de inicio y fin, imagen, lugar de acreditación, precio e información de disponibilidad.
   - Componente `EventoDetalleModal` permite consultar el detalle completo de un evento sin necesidad de iniciar una compra ni estar autenticado.
3. **Eventos Gratuitos**:
   - Eventos con precio "0" o 0 se señalan claramente con la etiqueta "Gratis", y aquellos que no requieren entrada se identifican como "Acceso libre y gratuito".
4. **Disponibilidad y Período de Venta**:
   - La cantidad de entradas disponibles se exhibe en la tarjeta y en el modal únicamente cuando el evento se encuentra dentro de su ventana de venta (`inicioVenta` y `finVenta`).
   - Se informa visualmente cuando la venta es próxima ("Venta próxima", badge amarillo) o cuando el período finalizó ("Venta cerrada" / "Período de venta finalizado").
5. **Paginación, Búsqueda y Filtros en Backend**:
   - Endpoint `GET /eventos` soporta `search` (búsqueda insensible a mayúsculas/minúsculas en nombre o descripción), rango de fechas `fechaDesde` y `fechaHasta`, y paginación con metadatos (`total`, `pagina`, `porPagina`, `totalPaginas`). Soporta también aliases `page` y `limit`.
6. **Acceso Público**:
   - `OptionalJwtAuthGuard` permite invocar `GET /eventos` y `GET /eventos/:id` sin requerir cookie de sesión, permitiendo la exploración del catálogo antes del login.

---

### Evidencia Automatizada Backend (NestJS + Jest)

Comando ejecutado desde `socialclub-backend`:

```bash
npm test src/eventos
```

Resultado:

```text
PASS src/eventos/fin-del-evento.spec.ts
PASS src/eventos/cierre-de-eventos.spec.ts
PASS src/eventos/eventos.service.spec.ts
PASS src/eventos/eventos.mapper.spec.ts

Test Suites: 4 passed, 4 total
Tests:       17 passed, 17 total
Snapshots:   0 total
Time:        8.553 s
```

---

### Evidencia Automatizada Frontend (Vitest + Testing Library)

Comandos ejecutados desde `socialclub-frontend`:

```bash
npx vitest run src/features/eventos/pages/EventosPage.test.tsx src/features/eventos/components/EventoDetalleModal.test.tsx src/components/layout/AppLayout.test.tsx --reporter=verbose
```

Resultado:

```text
 ✓ src/features/eventos/components/EventoDetalleModal.test.tsx (6 tests)
   ✓ muestra la información completa del evento: título, descripción, fechas, lugar y precios
   ✓ indica claramente cuando un evento es gratuito (precio 0 o no requiere entrada)
   ✓ muestra las entradas disponibles cuando el evento está en su período de venta
   ✓ informa visualmente cuando la venta es próxima a comenzar
   ✓ informa visualmente cuando el período de venta finalizó
   ✓ ejecuta onClose al hacer clic en el botón Cerrar

 ✓ src/features/eventos/pages/EventosPage.test.tsx (9 tests)
   ✓ muestra la acción de comprar entradas y la conecta con la ruta del evento
   ✓ oculta Nuevo evento para un usuario autenticado sin rol administrativo
   ✓ abre el alta de evento en un modal en lugar de navegar (DT-14)
   ✓ crea el evento y cierra el modal al confirmar (DT-14)
   ✓ cierra el modal con Escape sin crear el evento (DT-14)
   ✓ permite abrir el modal de detalle del evento con "Ver detalle" sin iniciar compra (US-53)
   ✓ muestra skeletons de carga mientras se obtienen los eventos (US-53)
   ✓ muestra el estado vacío cuando no hay eventos disponibles (US-53)
   ✓ conecta los filtros de búsqueda y fechas con useEventos (US-53)

 ✓ src/components/layout/AppLayout.test.tsx (5 tests)

Test Files  3 passed (3)
Tests       20 passed (20)
```

---

### Verificaciones de Calidad

| Proyecto | Comando | Resultado |
|---|---|---|
| Backend | `npm test` | 59 suites aprobadas (696 tests) |
| Backend | `npm run lint` | 0 errores |
| Backend | `npm run build` | Exitoso |
| Frontend | `npm run typecheck` | Exitoso (0 errores de tipado) |
| Frontend | `npm run lint` | 0 errores |
| Frontend | `npm run build` | Exitoso |
