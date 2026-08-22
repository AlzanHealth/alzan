# Integración COROS

Estado del código: implementado en modo seguro `disabled`/`pilot`. El go-live sigue bloqueado hasta que COROS entregue credenciales y payloads reales de sandbox.

## Flujo y límites

- Dirección: COROS → Alzan. No se envían entrenamientos, planes ni rutas a COROS.
- OAuth: `/oauth/coros/authorize` y `/oauth/coros/callback` reutilizan el `state` de un solo uso de Alzan.
- El identificador externo guardado es `openId`; Alzan nunca recibe la contraseña COROS del usuario.
- Pull: `/v2/coros/sport/list` y `/coros/daily/query`, en ventanas inclusivas de hasta 30 días.
- Primer pull: 90 días. Siguientes pulls: tres días de solapamiento.
- Detalle: descarga de `fitUrl` HTTPS o fallback `/v2/coros/sport/detail/fit`.
- Push: `POST /webhooks/coros/workouts`, autenticado por los headers `client` y `secret`.
- Salud: pasos, calorías, sueño, RHR y HRV; requiere el consentimiento `health_integrations_v2_2026_08_22`.

## Endpoints de Alzan

| Método | Ruta | Auth | Finalidad |
| --- | --- | --- | --- |
| `GET` | `/oauth/coros/authorize` | Supabase | Generar `state` y URL OAuth COROS |
| `GET` | `/oauth/coros/callback` | Pública | Intercambiar `code`, cifrar tokens y guardar `openId` |
| `GET` | `/wearables/cloud/coros/capability` | Supabase | Aplicar rollout `disabled`, `pilot` o `public` |
| `POST` | `/wearables/cloud/coros/sync` | Supabase | Sincronizar actividades y salud diaria |
| `DELETE` | `/wearables/connections/coros` | Supabase | Revocar y borrar datos COROS |
| `POST` | `/webhooks/coros/workouts` | Headers COROS | Persistir el push antes de responder |
| `GET` | `/webhooks/coros/status` | Pública | Comprobación `{"status":"ok"}` |

El webhook admite hasta 100 elementos y 2 MiB, y responde `{"message":"ok","result":"0000"}` solo después de persistirlos. Los eventos se guardan en `external_raw_payloads_v2` y una cola duradera los reprocesa. Los duplicados se absorben por hash de raw payload y por `labelId` en el lifecycle de actividad.

## Variables de entorno

```dotenv
COROS_API_BASE_URL=https://opentest.coros.com
COROS_CLIENT_ID=<issued-by-coros>
COROS_CLIENT_SECRET=<issued-by-coros>
COROS_REDIRECT_URI=https://api.alzan.health/oauth/coros/callback
COROS_ROLLOUT_MODE=pilot
COROS_PILOT_USER_IDS=<authorized-supabase-user-uuid>
COROS_TOKEN_ENCRYPTION_KEY_V1=<32-byte-base64-key>
COROS_FIT_ALLOWED_HOSTS=oss.coros.com
COROS_WEBHOOK_CLIENT=<issued-or-confirmed-by-coros>
COROS_WEBHOOK_SECRET=<issued-or-confirmed-by-coros>
```

Generar la clave interna una sola vez y guardarla en el gestor de secretos del backend:

```sh
openssl rand -base64 32
```

No existe `COROS_DEFAULT_SCOPE` en el código porque la documentación recibida no define scopes OAuth por petición. No existe equivalente implementado a `SUUNTO_SUBSCRIPTION_KEY`.

Para producción, cambiar `COROS_API_BASE_URL` a `https://open.coros.com` únicamente después de la aprobación escrita de COROS.

## Seguridad y borrado

- Access y refresh tokens se cifran con AES-256-GCM, IV aleatorio y prefijo de versión `enc:v1`.
- La clave de cifrado, `Client Secret` y secretos webhook nunca se exponen a Expo.
- `fitUrl` exige HTTPS, host exacto de allowlist, puerto 443, ausencia de credenciales/fragmento, extensión `.fit`, cero redirects, timeout y máximo 25 MiB.
- La firma binaria `.FIT` se valida antes de parsear.
- Los headers webhook se comparan en tiempo constante.
- La desconexión borra actividades, salud, payloads, tokens y derivados. Las sesiones nativas Alzan asociadas se conservan, pero se limpian sus métricas/provenance COROS.
- Si la revocación remota falla, se conserva solo el token ya cifrado y un hash de referencia en `provider_deauthorization_jobs`, sin FK al usuario, durante un máximo de 24 horas.

## Verificación local

```sh
pnpm --prefix alzan-be exec ts-node -r tsconfig-paths/register src/components/providers/oauth/coros-security.spec.ts
pnpm --prefix alzan-be exec ts-node -r tsconfig-paths/register src/components/providers/oauth/coros-oauth.service.spec.ts
pnpm --prefix alzan-be exec ts-node -r tsconfig-paths/register src/components/wearables/services/coros-api.utils.spec.ts
pnpm --prefix alzan-be exec ts-node -r tsconfig-paths/register src/components/wearables/dto/coros-webhook.dto.spec.ts
pnpm verify:activity-import -- --provider coros
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -v ON_ERROR_STOP=1 -f supabase/tests/coros_disconnect.integration.sql
```

La validación final necesita una cuenta COROS real: comparar actividad, tipo, fecha, duración, distancia, ruta, laps, frecuencia cardiaca, pasos, sueño y HRV contra la app COROS.
