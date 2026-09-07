# Guía rápida — IA en el equipo Nullpointer

Cómo usamos la IA para **desarrollar y documentar más rápido**, sin bajar la calidad.
Léela una vez: son 5 minutos y te ahorra horas por sprint.

---

## ¿Por qué usar esto?
- **Menos tiempo en documentación**: los casos de prueba, los tests y la evidencia se generan y exportan solos, en nuestro formato.
- **Todos hacemos lo mismo**: el estándar (ramas, commits, Definition of Done, tipos de caso) lo aplica la IA automáticamente. Se acaba el "yo no sabía que se hacía así".
- **Testing de verdad**: probar deja de ser clickear la app; los tests corren solos en cada PR.
- **Está compartido**: todo vive en el repo. Si alguien mejora un skill, lo tenemos todos.

> La IA **acelera, no decide**. Todo lo que genera se revisa antes de entregar. Vos sos responsable del resultado.

---

## ¿Qué hay en el repo?
- **`CLAUDE.md`** (raíz): el "cerebro" que la IA lee sola al abrir el repo (nuestras convenciones).
- **`.claude/skills/`**: comandos reutilizables (se invocan escribiendo `/nombre`):
  | Skill | Para qué |
  |---|---|
  | `/casos-prueba` | Genera casos de prueba de una US, en nuestro formato |
  | `/exportar-casos` | Los lleva a la planilla (CSV) con IDs `TC-XXX` |
  | `/casos-a-tests` | Convierte los casos en tests automáticos (Jest/Vitest) |
  | `/ejecutar-pruebas` | Corre los tests y exporta la evidencia (Registro de Ejecución) |

---

## Primera vez (2 min)
1. Instalá **Claude Code** en VS Code (o usá `claude` en la terminal).
2. `git checkout dev && git pull` en **ambos repos** (backend y frontend).
3. Abrí Claude Code **dentro de la carpeta del repo** (no como chat suelto). Listo: ya lee el `CLAUDE.md` y ve los skills.

---

## El flujo por cada Historia de Usuario
1. Sacá tu rama: `git checkout dev && git checkout -b feature/US-XX-descripcion`.
2. Desarrollá la funcionalidad (podés pedirle a la IA que la implemente; respeta el `CLAUDE.md`).
3. **Casos de prueba** → escribí en Claude Code:
   `/casos-prueba US-XX <título + criterios de aceptación>`
   y después `/exportar-casos` para volcarlos a la planilla.
4. **Tests** → `/casos-a-tests` genera los tests desde esos casos.
5. **Ejecutar + evidencia** → `/ejecutar-pruebas` corre todo y te deja el CSV de evidencia.
6. Abrí el **Pull Request** a `dev` y enlazalo a la tarjeta de la US en GitHub Projects.
7. En el PR, el **CI corre lint + tests + cobertura** solo. Que quede en verde.

> Comandos manuales por si los necesitás:
> - Backend: `npm test` · `npm run test:cov`
> - Frontend: `npm test` · `npm run test:cov`

---

## Reglas de oro (importante)
- **Revisá siempre** lo que genera la IA: que el test pruebe lo que importa, que el caso tenga sentido.
- **No edites la evidencia a mano**: si un test falla, se arregla el código o el test, no el CSV.
- **Cobertura**: apuntamos al **70%** (DoD). El CI tiene un piso que solo sube; cuando agregás tests, subís ese piso.
- Si cambiamos una convención, se edita **`CLAUDE.md` una sola vez** (por PR) y aplica para todos.
- **No** pongas datos sensibles ni tokens en prompts ni en el repo.

---

## ¿Dudas o algo no anda?
- Revisá `CLAUDE.md` y el `SKILL.md` del skill correspondiente (`.claude/skills/<nombre>/SKILL.md`).
- La documentación fuente del proyecto está en Google Drive (ver `docs/README.md`).
