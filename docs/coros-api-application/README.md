# Paquete de solicitud COROS API — Alzan Health

No enviar este paquete hasta sustituir `[NOMBRE LEGAL DEL SOLICITANTE]` y confirmar que las tres URLs públicas responden por HTTPS.

## 1. Formulario oficial

Abrir: <https://coros-teams.feishu.cn/share/base/form/shrcnLqSduZsaNhbvDJTO2x0Vlf>

Datos:

```text
Platform/Application Name: Alzan Health
Company Name: Alzan Health
Platform/Application URL: https://alzan.health
Primary Region: Spain / European Union
Total Active Users: 0–150
Application type: Personal
Commercial use: Non-commercial
Expected launch: Private pilot after COROS sandbox approval

Primary Contact Email: support@alzanhealth.com
Secondary Contact Email: hello@alzanhealth.com
Privacy Officer Email: alzan@alzanhealth.com
```

Seleccionar:

- `Activity / Workout Data Sync (one way, COROS to your platform)`
- `Access Daily Health Data`

No seleccionar sincronización bidireccional, planes estructurados, rutas GPX, Bluetooth ni ANT+.

URLs:

```text
OAuth redirect URI: https://api.alzan.health/oauth/coros/callback
Workout Data Receiving Endpoint: https://api.alzan.health/webhooks/coros/workouts
Service Status Check: https://api.alzan.health/webhooks/coros/status
```

`Intended use of data`:

```text
Alzan Health will import workouts authorized by the COROS user, including
activity summaries and FIT detail files, to display training history,
routes, laps, heart rate and performance metrics.

Alzan will also import authorized daily health data, including steps,
sleep, resting heart rate, HRV and calories, so the user can view their
health and training history in one private dashboard.

The data will only be visible to the authorized user. It will not be sold,
used for advertising, shared with other users or used for medical
diagnosis. Users will be able to disconnect COROS and delete imported data.
```

Logos listos en `assets/`: 102, 120, 144 y 300 px, generados sin alterar diseño ni proporciones desde el icono oficial de Alzan.

## 2. Correo del mismo día

Destinatario: `api@coros.com`

Asunto: `COROS API developer access request – Alzan Health personal pilot`

```text
Hello COROS Developer Operations,

I have submitted the COROS API application form for Alzan Health.

Alzan Health is requesting developer access for an initial personal,
non-commercial pilot.

Requested capabilities:
- Activity / Workout Data Sync (one way, COROS to Alzan)
- Access Daily Health Data
- Workout Summary Data Push

Application URL:
https://alzan.health

OAuth redirect URI:
https://api.alzan.health/oauth/coros/callback

Workout receiving endpoint:
https://api.alzan.health/webhooks/coros/workouts

Service status endpoint:
https://api.alzan.health/webhooks/coros/status

Please provide the sandbox/test Client ID and Client Secret, the procedure
for obtaining production credentials and any webhook authentication
credentials required by COROS.

Please also confirm:

1. Whether user_id is required during the authorization-code exchange.
2. Whether OAuth scopes are sent in the authorization request or enabled at application level.
3. Whether refresh tokens rotate and which fields are returned by the refresh endpoint.
4. How the access token must be sent to sport, daily and deauthorization endpoints.
5. Which HTTPS hosts may appear in fitUrl and how long those URLs remain valid.
6. Which client and secret headers must authenticate workout push requests.
7. Webhook timeout, retry, ordering and duplicate-delivery guarantees.
8. Whether COROS sends workout update, deletion or authorization-revocation events.
9. Rate limits per application and per user, including Retry-After behavior.
10. Timezone semantics for happenDay and workout timestamps.
11. The current mode/subMode catalogue and change-notification procedure.
12. Sandbox test-user, certification and production go-live requirements.

Kind regards,

[NOMBRE LEGAL DEL SOLICITANTE]
Founder / Developer
Alzan Health
support@alzanhealth.com
```

Guardar la confirmación del formulario, el correo enviado y la respuesta de COROS en un repositorio privado; nunca guardar secretos en Git.

Fuentes oficiales:

- <https://support.coros.com/hc/en-us/articles/17085887816340-Submit-an-API-Application>
- <https://www.dropbox.com/scl/fo/6ps1297tn9pfo7qmcb0o8/AItfHWAW8t-jZ0NIrAaT0hg?rlkey=kbq4zmu47j9c3c6qu7b96z39f&st=wi864yvy&dl=0>
