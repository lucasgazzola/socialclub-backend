# Estándares Full-Stack para Módulos CRUD / ABM — Equipo NullPointer (SocialClub)

Este documento define el **contrato obligatorio entre Backend (`socialclub-backend`) y Frontend (`socialclub-frontend`)** para cualquier pantalla de gestión, listado, alta, edición, baja lógica y reactivación de entidades del sistema (**Usuarios**, **Socios**, **Participantes**, **Disciplinas**, **Espacios Físicos**, **Eventos**, etc.).

> **Regla de Oro para Asistentes de IA:**
> Cada vez que implementes o modifiques un módulo tipo CRUD / ABM (ya sea en Backend, en Frontend o en ambos), **el Backend debe recibir todos los parámetros que la grilla del Frontend necesita y devolver toda la información (incluyendo contadores globales `counts`) en una única respuesta atómica**. Nunca dejes que el Frontend pierda los contadores de las pestañas (`Todos`, `Activos`, `Inactivos`) al cambiar de filtro.

---

## 1. Contrato Estándar de Listado (`GET /api/v1/<recurso>`)

Toda pantalla administrativa con tabla/grilla utiliza los componentes oficiales:
- `<StatusTabs>` (`Todos`, `Activos`, `Inactivos`)
- `<Input leftIcon={<Search />} />` (con debounce de `300ms`)
- `<Select leftIcon={<Filter />} />` (filtro secundario de dominio)
- `<TableExportMenu>` (exportación CSV / PDF)
- `<HeaderOrdenable>` (ordenamiento tri-estado `asc` → `desc` → `neutral`)
- `<TablePagination>` (paginación en servidor `10 | 25 | 50`)

Para que todos estos componentes funcionen sin fallas ni parpadeos, el endpoint `GET /api/v1/<recurso>` **DEBE** cumplir el siguiente contrato:

### A. Query Params de Entrada (`Find<Recurso>QueryDto`)

| Parámetro | Tipo | Ejemplo | Descripción y Comportamiento en Backend |
| :--- | :--- | :--- | :--- |
| `busqueda` | `string` (opcional) | `?busqueda=norte` | Búsqueda parcial `mode: 'insensitive'` (`OR` sobre campos clave: `nombre`, `apellido`, `dni`, `ubicacion`, `email`, etc.). |
| `estado` | `'todos' \| 'activos' \| 'inactivos'` (opcional) | `?estado=inactivos` | Filtra los `items` de la página actual según el tab seleccionado. Si es `'todos'` o `undefined`, devuelve tanto activos como inactivos. |
| `<filtroSecundario>` | `string \| number` (opcional) | `?rolId=1`, `?categoriaId=2`, `?disciplinaId=3`, `?tipo=DEPORTIVO` | Filtro específico del dominio asociado al `<Select leftIcon={<Filter />} />`. |
| `pagina` | `number` (`@IsInt() @Min(1)`, default `1`) | `?pagina=1` | Página actual solicitada por `<TablePagination>`. |
| `porPagina` | `number` (`@IsInt() @Min(1) @Max(100)`, default `10`) | `?porPagina=10` | Cantidad de filas por página (`skip: (pagina - 1) * porPagina`, `take: porPagina`). |
| `ordenarPor` | `string` (opcional) | `?ordenarPor=nombre` | Columna activa en `<HeaderOrdenable>`. Si no se envía, aplicar orden por defecto del dominio. |
| `orden` | `'asc' \| 'desc'` (opcional, default `'asc'`) | `?orden=desc` | Dirección del ordenamiento en Prisma (`orderBy`). |

---

### B. Estructura de Respuesta del Backend (`PaginatedResponse<T>`)

El servicio de Backend **DEBE** ejecutar un `this.prisma.$transaction([...])` con **5 consultas** simultáneas:
1. `findMany({ where, orderBy, skip, take, include/select })` → filas de la página y pestaña actual.
2. `count({ where })` → total de registros del tab activo (para el paginador `<TablePagination>`).
3. `count({ where: whereBase })` → total de **`todos`** (aplicando `busqueda` y `<filtroSecundario>`, pero **sin** filtrar por `activo`).
4. `count({ where: whereActivos })` → total de **`activos`** (`{ ...whereBase, activo: true }`).
5. `count({ where: whereInactivos })` → total de **`inactivos`** (`{ ...whereBase, activo: false }`).

```ts
// ✅ Respuesta obligatoria del Backend en GET /api/v1/<recurso>
export interface PaginatedResponse<T> {
  items: T[];
  total: number;      // Total de filas que coinciden con el tab actual (para TablePagination)
  pagina: number;
  porPagina: number;
  counts: {           // Contadores globales para StatusTabs (NUNCA se pierden al cambiar de pestaña)
    todos: number;
    activos: number;
    inactivos: number;
  };
}
```

> **Prohibición estricta:**
> Si el usuario hace clic en la pestaña **Inactivos** (`?estado=inactivos`) y hay `0` inactivos, `items` será `[]` y `total` será `0`, pero **`counts` DEBE seguir devolviendo `{ todos: 3, activos: 3, inactivos: 0 }`**. Nunca calcules los contadores de `StatusTabs` haciendo `.filter()` únicamente sobre el array ya filtrado por estado.

---

## 2. Implementación Tipo en Backend (NestJS + Prisma)

```ts
// Ejemplo estándar en <recurso>.service.ts
const whereBase: Prisma.EntidadWhereInput = {
  ...(tipo ? { tipo } : {}),
  ...(busqueda?.trim()
    ? {
        OR: [
          { nombre: { contains: busqueda.trim(), mode: 'insensitive' } },
          { ubicacion: { contains: busqueda.trim(), mode: 'insensitive' } },
        ],
      }
    : {}),
};

const whereActivos: Prisma.EntidadWhereInput = { ...whereBase, activo: true };
const whereInactivos: Prisma.EntidadWhereInput = { ...whereBase, activo: false };

let where: Prisma.EntidadWhereInput = whereBase;
if (estado === 'activos' || activo === true) {
  where = whereActivos;
} else if (estado === 'inactivos' || activo === false) {
  where = whereInactivos;
}

const [items, total, totalTodos, totalActivos, totalInactivos] =
  await this.prisma.$transaction([
    this.prisma.entidad.findMany({
      where,
      orderBy,
      skip: (pagina - 1) * porPagina,
      take: porPagina,
      include: ENTIDAD_INCLUDE,
    }),
    this.prisma.entidad.count({ where }),
    this.prisma.entidad.count({ where: whereBase }),
    this.prisma.entidad.count({ where: whereActivos }),
    this.prisma.entidad.count({ where: whereInactivos }),
  ]);

return {
  items,
  total,
  pagina,
  porPagina,
  counts: {
    todos: totalTodos,
    activos: totalActivos,
    inactivos: totalInactivos,
  },
};
```

---

## 3. Implementación Tipo en Frontend (React + TanStack Query)

En la página del listado (`<Recurso>Page.tsx`):

1. **Debounce de 300ms en la búsqueda:**
   Separar `textoInput` (estado inmediato del `<Input>`) de `busqueda` (valor debounced que se envía a la query y resetea `pagina` a `1`).
2. **Reseteo de página (`setPagina(1)`):**
   Siempre volver a `pagina = 1` cuando cambie `filtroEstado`, `busqueda`, el `<Select>` de filtro secundario, `porPagina` o `ordenarPor`/`orden`.
3. **Caché de contadores (`cachedCounts`):**
   Mantener el último `data.counts` válido en estado para que durante la transición (`isFetching`) los números de las pestañas `Todos`, `Activos` e `Inactivos` no parpadeen a `0`.
4. **Compatibilidad defensiva en el hook/página:**
   Soportar tanto la respuesta paginada `{ items, total, pagina, porPagina, counts }` como un arreglo plano `T[]` (por ejemplo, en mocks de tests unitarios simples).

```tsx
// ✅ Patrón estándar en <Recurso>Page.tsx
const items: Entidad[] = Array.isArray(data) ? data : (data?.items ?? []);
const totalItems = data && !Array.isArray(data) ? data.total : items.length;
const counts = data && !Array.isArray(data) && data.counts
  ? data.counts
  : cachedCounts;
```

---

## 4. Ciclo de Vida Completo del CRUD y Reglas de Negocio

| Operación | Ruta REST | Reglas Backend | Reglas Frontend (`ESTANDARES_UI_UX.md`) |
| :--- | :--- | :--- | :--- |
| **Listado** | `GET /api/v1/<recurso>` | Soporta `busqueda`, `estado`, filtro secundario, `pagina`, `porPagina`, `ordenarPor`, `orden`. Devuelve `{ items, total, pagina, porPagina, counts }`. | `StatusTabs` + `Input` (`Search`) + `TableExportMenu` + `Select` (`Filter`) + `HeaderOrdenable` + `TablePagination`. `<tbody>` sin `divide-y`; `<tr className="border-b border-slate-100 last:border-b-0">`. |
| **Detalle** | `GET /api/v1/<recurso>/:id` | Incluye relaciones activas; lanza `404 NotFoundException` si no existe. | Carga datos para vista de detalle o modal de edición. |
| **Alta** | `POST /api/v1/<recurso>` | Validado con `class-validator`, `409 ConflictException` en duplicados/superposiciones, persiste y audita (`accion: 'CREAR'`) dentro de `prisma.$transaction`. | Botón `<Plus size={16} /> Nuevo <recurso>`, formulario `max-w-2xl` con `React Hook Form` + `Zod`, alerta de conflicto `409`, banner de éxito e invalidación de query. |
| **Edición** | `PATCH /api/v1/<recurso>/:id` | Valida DTO parcial, verifica conflictos (`409`), actualiza y audita (`accion: 'MODIFICAR'`) en `prisma.$transaction`. | Acción de fila `variant="ghost" size="sm"` (`<Pencil size={14} /> Editar`). |
| **Baja Lógica** | `PATCH /api/v1/<recurso>/:id/desactivar` (o `/baja`) | **Prohibido `DELETE` físico.** Cambia `activo: false` y registra auditoría (`accion: 'BAJA'`) en `prisma.$transaction`. | Acción de fila `ghost` neutra (`text-slate-600 hover:bg-rose-50 hover:text-rose-700`) que abre `<ConfirmDialog variant="danger" />`. |
| **Reactivación** | `PATCH /api/v1/<recurso>/:id/reactivar` (o `/activar`) | Cambia `activo: true` y registra auditoría (`accion: 'REACTIVAR'`) en `prisma.$transaction`. | Acción de fila `ghost` (`text-emerald-700 hover:bg-emerald-50`) que abre `<ConfirmDialog variant="success" />`. |
