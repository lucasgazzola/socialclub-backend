# Evidencia de pruebas · US-54

## Corrección del mock de edición de eventos

Fecha de verificación: 11/10/2026  
Componente: `socialclub-frontend/src/features/eventos/pages/EventosPage.test.tsx`

Se incorporó `useActualizarEvento` al mock de `../hooks/useEventos` y se
configuró su retorno simulado en `beforeEach`. Esto permite que
`EventosPage` se renderice en los escenarios de creación, permisos y cierre
del modal sin fallar por una exportación ausente en Vitest.

### Evidencia automatizada

Comando ejecutado desde `socialclub-frontend`:

```text
npx vitest run src/features/eventos/pages/EventosPage.test.tsx --reporter=verbose
```

Resultado:

```text
Test Files  1 passed (1)
Tests       5 passed (5)
```

Casos verificados:

- Mostrar el enlace de compra de entradas y su ruta.
- Ocultar «Nuevo evento» para usuarios sin rol administrativo.
- Abrir el alta de evento en un modal.
- Crear el evento y cerrar el modal al confirmar.
- Cerrar el modal con Escape sin crear el evento.

### Verificaciones complementarias

| Comando | Resultado |
|---|---|
| `npm run typecheck` | Aprobado |
| `npm run lint` | Aprobado, 0 errores; permanecen 3 advertencias preexistentes |
| `npm run build` | Aprobado |

La ejecución completa de `npm test` quedó detenida por tiempo en un test
preexistente de `RegisterForm`, con una advertencia de `act(...)`; la suite
específica de EventosPage sí finalizó correctamente.

