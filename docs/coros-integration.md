# Integración COROS

## Modelo de conexión

COROS envía los entrenamientos a Alzan mediante su Partner API directa. Alzan nunca recibe ni almacena la contraseña de COROS: el usuario autoriza en la pantalla oficial de COROS y el backend guarda únicamente los tokens cifrados.

La API directa permite consultar actividades en ventanas inclusivas de hasta 30 días y, según la documentación de COROS, solo ofrece automáticamente los últimos tres meses. La primera sincronización usa tres ventanas de 30 días; las siguientes usan solapamiento para evitar huecos y duplicados. El histórico anterior se importa mediante archivos FIT exportados desde COROS Training Hub.

## Flujo de actividades

1. El usuario pulsa `Conectar COROS` en `Ajustes → Integraciones`.
2. Alzan genera un `state` de un solo uso y redirige al OAuth directo de COROS.
3. COROS vuelve a `/oauth/coros/callback`.
4. Alzan cifra y guarda los tokens en `provider_connection_tokens` y conserva la conexión en `user_connections`.
5. Alzan sincroniza las actividades disponibles, descarga el FIT cuando COROS lo ofrece y escribe todo mediante el escritor canónico.
6. Las nuevas actividades pueden llegar por webhook o mediante `Sincronizar ahora`.

El resumen se guarda aunque el FIT no esté disponible. La actividad queda marcada como pendiente de enriquecimiento y se reintenta en una sincronización posterior. El límite diario real de FIT no convierte una sincronización parcial en un falso éxito.

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

| Método | Ruta | Auth | Finalidad |
| --- | --- | --- | --- |
| `GET` | `/oauth/coros/authorize` | Supabase | Generar `state` y URL OAuth directa de COROS |
| `GET` | `/oauth/coros/callback` | Pública | Intercambiar `code`, cifrar tokens y guardar `openId` |
| `GET` | `/wearables/cloud/coros/capability` | Supabase | Aplicar rollout `disabled`, `pilot` o `public` |
| `POST` | `/wearables/cloud/coros/sync` | Supabase | Sincronizar actividades y salud con consentimiento separado |
| `POST` | `/activity-imports/coros/history` | Supabase | Importar uno o varios FIT históricos |
| `DELETE` | `/wearables/connections/coros` | Supabase | Revocar y borrar datos COROS |
| `POST` | `/webhooks/coros/workouts` | `client_id` + `secret` headers COROS | Persistir el push antes de responder |
| `GET` | `/webhooks/coros/status` | Pública | Comprobación `{"status":"ok"}` |

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
pnpm --prefix alzan-be run verify:activity-import
pnpm --prefix alzan-be run verify:oauth-redirect
pnpm verify:coros-readiness -- --base-url=http://localhost:1111
```

La validación local puede comprobar OAuth, ventanas, deduplicación, webhooks, FIT, deportes y errores con mocks. Sin credenciales COROS reales no se puede certificar el intercambio OAuth ni el formato exacto del payload de producción; esa es la única prueba que requiere autorización real de COROS.
