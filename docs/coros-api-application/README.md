# Paquete de solicitud COROS API — Alzan Health

Estado: formulario enviado. Antes de que COROS emita credenciales hay que corregir por correo el dominio originalmente indicado. `alzan.health` devuelve `NXDOMAIN`; el dominio operativo es `alzanhealth.com`. El correo de rectificación listo para enviar está en [`../coros-integration.md`](../coros-integration.md#dominio-público-y-corrección-de-la-solicitud).

Las respuestas siguientes quedan como registro del formulario. No reenviarlo como una segunda solicitud salvo que COROS lo pida.

## 1. Formulario oficial

Abrir: <https://coros-teams.feishu.cn/share/base/form/shrcnLqSduZsaNhbvDJTO2x0Vlf>

Datos:

```text
Platform/Application Name: Alzan Health
Company Name: Alzan Health
Platform/Application URL: https://alzanhealth.com
Platform/Application Description (99 characters):
Private training dashboard for authorized COROS workouts, daily health data and performance trends.
Primary Region: Spain / European Union
Total Active Users: 0–150
Application type: Personal
Commercial use: Non-commercial
Expected Integration Launch Date: 2026-10-15

Primary Contact Email: support@alzanhealth.com
Secondary Contact Email: hello@alzanhealth.com
Privacy Officer Email: alzan@alzanhealth.com
```

Seleccionar:

- `Activity / Workout Data Sync (one way, COROS to your platform)`
- `Access Daily Health Data`

No seleccionar sincronización bidireccional, planes estructurados, rutas GPX, Bluetooth ni ANT+.

### Preguntas 11–24: número, enunciado y respuesta

#### 11. Platform / Application Description (100 Character Limit)

> This may be Customer-Facing and appear on our Partner Page

Respuesta propuesta — 99 caracteres:

```text
Private training dashboard for authorized COROS workouts, daily health data and performance trends.
```

#### 12. Authorized Callback Domain (redirect_url):

> Please provide one or two domains starting with http:// or https:// such as https://open.other.com. We will use this to ensure security to check whether the authorized domain is consistent with your redirect URL.

Respuesta — introducir el dominio, sin la ruta del callback:

```text
https://api.alzanhealth.com
```

El callback completo que utilizará el backend sigue siendo:

```text
https://api.alzanhealth.com/oauth/coros/callback
```

#### 13. If you need the Workout Summary Data Push Service from COROS, please provide the requested information, or write N/A: WORKOUT DATA RECEIVING ENDPOINT URL:

> Check section 5.3 in the API Reference Guide for full details.

Respuesta:

```text
https://api.alzanhealth.com/webhooks/coros/workouts
```

#### 14. If you need the Workout Summary Data Push Service from COROS, please provide the requested information, or write N/A: SERVICE STATUS CHECK URL:

> i.e. https://www.example.come/status or https://status.example.io

Respuesta:

```text
https://api.alzanhealth.com/webhooks/coros/status
```

#### 15. If your platform / application / product has a Bluetooth or ANT+ element to it, please provide the link to the protocol/profile, or write N/A:

Respuesta:

```text
N/A
```

#### 16. Will your platform / application be for personal or public use?

Opciones del formulario:

```text
Personal
Public
Other
```

Respuesta para el piloto:

```text
Personal
```

El piloto queda restringido a los UUID incluidos en `COROS_PILOT_USER_IDS`. Antes de abrirlo al público hay que solicitar a COROS la ampliación correspondiente.

#### 17. Will your platform / application be for commercial or non-commercial use?

Opciones del formulario:

```text
Commercial
Non-Commercial
Other
```

Respuesta para el piloto:

```text
Non-Commercial
```

#### 18. Intended use of data?

> Please describe how mutual user data will be used and processed by your platform

Respuesta:

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

#### 19. Expected Integration Launch Date — YYYY-MM-DD

Respuesta propuesta para el piloto:

```text
2026-10-15
```

Esta es una fecha objetivo, no una afirmación de aprobación. Cambiarla antes de enviar si ya no es realista.

#### 20. Do you agree to the COROS API Application Terms?

> Introduction section of this API Application form

Opciones del formulario:

```text
Yes
No
```

La persona solicitante debe leer la introducción del formulario y, solo si la acepta, seleccionar:

```text
Yes
```

No puede delegarse esta aceptación al agente ni marcarse automáticamente.

#### 21. Do you agree to the terms of the COROS API Agreement? (Linked below)

Abrir y revisar el acuerdo enlazado por COROS:

<https://www.dropbox.com/scl/fi/pqrgalut8k63gr8aslp3i/COROS-API-Agreement.pdf?rlkey=h8qlr5dmokd2f8orfjchey8xk&st=eph4mmzj&dl=0>

Opciones del formulario:

```text
Yes
No
```

La persona con capacidad para aceptar el acuerdo debe seleccionar `Yes` únicamente después de revisarlo y aceptarlo. No puede delegarse esta aceptación al agente ni marcarse automáticamente.

#### 22. Please enter your name

Respuesta:

```text
[NOMBRE LEGAL COMPLETO DEL SOLICITANTE]
```

Debe coincidir con la persona que acepta los campos 20 y 21 y con la firma/contacto de la solicitud.

#### 23. Submit Date — YYYY-MM-DD

Respuesta:

```text
[YYYY-MM-DD — FECHA REAL EN QUE SE ENVÍA EL FORMULARIO]
```

No introducir una fecha prevista ni reutilizar la fecha objetivo del campo 19.

#### 24. Please upload the following PNG files of your logo (API applications cannot be approved without all of the required files):

> Standard Logos (These two are required for every application):
> 144 x 144px
> 102 x 102px
>
> Additional Logos (These two are also required if requesting Workout/Training Plan sync):
> 120 x 120px
> 300 x 300px

Respuesta — subir los cuatro PNG preparados en `assets/`:

```text
alzan-logo-144.png  → 144 × 144 px
alzan-logo-102.png  → 102 × 102 px
alzan-logo-120.png  → 120 × 120 px
alzan-logo-300.png  → 300 × 300 px
```

Los dos primeros son obligatorios para cualquier solicitud. Dado que Alzan solicita sincronización de workouts, subir también 120 y 300 px evita que COROS considere incompleta la solicitud.

### Comprobación antes de enviar

- Confirmar que `https://api.alzanhealth.com` resuelve por HTTPS.
- Confirmar que el callback completo está permitido en el backend.
- Confirmar que el status devuelve HTTP `200` y `{"status":"ok"}`.
- Confirmar que el endpoint de workouts acepta HTTPS y está protegido por los headers `client` y `secret`.
- Sustituir nombre legal y fecha real de envío.
- Revisar personalmente y aceptar, si procede, ambos documentos legales.
- Subir los cuatro logos PNG.

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
https://alzanhealth.com

OAuth redirect URI:
https://api.alzanhealth.com/oauth/coros/callback

Workout receiving endpoint:
https://api.alzanhealth.com/webhooks/coros/workouts

Service status endpoint:
https://api.alzanhealth.com/webhooks/coros/status

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
