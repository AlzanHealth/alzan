# Integración COROS

## Modelo de conexión

COROS envía los entrenamientos a Alzan mediante su Partner API directa. Alzan nunca recibe ni almacena la contraseña de COROS: el usuario autoriza en la pantalla oficial de COROS y el backend guarda únicamente los tokens cifrados.

La API directa permite consultar actividades en ventanas inclusivas de hasta 30 días y solo ofrece los últimos tres meses naturales (API V2.1.1, sección 4.2). Cada sincronización revisita ese periodo para recuperar fallos antiguos y FIT pendientes; el control persistente de importación omite las actividades completas. Puede requerir cuatro ventanas según el calendario. El histórico anterior se importa mediante archivos FIT exportados desde COROS Training Hub.

## Flujo de actividades

1. El usuario pulsa `Conectar COROS` en `Ajustes → Integraciones`.
2. Alzan genera un `state` de un solo uso y redirige al OAuth directo de COROS.
3. COROS vuelve a `/oauth/coros/callback`.
4. Alzan cifra y guarda los tokens en `provider_connection_tokens` y conserva la conexión en `user_connections`.
5. Alzan sincroniza las actividades disponibles, descarga el FIT cuando COROS lo ofrece y escribe todo mediante el escritor canónico.
6. Las nuevas actividades pueden llegar por webhook o mediante `Sincronizar ahora`.

El resumen se guarda aunque el FIT no esté disponible. La actividad queda marcada como pendiente de enriquecimiento y se reintenta en una sincronización posterior. El límite diario real de FIT no convierte una sincronización parcial en un falso éxito.

Un FIT ausente, corrupto o no descargable deja el resultado como parcial. Los datos que COROS no proporciona no se inventan. `avgSpeed` del resumen es ritmo en segundos/km, `calorie` se convierte a kcal y los códigos horarios representan intervalos de 15 minutos. `planWorkoutId` se conserva como referencia del proveedor, no como un UUID de plantilla Alzan. Las asociaciones se resuelven mediante el mismo escritor y reglas que Suunto, respetando las elecciones manuales.

La tarjeta distingue carga, fallo de consulta con reintento, configuración incompleta y acceso restringido. La respuesta autenticada de disponibilidad añade `reason`: `ready`, `not_configured` o `restricted`, sin revelar secretos.

## Activación paso a paso

### 1. Datos que debes recibir

Solicita a COROS el Client ID y Client Secret **OAuth**, el entorno autorizado y la confirmación del callback. El `client` y `secret` del webhook son otros datos: son opcionales para conectar y sincronizar manualmente, pero necesarios para recibir actividades automáticamente.

No hace falta introducir contraseñas de usuarios ni access/refresh tokens. Cada usuario los obtiene al autorizar desde COROS. Esta integración no incorpora el nuevo webhook de salud diaria ni envío de plantillas al reloj; mantiene la consulta de salud existente con consentimiento independiente.

### 2. Desarrollo local

Edita **`.env` en la raíz del repositorio**, no `alzan-be/.env`: este último es generado y podría sobrescribirse. Usa este bloque, sustituyendo los valores entre `<...>`:

```dotenv
COROS_API_BASE_URL=https://opentest.coros.com
COROS_CLIENT_ID=<Client ID OAuth de COROS>
COROS_CLIENT_SECRET=<Client Secret OAuth de COROS>
COROS_REDIRECT_URI=http://localhost:1111/oauth/coros/callback
COROS_ROLLOUT_MODE=pilot
COROS_PILOT_USER_IDS=<UUID de tu usuario Alzan>
COROS_TOKEN_ENCRYPTION_KEY_V1=<clave propia de 32 bytes en base64>
COROS_FIT_ALLOWED_HOSTS=oss.coros.com
COROS_WEBHOOK_CLIENT=
COROS_WEBHOOK_SECRET=
```

Ese callback local necesita estar autorizado por COROS. Si COROS no autoriza localhost, utiliza un backend HTTPS de pruebas con un callback registrado; debe trabajar con la misma base de datos que la app de pruebas. No apuntes el callback de producción a una app que utiliza otra base de datos. El webhook requiere una URL pública HTTPS: no funciona con localhost.

Para obtener tu UUID, abre el proyecto Supabase correspondiente → Authentication → Users → tu usuario → copia su UID. Usa la cuenta del entorno de pruebas, no una de otro proyecto. Para varios usuarios, separa los UUID con comas.

Genera la clave propia **una sola vez** en tu terminal:

```sh
openssl rand -base64 32
```

Copia el resultado en `COROS_TOKEN_ENCRYPTION_KEY_V1` y consérvalo en tu gestor de secretos. No lo envíes al chat ni lo regeneres al reiniciar: cambiarlo impide descifrar las conexiones existentes. No reutilices la clave de producción en pruebas.

Desde la raíz, sincroniza los archivos y arranca/reinicia el backend:

```sh
pnpm env:sync
pnpm --prefix alzan-be start:dev
```

Si utilizas `env:sync:cloud`, recuerda que los valores presentes en `.env.cloud` sustituyen los de `.env`. No se ha rellenado ni cambiado ninguno de tus archivos privados como parte de esta implementación.

### 3. Producción en Google Cloud

El servicio declarado en `cloudbuild.yaml` es **`alzan-backend`**, región **`europe-west1`**. En el proyecto Google Cloud donde esté desplegado:

1. Abre Secret Manager y crea secretos para `COROS_CLIENT_SECRET`, `COROS_TOKEN_ENCRYPTION_KEY_V1` y, si está habilitado el webhook, `COROS_WEBHOOK_SECRET`. Pega cada valor en su secreto, sin comillas. Genera una clave de cifrado exclusiva de producción si aún no existe.
2. Concede a la cuenta de servicio de ejecución de `alzan-backend` el rol Secret Manager Secret Accessor sobre esos secretos concretos.
3. En Cloud Run → `alzan-backend` → editar/desplegar nueva revisión → variables y secretos, vincula cada secreto a la variable de entorno con el mismo nombre. Selecciona su versión concreta.
4. Añade como variables normales: `COROS_CLIENT_ID`, `COROS_API_BASE_URL`, `COROS_REDIRECT_URI`, `COROS_ROLLOUT_MODE`, `COROS_PILOT_USER_IDS`, `COROS_FIT_ALLOWED_HOSTS` y, si procede, `COROS_WEBHOOK_CLIENT`.
5. Usa como callback `https://api.alzanhealth.com/oauth/coros/callback`. Empieza con `pilot` y tu UUID. Usa `https://open.coros.com` y abre el modo `public` solo cuando COROS autorice ese acceso. En modo público no se necesitan UUID piloto.
6. Despliega la nueva revisión con el código actualizado del backend y publica también el frontend actualizado. `cloudbuild.yaml` actualiza la imagen y conserva la configuración del servicio; no contiene secretos.

No pegues estas credenciales en variables `EXPO_PUBLIC_*`, en el frontend, en Git ni en Cloud Build.

### 4. Comprobación al recibir las credenciales

En local, con el backend arrancado:

```sh
node scripts/verify-coros-readiness.js --base-url=http://localhost:1111 --env-file=.env --require-config
```

El comando comprueba configuración y rutas; **no sustituye una autorización real**. En producción comprueba las rutas públicas con `node scripts/verify-coros-readiness.js --base-url=https://api.alzanhealth.com`; que marque configuración pendiente es normal si los secretos solo están en Cloud Run.

En Alzan abre Ajustes → Integraciones → COROS → Continuar. Autoriza en la página oficial, vuelve a Alzan y pulsa Sincronizar. Comprueba una actividad con vueltas conocidas: totales, hora, mapa, intervalos, métricas y plantilla asociada. Repite la sincronización: no deben aparecer duplicados. Un resultado parcial debe explicar los FIT pendientes, no presentarse como importación completa. Si no hay coincidencia inequívoca, revisa/asocia la plantilla manualmente.

Las migraciones existentes de importación, cola COROS y reintentos de FIT deben estar aplicadas en el entorno de destino. Este cambio no introduce migraciones ni las ejecuta remotamente. Sin credenciales, archivos reales COROS y esta prueba de extremo a extremo, la integración queda validada mediante pruebas locales, no certificada contra el proveedor.

## Histórico anterior a tres meses

En COROS Training Hub: `Activity List → Export Data → FIT`. En Alzan, abre la tarjeta COROS conectada y pulsa `Importar histórico`. Se pueden seleccionar varios archivos FIT en una operación.

Cada archivo se valida como FIT, se deduplica por el identificador COROS y por la huella del archivo, y se escribe con `source_channel=file_import` y `source_package=coros_training_hub`. Si un archivo no se puede leer, el resto continúa y la interfaz muestra el nombre y la causa del fallo.

## Deportes y datos

El mapper directo cubre running, trail, ciclismo, natación, triatlón/multisport, senderismo, fuerza/gimnasio, esquí, snowboard, escalada, fútbol, baloncesto, tenis, pádel, surf, remo, artes marciales, golf, volleyball, Hyrox y variantes reconocidas por COROS. Los deportes sin equivalente exacto se conservan como `other` junto con el nombre y los campos originales.

Se conservan, cuando COROS los entrega:

- resumen, fecha, duración, distancia, calorías y dispositivo;
- frecuencia cardíaca, velocidad, distancia, altitud, cadencia, potencia y temperatura;
- vueltas, zonas de frecuencia cardíaca y ruta GPS;
- métricas específicas del deporte y campos COROS;
- los tramos multisport en el mismo orden en que fueron recibidos.

En fuerza/gimnasio no se inventan ejercicios, series ni repeticiones que no estén presentes en el FIT o en la respuesta de COROS.

## Endpoints de Alzan

| Método   | Ruta                                | Auth                                 | Finalidad                                                   |
| -------- | ----------------------------------- | ------------------------------------ | ----------------------------------------------------------- |
| `GET`    | `/oauth/coros/authorize`            | Supabase                             | Generar `state` y URL OAuth directa de COROS                |
| `GET`    | `/oauth/coros/callback`             | Pública                              | Intercambiar `code`, cifrar tokens y guardar `openId`       |
| `GET`    | `/wearables/cloud/coros/capability` | Supabase                             | Aplicar rollout `disabled`, `pilot` o `public`              |
| `POST`   | `/wearables/cloud/coros/sync`       | Supabase                             | Sincronizar actividades y salud con consentimiento separado |
| `POST`   | `/activity-imports/coros/history`   | Supabase                             | Importar uno o varios FIT históricos                        |
| `DELETE` | `/wearables/connections/coros`      | Supabase                             | Revocar y borrar datos COROS                                |
| `POST`   | `/webhooks/coros/workouts`          | `client_id` + `secret` headers COROS | Persistir el push antes de responder                        |
| `GET`    | `/webhooks/coros/status`            | Pública                              | Comprobación `{"status":"ok"}`                              |

El webhook admite hasta 100 elementos y 2 MiB. Los eventos se persisten antes de responder y una cola duradera los reprocesa. La identidad `labelId` evita duplicados entre webhook y sincronización manual.

## Variables de entorno

```dotenv
COROS_API_BASE_URL=https://opentest.coros.com
COROS_CLIENT_ID=<issued-by-coros>
COROS_CLIENT_SECRET=<issued-by-coros>
COROS_REDIRECT_URI=https://api.alzanhealth.com/oauth/coros/callback
COROS_ROLLOUT_MODE=pilot
COROS_PILOT_USER_IDS=<authorized-supabase-user-uuid>
COROS_TOKEN_ENCRYPTION_KEY_V1=<32-byte-base64-key>
COROS_FIT_ALLOWED_HOSTS=oss.coros.com
COROS_WEBHOOK_CLIENT=<issued-or-confirmed-by-coros>
COROS_WEBHOOK_SECRET=<issued-or-confirmed-by-coros>
```

La clave se genera una sola vez y se conserva en Secret Manager:

```sh
openssl rand -base64 32
```

No se escriben secretos en Git, Cloud Build ni Expo. Para producción, usar `https://open.coros.com` solo después de la aprobación escrita de COROS.

## URLs de producción

```text
Application URL: https://alzanhealth.com
Authorized callback domain: https://api.alzanhealth.com
OAuth redirect URI: https://api.alzanhealth.com/oauth/coros/callback
Workout receiving endpoint: https://api.alzanhealth.com/webhooks/coros/workouts
Service status endpoint: https://api.alzanhealth.com/webhooks/coros/status
```

COROS debe confirmar estas URLs, scopes, límites, payloads y credenciales de webhook antes del go-live. El backend debe desplegarse antes de registrar o probar el callback.

## Seguridad y borrado

- Access y refresh tokens se cifran con AES-256-GCM, IV aleatorio y prefijo de versión `enc:v1`.
- `fitUrl` exige HTTPS, host exacto de allowlist, puerto 443, ausencia de credenciales/fragmento, extensión `.fit`, cero redirects, timeout y máximo 25 MiB.
- El binario `.FIT` se valida antes de parsear.
- Los headers webhook `client_id` y `secret` se comparan en tiempo constante. Se aceptan también `client`/`client-id` y `client_secret`/`client-secret` para compatibilidad con variantes del proveedor.
- Desconectar borra actividades, salud, payloads, tokens y derivados COROS; las sesiones nativas de Alzan se conservan y pierden sus métricas/provenance COROS.
- Si la revocación remota falla, se conserva solo el token cifrado y un hash de referencia durante un máximo de 24 horas.

## Verificación local

```sh
pnpm --prefix alzan-be run verify:coros
node scripts/verify-coros-readiness.spec.js
pnpm --prefix alzan-fe exec tsx src/modules/wearables/corosAvailability.spec.ts
pnpm --prefix alzan-be run verify:activity-import
pnpm --prefix alzan-be run verify:oauth-redirect
pnpm verify:coros-readiness -- --base-url=http://localhost:1111
```

La validación local puede comprobar OAuth, ventanas, deduplicación, webhooks, FIT, deportes y errores con mocks. Sin credenciales COROS reales no se puede certificar el intercambio OAuth ni el formato exacto del payload de producción; esa es la única prueba que requiere autorización real de COROS.

### Referencias de implementación y revisión

Configuración: `scripts/sync-env.js`, `scripts/verify-coros-readiness.js`, `cloudbuild.yaml`. Importación: `coros-cloud-sync.service.ts`, `coros-activity.utils.ts`, `coros-activity-canonical.mapper.ts`. Asociación: `canonical-activity-writer.service.ts` e `import-reconciliation.service.ts`. Interfaz: `useCorosConnection.ts` y `ConnectedAppsScreen.tsx`.

Revisión de documentación: últimos 20 commits hasta `7045c3c`, más cambios locales de esta tarea. Desfase corregido: ventanas de 90 días/solapamiento → tres meses naturales con reintentos; requisitos webhook separados de OAuth; instrucciones de configuración incorporadas. No se eliminan documentos ni se crean artefactos temporales en el repositorio.
