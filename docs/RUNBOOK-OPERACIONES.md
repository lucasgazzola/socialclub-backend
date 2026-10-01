# Runbook de operaciones — Azure, GitHub, Vercel

Cheatsheet para **operar** los entornos (no para entender por qué existen: eso está en [`DESPLIEGUE.md`](../DESPLIEGUE.md)).

Nace del promote `dev → test` del 2026-09-16 (backend [PR #43](https://github.com/lucasgazzola/socialclub-backend/pull/43), frontend [PR #70](https://github.com/lucasgazzola/socialclub-frontend/pull/70)). Sirve para repetir ese flujo, diagnosticar un deploy y no volver a disparar producción por accidente.

Convención de cada comando:

1. **Para qué** — qué pregunta responde o qué cambia.
2. **Por qué** — cuándo lo usás y qué riesgo evita.
3. **Ejemplo** — copiar, ajustar nombres si hace falta, pegar.

Los valores reales de secretos **no van acá**. Están en GitHub Environments (`test` / `production`) y, en local, en `CREDENCIALES.md` (gitignored).

---

## 0. Nombres fijos (tenerlos a mano)

| Qué | Valor |
|---|---|
| Resource group | `rg-socialclub` |
| Región | `brazilsouth` |
| Postgres Flexible | `psql-socialclub-8ea842` (admin `scadmin`, Postgres 16) |
| Bases | `socialclub_test` · `socialclub_main` (mismo servidor, **no mezclar**) |
| Container Apps env | `cae-socialclub` |
| API test | `ca-socialclub-api-test` |
| API main | `ca-socialclub-api-main` |
| Imagen | `ghcr.io/lucasgazzola/socialclub-backend` (`:test` / `:test-<sha>`, `:main` / `:main-<sha>`) |
| Front test | https://socialclub-frontend-test.vercel.app |
| Front main | https://socialclub-frontend-main.vercel.app |
| API test | https://ca-socialclub-api-test.agreeablehill-d095161e.brazilsouth.azurecontainerapps.io/api/v1 |
| API main | https://ca-socialclub-api-main.agreeablehill-d095161e.brazilsouth.azurecontainerapps.io/api/v1 |
| Swagger test | `…/api/docs` (apagado en main) |
| Health | `GET /api/v1/health` |
| Seed email | `admin@socialclub.local` |
| Seed password | **secret** `SEED_ADMIN_PASSWORD` del environment (no es `Admin123!` de local) |

Git Flow real: `feature/* → dev → test → main`. `dev` solo corre CI. Push a `test` despliega test. Push a `main` despliega producción **con aprobación manual**.

---

## 1. Antes de tocar nada

### `az account show`

**Para qué:** confirmar que Azure CLI está logueado y en la subscription correcta (`Azure for Students`).

**Por qué:** todos los `az postgres` / `az containerapp` operan sobre la subscription activa. Si estás en otra, o no hay login, los comandos fallan o (peor) apuntan a otro lado.

**Ejemplo:**

```bash
az account show --query '{name:name,id:id,user:user.name}' -o json
# si no hay sesión:
az login
```

### `gh auth status`

**Para qué:** ver con qué cuenta de GitHub trabaja `gh` (PRs, Actions, protección de ramas).

**Por qué:** sin `repo` + `workflow` no podés abrir PRs ni mirar checks. El protocolo SSH vs HTTPS no importa para `gh pr`, sí para `git push`.

**Ejemplo:**

```bash
gh auth status
# si falló:
gh auth login
```

### `git fetch origin`

**Para qué:** actualizar `origin/dev`, `origin/test`, `origin/main` sin mergear nada local.

**Por qué:** comparar ramas o abrir un PR contra un remoto viejo te hace creer que test está al día cuando no lo está. Siempre fetch antes de un promote.

**Ejemplo:**

```bash
cd "/home/lucas/Documents/Facultad/Proyecto Final/socialclub-backend"
git fetch origin
echo "DEV=$(git rev-parse --short origin/dev) TEST=$(git rev-parse --short origin/test) MAIN=$(git rev-parse --short origin/main)"
```

Lo mismo en `socialclub-frontend`. Son dos remotos distintos.

---

## 2. Git y GitHub

### Comparar `dev` vs `test`

**Para qué:** saber cuánto trabajo (y qué PRs) se va a llevar el promote.

**Por qué:** test puede llevar semanas atrás. Un promote no es “un commit”: el 2026-09-16 eran **102 commits** de backend y **154** de frontend.

**Ejemplo:**

```bash
git log --oneline origin/test..origin/dev | wc -l
git log --oneline --merges origin/test..origin/dev | head -40
git log -1 --format='%h %s %ci' origin/test
git log -1 --format='%h %s %ci' origin/dev
```

`A..B` = commits que están en `B` y no en `A`. Acá: “lo que test no tiene de dev”.

### `gh pr create --base <rama> --head <rama>`

**Para qué:** abrir un Pull Request con **base explícita**.

**Por qué (crítico):** en los dos repos la default de GitHub es `main`. `gh pr create` sin `--base` abre contra producción, dispara CD Main y, si la rama salía de `dev`, se lleva **todo `dev`**. Ya pasó (backend #39). La única excepción es un `hotfix/`, que va `--base main` y después también a `dev`.

Promoción a QA: `--base test`. Integración de una feature: `--base dev`.

**Ejemplo (backend → test):**

```bash
cd "/home/lucas/Documents/Facultad/Proyecto Final/socialclub-backend"
gh pr create --base test --head dev \
  --title "chore: sincroniza test con origin/dev" \
  --body "## Summary
- Trae a test lo ya integrado en dev.
- No toca main.
"
```

**Ejemplo (frontend → test):** mismo comando en `socialclub-frontend`.

Después **mirá el PR en el browser** y confirmá `base: test` (o `dev`) **antes** de avisar que está listo.

### `gh pr view` / `gh pr list` / `gh pr merge`

**Para qué:** estado, checks, mergeable, URL.

**Por qué:** el backend exige el check de CI llamado `test` para mergear a `test`. El frontend `test` **no** tiene branch protection; igual esperá el `build` verde. No mergees a `main` desde acá.

**Ejemplo:**

```bash
gh pr list --base test --state open
gh pr view 43 --json url,state,baseRefName,headRefName,mergeable,statusCheckRollup
# solo si pediste mergear y CI está verde:
gh pr merge 43 --merge
```

`--merge` = merge commit (el historial del equipo usa “Merge pull request #N”). No uses squash salvo que el equipo lo pida.

### `gh run list`

**Para qué:** ver si CD Test / CD Main / CI corrieron y si “success” significa que Azure quedó bien.

**Por qué:** CD Test puede poner **success** aunque el contenedor **falle al arrancar** (`prisma migrate deploy`). GitHub solo ve que `az containerapp update` devolvió 0. La verdad está en los logs de la revisión.

**Ejemplo:**

```bash
gh run list --workflow=cd-test.yml --limit 5
gh run list --limit 8
```

### Protección de ramas

**Para qué:** saber si un merge exige reviews o un job de CI.

**Por qué:** `test` del backend exige el job `test`. `test` del frontend no está protegida (un merge dispara Vercel al toque). `main` del backend tiene environment `production` con aprobación.

**Ejemplo:**

```bash
gh api repos/lucasgazzola/socialclub-backend/branches/test/protection \
  --jq '{required: .required_status_checks.contexts, reviews: .required_pull_request_reviews.required_approving_review_count}'
# 404 = "Branch not protected"
```

### Lo que **no** hay que hacer

```bash
# NO: saltea PR y CI, y en el backend dispara CD Test sin revisión
git push origin dev:test

# NO: equivale a promover a producción
git push origin dev:main
gh pr create --head dev          # sin --base → main
```

Promote = **PR con `--base test`**, CI verde, merge. El CD se dispara solo con el push a `test` que hace el merge.

---

## 3. Azure — Postgres

Un solo servidor, dos bases. Borrar `socialclub_test` **no** toca `socialclub_main`. Igual: nunca pases `-n socialclub_main` en un reset de QA.

### Listar servidor y bases

**Para qué:** confirmar que el Flexible Server está `Ready` y que existen las dos bases.

**Por qué:** si el servidor está parado (crédito, SKU), la API no arranca. Si alguien borró `socialclub_test`, el CD va a fallar al conectar.

**Ejemplo:**

```bash
az postgres flexible-server list -g rg-socialclub -o table
az postgres flexible-server db list -g rg-socialclub -s psql-socialclub-8ea842 -o table
```

El flag de la base es **`--name` / `-n`**, no `--database-name` (la CLI lo rechaza).

### Firewall

**Para qué:** ver quién puede entrar al puerto 5432 desde fuera de Azure.

**Por qué:** las Container Apps entran por `AllowAzureServices` (`0.0.0.0`). Tu notebook necesita una regla con tu IP pública. Hoy existe `DevTemp-lucas`; se puede borrar cuando no haga falta.

**Ejemplo:**

```bash
az postgres flexible-server firewall-rule list -g rg-socialclub -s psql-socialclub-8ea842 -o table
curl -sS ifconfig.me; echo   # tu IP pública actual
# si cambió el ISP y no conectás:
az postgres flexible-server firewall-rule create \
  -g rg-socialclub -s psql-socialclub-8ea842 \
  -n DevTemp-lucas \
  --start-ip-address 1.2.3.4 --end-ip-address 1.2.3.4
```

`create` falla si el nombre ya existe: usá `update` o borrala y creala de nuevo.

### Recrear `socialclub_test` (vaciar esquema)

**Para qué:** dejar la base de QA **vacía** para que `prisma migrate deploy` corra **todas** las migraciones desde cero.

**Por qué:** la migración `20260915050001_consolidar_usuario_persona_membresia_documentacion` hace `ALTER TABLE usuarios DROP dni, ADD personaId INTEGER NOT NULL` **sin backfill**. Sobre datos de agosto (usuarios con `dni`, sin `personaId`) **explota**. Prisma deja la migración en failed (`P3009`) y los arranques siguientes no aplican nada nuevo.

Hace falta cuando:

- test tiene el esquema viejo (último CD exitoso de agosto, por ejemplo);
- una migración failed quedó registrada en `_prisma_migrations`;
- la revisión **vieja** sembró el esquema de agosto sobre una base recién vaciada (carrera: ver §9).

**Ejemplo:**

```bash
# 1) apagar la revisión vieja para que no reconecte (ver §4)
# 2) borrar y crear
az postgres flexible-server db delete -g rg-socialclub -s psql-socialclub-8ea842 -n socialclub_test --yes
az postgres flexible-server db create -g rg-socialclub -s psql-socialclub-8ea842 -n socialclub_test \
  --charset UTF8 --collation en_US.utf8
az postgres flexible-server db list -g rg-socialclub -s psql-socialclub-8ea842 -o table
```

`--yes` saltea el prompt. El `create` tarda ~30–40 s. El admin `scadmin` sigue siendo dueño de la base nueva; no hay que re-grantar.

**Nunca** hagas esto contra `socialclub_main`.

---

## 4. Azure — Container Apps

### Estado de la app

**Para qué:** FQDN, imagen que está corriendo, si Azure la ve Running, réplicas min/max.

**Por qué:** “CD success” ≠ “la API responde”. Acá ves qué tag de ghcr está desplegado (`test-<sha>`) y si el ingress existe.

**Ejemplo:**

```bash
az containerapp show -g rg-socialclub -n ca-socialclub-api-test \
  --query '{fqdn:properties.configuration.ingress.fqdn,image:properties.template.containers[0].image,running:properties.runningStatus,provisioning:properties.provisioningState,scale:properties.template.scale}' \
  -o json
```

`minReplicas: 0` + `maxReplicas: 1` = **scale to zero**. Sin tráfico la réplica se apaga (ahorra crédito). El primer `curl` después de un rato puede tardar 30–90 s (cold start = migrate + seed + Nest).

### `--max-replicas 0` no existe

**Para qué:** (intento de apagar la app para vaciar la DB sin conexiones).

**Por qué lo documentamos:** Azure responde `ERROR: --max-replicas must be in the range [1,1000]`. Para “apagar” usá **desactivar la revisión**, no el scale.

### Revisiones: listar / desactivar / restart

Una **revisión** es una versión inmutable de la app (imagen + env). El CD, al hacer `az containerapp update --image`, crea una revisión nueva. La vieja puede seguir viva y **seguir ejecutando el entrypoint** (migrate + seed) contra la misma DB.

**Para qué:** ver cuál imagen está activa, cortar la de agosto, reiniciar la nueva después de vaciar la DB.

**Por qué:** el 16/09 la revisión `0000004` (imagen de agosto) y la `0000005` (imagen de `dev`) corrieron a la vez. La vieja aplicó `init` + `configurar_cuotas` + seed sobre la DB vacía; la nueva intentó `consolidar` encima y Prisma dejó `P3009`.

**Ejemplo:**

```bash
az containerapp revision list -g rg-socialclub -n ca-socialclub-api-test \
  --query '[].{name:name,active:properties.active,replicas:properties.replicas,running:properties.runningState,health:properties.healthState,image:properties.template.containers[0].image,created:properties.createdTime}' \
  -o table

# cortar la revisión que no tiene que tocar la DB
az containerapp revision deactivate -g rg-socialclub -n ca-socialclub-api-test \
  --revision ca-socialclub-api-test--0000004

# después de recrear la DB, relanzar la revisión NUEVA (entrypoint: migrate + seed)
az containerapp revision restart -g rg-socialclub -n ca-socialclub-api-test \
  --revision ca-socialclub-api-test--0000005
```

`deactivate` sobre la **única** revisión activa a veces la Azure reactiva sola (single revision mode). Si ves que la vieja volvió a `Running`, desactivala de nuevo **después** de que la nueva esté `Healthy`.

Hoy test está en **single revision mode**: `az containerapp ingress traffic set --revision-weight …` falla con *“configured for single revision”*. No hace falta cambiarlo para operar; el CD actualiza “la” revisión.

### Ingress (URL pública)

**Para qué:** la API es alcanzable en `https://<fqdn>/api/v1`.

**Por qué:** desactivar revisiones / `ingress disable` puede dejar `fqdn: null`. El CD, en el camino *update* (app ya existente), **solo** hace `--image` y `--set-env-vars`: **no rehabilita el ingress**. Si lo apagás, tenés que prenderlo a mano o el front de Vercel habla con un 404/timeout.

**Ejemplo:**

```bash
az containerapp ingress show -g rg-socialclub -n ca-socialclub-api-test \
  --query '{external:properties.external,fqdn:properties.fqdn,targetPort:properties.targetPort}' -o json

# si fqdn es null:
az containerapp ingress enable -g rg-socialclub -n ca-socialclub-api-test \
  --type external --target-port 3000 --transport auto
```

No deshabilites el ingress “para que escale a cero”: `minReplicas: 0` ya lo hace, y sin ingress no hay forma de probar.

### Logs

**Para qué:** ver `prisma migrate deploy`, seed y el boot de Nest.

**Por qué:** es el único lugar donde aparece `Error: P3009`, “All migrations have been successfully applied” o “Seed completado”. `--follow` es un stream; `--tail N` es un snapshot.

**Ejemplo:**

```bash
az containerapp logs show -g rg-socialclub -n ca-socialclub-api-test --follow
az containerapp logs show -g rg-socialclub -n ca-socialclub-api-test \
  --revision ca-socialclub-api-test--0000005 --tail 80 --type console
```

Buscá: `[entrypoint]`, `migrations/`, `All migrations`, `Seed completado`, `Error: P`, `escuchando`.

Si la app ya escaló a cero, el `grep` puede devolver vacío: despertála con un `curl` al health y volvé a pedir logs.

### CORS / env visibles (no secretos)

`CORS_ORIGIN` está como env-var (no secretref). El CD la pisa con el secret del GitHub Environment `test` en cada deploy. Si el preflight al origen de Vercel no manda `access-control-allow-origin`, el login del browser falla aunque la API esté viva.

Rotar un env no secreto:

```bash
az containerapp update -g rg-socialclub -n ca-socialclub-api-test \
  --set-env-vars "CORS_ORIGIN=https://socialclub-frontend-test.vercel.app"
```

Rotar `DATABASE_URL` / `JWT_SECRET` / `SEED_ADMIN_PASSWORD`: cambiar el **GitHub Environment secret** y volver a desplegar (el CD hace `az containerapp secret set`). No intentes leer el valor con `az`: Azure no te lo devuelve.

---

## 5. Probar la API (curl)

Sustituí `$API` por la URL de test (sin barra final en el host; el path sí lleva `/api/v1`).

```bash
API="https://ca-socialclub-api-test.agreeablehill-d095161e.brazilsouth.azurecontainerapps.io"
```

### Health

**Para qué:** ¿el contenedor nuevo está escuchando? ¿cold start terminó?

**Por qué:** `200` + `{"status":"ok",...}` es el criterio mínimo de “test está up”. Un timeout de 20 s suele ser scale-to-zero: reintentá con `--max-time 90`.

**Ejemplo:**

```bash
curl -sS -D - --max-time 90 "$API/api/v1/health"
```

### Swagger

**Para qué:** confirmar que es la imagen de test (`SWAGGER_ENABLED=true`) y que Nest terminó de mapear rutas.

**Ejemplo:**

```bash
curl -sS -o /dev/null -w "swagger_http=%{http_code}\n" --max-time 30 "$API/api/docs"
```

`200` en test, no esperado en main.

### Preflight CORS

**Para qué:** el browser, desde Vercel, manda `OPTIONS` antes del `POST /auth/login`.

**Por qué:** si no aparece `access-control-allow-origin: https://socialclub-frontend-test.vercel.app`, el SPA no puede loguear aunque Postman sí.

**Ejemplo:**

```bash
curl -sS -D - -o /dev/null --max-time 30 -X OPTIONS "$API/api/v1/auth/login" \
  -H "Origin: https://socialclub-frontend-test.vercel.app" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: content-type"
```

### Login del seed

**Para qué:** validar usuario admin + cookie JWT.

**Por qué:** en **local** el seed usa `Admin123!`. En Azure usa `SEED_ADMIN_PASSWORD` del environment. Un `401 Credenciales inválidas` con `Admin123!` **no** significa que la API esté rota: significa que la clave de test es otra. Leela en GitHub → Settings → Environments → `test`, o en `CREDENCIALES.md`.

**Ejemplo:**

```bash
curl -sS -D - --max-time 20 -X POST "$API/api/v1/auth/login" \
  -H "Content-Type: application/json" \
  -H "Origin: https://socialclub-frontend-test.vercel.app" \
  -d '{"email":"admin@socialclub.local","password":"PEGAR_LA_DEL_ENVIRONMENT"}'
```

`200` + `set-cookie` = sesión ok. No commitees la password.

Señales de que **sí** es la API nueva (no la de agosto): rutas en logs como `/api/documentacion`, `/api/cuota-social`, `/api/inscripcion`, `/api/entradas/validar`.

---

## 6. Vercel (frontend)

No hay GitHub Action de deploy: cada proyecto Vercel trackea una rama.

| Proyecto | Rama | URL |
|---|---|---|
| `socialclub-frontend-test` | `test` | https://socialclub-frontend-test.vercel.app |
| `socialclub-frontend-main` | `main` | https://socialclub-frontend-main.vercel.app |

`VITE_API_URL` es **build-time**. Cambiar la API de un entorno = Settings → Environment Variables → rebuild. Un merge a `test` dispara el build de test **y** a veces un preview en el otro proyecto (esperado; se puede ignorar).

**Promote del front:**

```bash
cd "/home/lucas/Documents/Facultad/Proyecto Final/socialclub-frontend"
git fetch origin
gh pr create --base test --head dev --title "chore: sincroniza test con origin/dev"
# mergear cuando CI `build` esté verde
```

Orden sano: **primero** API test healthy (health + CORS), **después** merge del front. Si mergeás el SPA contra una API vieja o caída, el entorno “funciona” visualmente y explota en runtime.

CLI de Vercel (opcional, si está instalada):

```bash
npx vercel ls
npx vercel inspect https://socialclub-frontend-test.vercel.app
```

Lo habitual es mirar el check `Vercel – socialclub-frontend-test` en el PR.

---

## 7. Receta: promover `dev` → `test` sin romper nada

Hacerlo **en este orden**. No ir a `main`.

1. **Fetch y diff** en backend y frontend (`git fetch`, contar `origin/test..origin/dev`).
2. **Login** `az` + `gh`.
3. **¿La DB de test puede aplicar las migraciones de `dev`?** Si hay esquema viejo o una consolidación sin backfill: desactivar la revisión **vieja**, recrear `socialclub_test`, no dejar que la imagen de agosto vuelva a arrancar.
4. **PR backend** `gh pr create --base test --head dev`. Esperar job `test` verde. Merge.
5. **CD Test** construye imagen (~3 min) y hace `containerapp update`. Eso **no** garantiza migrate ok.
6. **Verificar:** revisión nueva `Healthy`, logs con “All migrations” + “Seed completado”, `curl` health / swagger / CORS. Si migrate failed (`P3009`): recrear DB otra vez con la revisión vieja **a cero réplicas**, `revision restart` de la nueva, re-enable ingress si el FQDN se fue.
7. **PR frontend** `gh pr create --base test --head dev`. Merge cuando `build` esté verde y la API ya responda.
8. Probar el SPA en https://socialclub-frontend-test.vercel.app con el admin del environment `test`.

Backend y frontend se mergean **por separado** (dos repos). El CD de la API no espera al front, y Vercel no espera a Azure: el orden lo ponés vos.

---

## 8. Docker (local y por si Azure no alcanza)

```bash
docker compose up -d db          # Postgres local del backend
npx prisma db push && npm run prisma:seed
```

El entrypoint de la imagen `prod` (la que corre en Azure) hace `migrate deploy` + seed, **no** `db push`. Para reproducir un fallo de migración en local:

```bash
npx prisma migrate deploy        # contra una DB que imite test, no contra prod
```

No hace falta Docker para operar Azure si tenés `az` + `gh`. Docker sí para desarrollo y para un Postgres 16 local compatible.

---

## 9. Lecciones de la promoción del 2026-09-16

| Qué pasó | Qué hacer la próxima |
|---|---|
| `gh pr create` sin `--base` mergeó `dev` entero a `main` (#39). Se revirtió con hotfix #41. | Siempre `--base test` o `--base dev`. Mirar el PR. |
| `az containerapp update --max-replicas 0` es inválido. | `revision deactivate`. |
| Recrear la DB con la imagen de agosto todavía viva = esquema viejo + seed viejo + `consolidar` failed (`P3009`). | Vieja en 0 réplicas **antes** de `db delete`. Restart **solo** de la imagen nueva. |
| CD Test “success” con la revisión nueva `Unhealthy`. | Leer logs, no el check de GitHub. |
| Ingress en `fqdn: null` después de jugar con revisiones. | `ingress enable --target-port 3000`. El YAML de CD no lo repara en updates. |
| Login `Admin123!` → 401 en test. | Password de seed ≠ local. GitHub Environment `test`. |
| `az postgres … --database-name` no existe. | `-n` / `--name`. |
| `git push origin dev:test` en `DESPLIEGUE.md` (texto viejo). | Usar PR. Ese push saltea revisión y, en backend, dispara CD al toque. |

---

## 10. Producción (`main`)

Mismos comandos, otros nombres: `ca-socialclub-api-main`, `socialclub_main`, environment GitHub `production`, Vercel `socialclub-frontend-main`.

**No** recrear `socialclub_main` como parte de un promote a test. **No** mergear a `main` sin acuerdo del equipo y aprobación del environment. Un hotfix: rama desde `main`, PR `--base main`, y después cherry-pick/PR a `dev`.
