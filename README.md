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

## Referencia de comandos de `package.json`

Todos los comandos de esta sección se ejecutan desde la raíz con `pnpm <comando>`. Para ejecutar un script directamente dentro de un paquete usa `pnpm --prefix alzan-be run <comando>` o `pnpm --prefix alzan-fe run <comando>`.

La fuente de verdad de esta tabla son los tres `package.json` del repositorio. Cuando se añada un script nuevo, debe añadirse también aquí con su propósito y sus requisitos.

### Scripts de la raíz

| Comando                             | Para qué sirve y cómo se ejecuta                                                                                                                                                            |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm env:sync`                     | Copia la configuración local del `.env` raíz a los `.env` de BE y FE. Se usa al cambiar de cloud a local.                                                                                   |
| `pnpm env:sync:cloud`               | Copia la configuración de `.env.cloud` a BE y FE. Requiere `.env.cloud` configurado.                                                                                                        |
| `pnpm prestart`                     | Hook interno que ejecuta `env:sync` antes de los arranques locales. Normalmente no se ejecuta a mano.                                                                                       |
| `pnpm prestart:cloud`               | Hook interno que valida que no haya migraciones cloud desincronizadas y ejecuta `env:sync:cloud`.                                                                                           |
| `pnpm start`                        | Arranca BE y FE en paralelo para desarrollo. Ejecuta la sincronización de entorno local.                                                                                                    |
| `pnpm start:web`                    | Arranca BE y Expo Web en desarrollo. Es el flujo principal para probar la aplicación en navegador.                                                                                          |
| `pnpm start:web:cloud`              | Arranca BE y Expo Web contra Supabase cloud, después de pasar el guard de cloud.                                                                                                            |
| `pnpm be`                           | Arranca solo el backend NestJS en modo watch.                                                                                                                                               |
| `pnpm start:be`                     | Sincroniza el entorno local y arranca solo el backend.                                                                                                                                      |
| `pnpm start:be:cloud`               | Valida cloud, sincroniza el entorno cloud y arranca solo el backend contra cloud.                                                                                                           |
| `pnpm start:fe`                     | Arranca solo el servidor de desarrollo de Expo.                                                                                                                                             |
| `pnpm start:fe:web`                 | Arranca solo el frontend en web sin iniciar el backend.                                                                                                                                     |
| `pnpm ios`                          | Sincroniza entorno local y ejecuta el build nativo iOS con `expo run:ios`.                                                                                                                  |
| `pnpm android`                      | Sincroniza entorno local y ejecuta el build nativo Android con `expo run:android`.                                                                                                          |
| `pnpm ios:cloud`                    | Valida cloud, sincroniza el entorno cloud y ejecuta el build nativo iOS contra cloud.                                                                                                       |
| `pnpm android:cloud`                | Valida cloud, sincroniza el entorno cloud y ejecuta el build nativo Android contra cloud.                                                                                                   |
| `pnpm build:be`                     | Compila el backend NestJS en `alzan-be/dist`.                                                                                                                                               |
| `pnpm build:fe`                     | Ejecuta el prebuild de Expo del frontend. Para el bundle web usa `pnpm --prefix alzan-fe run build:web`.                                                                                    |
| `pnpm lint:check`                   | Ejecuta ESLint en BE y FE sin modificar archivos.                                                                                                                                           |
| `pnpm lint:fix`                     | Ejecuta ESLint con correcciones automáticas en BE y FE. Revisa el diff después.                                                                                                             |
| `pnpm format`                       | Formatea los archivos TypeScript de BE y los archivos de código del FE.                                                                                                                     |
| `pnpm format:check`                 | Comprueba el formato sin modificar archivos.                                                                                                                                                |
| `pnpm typecheck`                    | Ejecuta TypeScript sin emitir archivos en BE y FE.                                                                                                                                          |
| `pnpm verify:activity-import`       | Ejecuta la verificación de importación de actividades del backend.                                                                                                                          |
| `pnpm verify:import-review`         | Comprueba el flujo de revisión de importaciones del backend. Se salta si el entorno Supabase configurado no es local.                                                                       |
| `pnpm verify:steps-providers`       | Audita los proveedores de pasos del backend.                                                                                                                                                |
| `pnpm verify:oauth-redirect`        | Comprueba que las redirecciones OAuth solo aceptan los deep links nativos de Alzan o el origen web configurado.                                                                             |
| `pnpm verify:diet-copy`             | Ejecuta las pruebas del planificador de copia de dietas del frontend.                                                                                                                       |
| `pnpm seed:training`                | Ejecuta el seed/demo de entrenamiento del backend. Úsalo solo en el entorno local previsto.                                                                                                 |
| `pnpm install:all`                  | Instala las dependencias de BE y FE. Equivale a ejecutar `pnpm install` en ambos paquetes.                                                                                                  |
| `pnpm supabase:gen`                 | Genera `supabase/database.types.ts` desde la Supabase local. Requiere la instancia local levantada.                                                                                         |
| `pnpm supabase:types`               | Ejecuta `supabase:gen`, copia los tipos DB/request a BE y FE y formatea. Es el comando recomendado después de un reset o cambio de esquema local.                                           |
| `pnpm copy:db:types`                | Copia `supabase/database.types.ts` a los tipos del BE y FE sin regenerarlos.                                                                                                                |
| `pnpm copy:request:types`           | Copia `supabase/requests.types.ts` a los tipos del BE y FE.                                                                                                                                 |
| `pnpm supabase:export-static-seeds` | Exporta catálogos estáticos desde Supabase remota mediante lecturas paginadas y genera SQL en `supabase/seeds/`. Requiere `EXPORT_PRODUCTION_STATIC_SEEDS=1`; nunca apunta a una URL local. |
| `pnpm openapi`                      | Obtiene el schema OpenAPI del backend y regenera el cliente tipado del frontend. Requiere el backend accesible.                                                                             |

### Scripts del backend (`alzan-be/package.json`)

Ejecuta estos comandos con `pnpm --prefix alzan-be run <comando>`.

| Comando                   | Para qué sirve                                                                                          |
| ------------------------- | ------------------------------------------------------------------------------------------------------- |
| `build`                   | Compila NestJS en `alzan-be/dist`.                                                                      |
| `typecheck`               | Comprueba los tipos TypeScript sin generar archivos.                                                    |
| `start` / `start:dev`     | Arrancan NestJS en modo watch; son equivalentes.                                                        |
| `start:debug`             | Arranca NestJS en watch con el inspector de depuración.                                                 |
| `start:prod`              | Arranca el JavaScript compilado desde `dist/main`. Ejecuta `build` antes si no existe `dist`.           |
| `verify:activity-import`  | Verifica los parsers y reglas de importación de actividades.                                            |
| `verify:import-review`    | Ejecuta la comprobación de integración del flujo import-review.                                         |
| `verify:steps-providers`  | Audita la sincronización de pasos de los proveedores.                                                   |
| `verify:oauth-redirect`   | Verifica la lista blanca de redirecciones OAuth.                                                        |
| `seed:training`           | Carga los datos demo de entrenamiento definidos por el backend.                                         |
| `clear:sync-jobs`         | Limpia los trabajos de sincronización según la utilidad del backend. Revisa el entorno antes de usarlo. |
| `lint:check` / `lint:fix` | Comprueban ESLint o aplican sus correcciones en el backend.                                             |
| `format` / `format:check` | Formatean o comprueban el formato de los `.ts` del backend.                                             |

### Scripts del frontend (`alzan-fe/package.json`)

Ejecuta estos comandos con `pnpm --prefix alzan-fe run <comando>`.

| Comando                       | Para qué sirve                                                                                                                                    |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `start`                       | Arranca Expo en modo desarrollo.                                                                                                                  |
| `build`                       | Ejecuta `expo prebuild` para generar o actualizar el proyecto nativo.                                                                             |
| `ios` / `android`             | Ejecutan el proyecto nativo en iOS o Android mediante Expo.                                                                                       |
| `web`                         | Arranca Expo Web.                                                                                                                                 |
| `build:web`                   | Genera el bundle web en `alzan-fe/dist`.                                                                                                          |
| `serve:web`                   | Sirve `dist` como aplicación SPA local; ejecuta antes `build:web`.                                                                                |
| `typecheck`                   | Comprueba los tipos TypeScript del frontend.                                                                                                      |
| `format` / `format:check`     | Formatean o comprueban los archivos de código, estilos y JSON del frontend.                                                                       |
| `lint:check` / `lint:fix`     | Comprueban ESLint o aplican correcciones en el frontend.                                                                                          |
| `openapi:fetch`               | Descarga el schema OpenAPI desde el backend y formatea el resultado.                                                                              |
| `openapi:generate`            | Genera el cliente TypeScript y hooks desde el schema OpenAPI y formatea.                                                                          |
| `openapi`                     | Ejecuta `openapi:fetch` y después `openapi:generate`.                                                                                             |
| `verify:diet-copy`            | Ejecuta las pruebas del planificador de copia de dietas.                                                                                          |
| `verify:menu-import`          | Ejecuta contrato, planificación, persistencia, importación de cuatro semanas, estados, guardas, plantilla y lista de compra de nutrición.         |
| `verify:training-plan-import` | Ejecuta las pruebas de progresión, plantillas, contrato, análisis, resolución de ejercicios, planificación y calendario de importación deportiva. |
| `postinstall`                 | Hook automático que regenera el cliente OpenAPI después de instalar dependencias. No se suele ejecutar manualmente.                               |
| `eas-build-post-install`      | Hook usado por EAS Build para regenerar el cliente OpenAPI después de instalar dependencias.                                                      |

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

## 2. Sincronizar seeds estáticos desde producción (solo lectura)

Usa este flujo para actualizar en local los catálogos compartidos con producción: ingredientes, ejercicios, recetas, traducciones y opciones deportivas.

> 🔒 El script solo hace peticiones `GET` contra Supabase. No ejecuta `INSERT`, `UPDATE`, `DELETE`, `UPSERT`, RPC ni SQL remoto. Nunca modifica producción y rechaza automáticamente una URL local.

### Requisitos

- Ejecuta el comando desde la raíz del repositorio.
- Necesitas la URL remota y la `service_role key` de Supabase. No la guardes en Git ni la pegues en documentación.
- Docker/Supabase local no es necesario para exportar; sí lo necesitarás después para cargar los seeds con `db reset`.

### Exportar

La forma más segura es pasar las credenciales solo para ese proceso:

```bash
PRODUCTION_SUPABASE_URL="https://<proyecto>.supabase.co" \
PRODUCTION_SUPABASE_SERVICE_ROLE_KEY="<service-role-key>" \
EXPORT_PRODUCTION_STATIC_SEEDS=1 \
pnpm supabase:export-static-seeds
```

El script también lee estas variables desde `.env` o `alzan-be/.env`, pero las variables escritas en la línea de comandos tienen prioridad. `EXPORT_PRODUCTION_STATIC_SEEDS=1` es obligatorio y evita ejecuciones accidentales.

La exportación genera o reemplaza los SQL estáticos de `supabase/seeds/` (ejercicios, ingredientes, recetas, traducciones y opciones deportivas). No modifica `0_user.sql`, `9_health_data.sql` ni `10_training_templates.sql`.

Comprueba los cambios antes de resetear la base local:

```bash
git status --short
git diff --stat
```

Después, aplica los seeds únicamente en local:

```bash
pnpm supabase start       # si Supabase local no está levantada
pnpm supabase db reset
pnpm run supabase:types
```

Si aparece `Refusing to export from a local Supabase URL`, revisa que `PRODUCTION_SUPABASE_URL` apunte al proyecto remoto y no a `127.0.0.1` o `localhost`.

---

## 3. Regenerar código generado (tras cambiar esquema o API)

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

## 4. Desarrollo contra Supabase en la nube (cloud)

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
| `pnpm ios:cloud`       | Simulador **iOS** contra cloud (sincroniza env cloud y lanza `npx expo run:ios`).                                   |
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

## 5. Calidad y verificación (tras cualquier cambio de código)

| Comando                       | Qué hace                                                                            |
| ----------------------------- | ----------------------------------------------------------------------------------- |
| `pnpm format`                 | Formatea BE y FE (Prettier). Ejecútalo primero.                                     |
| `pnpm run lint:check`         | Lint de BE y FE. Solo un exit code distinto de 0 es fallo; los warnings se ignoran. |
| `pnpm typecheck`              | `tsc --noEmit` en BE y FE.                                                          |
| `pnpm verify:activity-import` | Suite de verificación de importación de actividades.                                |
| `pnpm verify:import-review`   | Verificación del flujo de import-review.                                            |

**Orden recomendado tras cambios:** `pnpm format` → `pnpm run lint:check` (→ `pnpm typecheck`).
</content>
