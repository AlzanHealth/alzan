# alzan

Monorepo de la app Alzan: `alzan-be/` (NestJS) + `alzan-fe/` (Expo / React Native) + `supabase/` (Postgres, migraciones y tipos).

Esta guía explica **qué hace cada comando** y **en qué orden** ejecutarlos. Todos se lanzan desde la raíz con `pnpm`.

---

## Requisitos previos

- **pnpm** (`packageManager` fijado en `package.json`).
- **Supabase CLI** — viene como dependencia del repo, así que se usa con `pnpm supabase ...` (no hace falta instalarlo aparte).
- **Docker** corriendo (lo necesita la Supabase local).
- Un **`.env` raíz** (copia de `.env.example`). Es la **única fuente de verdad** de variables de entorno.

### Variables de entorno (`.env`)

El `.env` raíz es el único que se edita a mano. Los `.env` por paquete (`alzan-be/.env`, `alzan-fe/.env`) se **generan** a partir de él y **no deben editarse directamente**.

| Comando         | Para qué sirve                                                                                                                                            |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm env:sync` | Regenera `alzan-be/.env` y `alzan-fe/.env` desde el `.env` raíz. Se ejecuta solo antes de cada `start`, pero puedes lanzarlo a mano tras tocar el `.env`. |

---

## 1. Desarrollo en local (Supabase local)

Flujo normal del día a día. Levanta una Supabase local en Docker y la app apuntando a ella.

**Orden:**

1. **Levantar Supabase local** (Postgres + Auth + Studio):

   ```bash
   pnpm supabase start
   ```

   - API: `http://127.0.0.1:54321` · Studio: `http://127.0.0.1:54323` · DB: `54322`.

2. **Aplicar migraciones + seeds y regenerar tipos** (primera vez o tras cambios de esquema):

   ```bash
   pnpm supabase db reset      # aplica supabase/migrations/ + supabase/seeds/*.sql
   pnpm run supabase:types     # regenera los tipos DB desde la instancia local
   ```

   - `db reset` reconstruye la DB local aplicando `supabase/migrations/` y luego `supabase/seeds/*.sql`.
   - `supabase:types` genera `supabase/database.types.ts` desde la instancia local y lo copia a BE y FE (ver detalle en la sección 2). Se ejecuta **después** del reset.

3. **Arrancar la app** (elige una):

   | Comando             | Qué arranca                                                                     |
   | ------------------- | ------------------------------------------------------------------------------- |
   | `pnpm start`        | BE (NestJS watch) + FE (Expo dev server). Desde Expo abres iOS / Android / Web. |
   | `pnpm start:web`    | BE + FE en **web** (Expo web en `FE_PORT`, por defecto `8082`).                 |
   | `pnpm start:be`     | Solo el backend (sincroniza env a **local** antes de arrancar).                 |
   | `pnpm start:fe`     | Solo el frontend (Expo dev server).                                             |
   | `pnpm start:fe:web` | Solo el frontend en web.                                                        |

   **Simulador nativo iOS/Android** (build nativo con `expo run`):

   ```bash
   pnpm supabase start   # 1) Supabase local (si no la tienes ya levantada)
   pnpm start:be         # 2) backend en una terminal
   pnpm ios              # 3) en otra terminal — sincroniza env local y lanza expo run:ios
   # (o `pnpm android` para Android)
   ```

   > `pnpm ios` / `pnpm android` hacen `env:sync` (local) y luego `npx expo run:ios/android` desde `alzan-fe/`. No arrancan Supabase ni el BE: esos los lanzas tú (pasos 1 y 2).

4. **Parar Supabase local** al terminar:
   ```bash
   pnpm supabase stop
   ```

---

## 2. Regenerar código generado (tras cambiar esquema o API)

> ⚠️ Nunca edites a mano los tipos generados ni el cliente OpenAPI.

### a) Tipos de base de datos (tras tocar el esquema / migraciones)

**Orden:** con la **Supabase local corriendo** →

```bash
pnpm supabase:types
```

Genera `supabase/database.types.ts` desde la instancia **local** y lo copia (junto con `requests.types.ts`) a `alzan-be/src/types/` y `alzan-fe/src/types/`, y formatea.

| Sub-comando               | Qué hace (normalmente no se llama a mano)     |
| ------------------------- | --------------------------------------------- |
| `pnpm supabase:gen`       | Genera `database.types.ts` desde la DB local. |
| `pnpm copy:db:types`      | Copia `database.types.ts` a BE y FE.          |
| `pnpm copy:request:types` | Copia `requests.types.ts` a BE y FE.          |

### b) Cliente API del frontend (tras tocar controllers/DTOs del BE)

**Orden:** con el **backend corriendo** →

```bash
pnpm openapi
```

Descarga el schema OpenAPI del backend y regenera el cliente tipado + hooks de TanStack Query en `alzan-fe/src/openapi/generated/`.

**Cadena de tipos (una sola dirección):** esquema Supabase → tipos DB generados → DTOs/Swagger del BE → cliente FE generado. Al tocar el modelo de datos o la API, regenera en cada paso.

---

## 3. Desarrollo contra Supabase en la nube (cloud)

Levanta el BE + FE (web o simulador) apuntando a la **Supabase de producción/nube** en vez de la local. Útil para probar contra datos y esquema reales.

> 🔒 **Bloqueado si tu rama tiene migraciones sin desplegar.** El guard compara las migraciones de `supabase/migrations/` en tu rama con las de `origin/main` (de donde se despliega cloud). Si tu rama **no añade ninguna migración**, arranca sin problema — da igual el nombre de la rama. Si añade alguna que aún no está en cloud (incluso sin commitear), se **niega a arrancar** para no apuntar a un esquema desincronizado.

### Antes de arrancar: aplicar migraciones a la nube

Las migraciones de `supabase/migrations/` llegan a la nube con `supabase db push`, **no** las lanzas tú a mano: lo hace el workflow [`Deploy Database Migrations`](.github/workflows/deploy-migrations.yml). Ese workflow es **manual** (`workflow_dispatch`), no se dispara solo al mergear.

**Si tu rama añade migraciones** (el guard te bloqueará hasta que estén en cloud):

1. Mergea el PR a `main`.
2. En GitHub: **Actions → Deploy Database Migrations → Run workflow** (ejecuta `supabase db push` contra la DB remota).
3. Tras desplegarlas, esas migraciones ya estarán en `origin/main` → el guard dejará pasar.

Si tu rama **no** añade migraciones, salta este paso: el guard ya te deja arrancar.

> ⚠️ El guard comprueba que tu rama no tenga migraciones por delante de `origin/main`; **no** sabe si el workflow ya corrió de verdad. Tras mergear, haz `git fetch` para que `origin/main` refleje lo desplegado. `db push` aplica solo migraciones (no corre seeds).

### Configuración (una sola vez)

1. Copia la plantilla y rellena las credenciales cloud (este archivo está **gitignored**, nunca se sube):
   ```bash
   cp .env.cloud.example .env.cloud
   ```
2. Pega en `.env.cloud` la `SUPABASE_URL`, la `SUPABASE_ANON_KEY` y la `SUPABASE_SERVICE_ROLE_KEY` del proyecto cloud (Supabase dashboard → Project Settings → API). El arranque se bloquea mientras queden valores sin rellenar.

### Comandos

| Comando                | Qué arranca (contra cloud)                                                                                          |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `pnpm start:web:cloud` | BE + FE en **web** contra cloud. Comando principal.                                                                 |
| `pnpm start:be:cloud`  | Solo el backend contra cloud.                                                                                       |
| `pnpm ios:cloud`       | Simulador **iOS** contra cloud (sincroniza env cloud y lanza `npx expo run:ios`).                                  |
| `pnpm android:cloud`   | Simulador **Android** contra cloud (`npx expo run:android`).                                                        |
| `pnpm env:sync:cloud`  | Regenera los `.env` por paquete con los valores de `.env.cloud` (lo hacen los comandos anteriores automáticamente). |

Cómo funciona: `.env.cloud` se **superpone** al `.env` raíz, sobrescribiendo **solo** las claves de Supabase; los puertos, el `BACKEND_URL` y el OAuth siguen en local (el backend corre en tu máquina, solo cambia la base de datos a la nube).

### Flujo web + simulador

```bash
pnpm start:web:cloud      # 1) BE + FE web contra cloud (deja esta corriendo)
pnpm ios:cloud            # 2) en otra terminal: engancha el simulador al mismo BE + cloud
```

`ios:cloud` / `android:cloud` **no** levantan un segundo backend: reutilizan el de `start:web:cloud`.

### Volver a local

Cualquier comando local (`pnpm start`, `pnpm start:web`, `pnpm env:sync`) **restaura** automáticamente los `.env` por paquete a los valores locales.

> ⚠️ **No crees `alzan-fe/.env.local` (ni `.env.<algo>`).** Expo da **más prioridad** a `.env.local` / `.env.<NODE_ENV>` que a `.env`, así que cualquier valor ahí **tapa** lo que `env:sync` genera y manda la app a la Supabase equivocada (síntoma típico: solo entras con usuarios del entorno viejo). `env:sync` gestiona `alzan-fe/.env`; no hace falta ningún `.env*.local`. El guard de cloud **bloquea el arranque** si detecta uno.
>
> ℹ️ **Caché de Metro al cambiar local ↔ cloud.** Las `EXPO_PUBLIC_*` se **inlinean en el bundle** en build-time. `env:sync` detecta cuando el target del FE cambia y **limpia la caché de Metro automáticamente** (equivalente a `expo start --clear`), solo en ese caso, para que el arranque local siempre quede en local y el cloud en cloud. No necesitas pasar `--clear` a mano; basta reiniciar el comando correspondiente.

---

## 4. Calidad y verificación (tras cualquier cambio de código)

| Comando                       | Qué hace                                                                            |
| ----------------------------- | ----------------------------------------------------------------------------------- |
| `pnpm format`                 | Formatea BE y FE (Prettier). Ejecútalo primero.                                     |
| `pnpm run lint:check`         | Lint de BE y FE. Solo un exit code distinto de 0 es fallo; los warnings se ignoran. |
| `pnpm typecheck`              | `tsc --noEmit` en BE y FE.                                                          |
| `pnpm verify:activity-import` | Suite de verificación de importación de actividades.                                |
| `pnpm verify:import-review`   | Verificación del flujo de import-review.                                            |

**Orden recomendado tras cambios:** `pnpm format` → `pnpm run lint:check` (→ `pnpm typecheck`).
</content>
