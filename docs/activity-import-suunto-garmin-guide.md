# Guia extensa de importacion manual Suunto y Garmin

> Documento pensado para entender el backend desde cero. No asume que sepas NestJS, FIT, Supabase ni arquitectura backend.

## 1. Que problema resuelve esta parte de la app

Alzan permite que el usuario cree o edite una actividad y suba un archivo descargado de un reloj o app deportiva.

Ahora mismo el flujo es manual:

```text
Usuario crea/edita una sesion
Usuario sube archivo FIT/JSON/GPX/etc.
Backend lee el archivo
Backend normaliza los datos
Backend devuelve o guarda datos en la sesion
```

La integracion directa con relojes, OAuth, webhooks y sincronizacion automatica queda para mas adelante.

El problema principal es que cada proveedor habla distinto:

```text
Suunto dice: AverageHeartRate
Garmin dice: AverageHeartRateInBeatsPerMinute
Alzan quiere: avgHeartRate
```

Para no llenar toda la app de condiciones tipo "si es Garmin haz esto, si es Suunto haz esto", se crea una capa intermedia: el modelo canonico.

## 2. Que es el modelo canonico

El modelo canonico es el idioma comun de Alzan.

Piensalo asi:

```text
Suunto FIT/JSON  -> traductor Suunto  -> CanonicalActivity
Garmin FIT/JSON  -> traductor Garmin  -> CanonicalActivity
```

Una vez que los datos estan en `CanonicalActivity`, al resto del backend le da igual de donde venian.

El modelo vive en:

```text
alzan-be/src/components/activity-import/parsers/activity-import-canonical.types.ts
```

El tipo principal es `CanonicalActivity`.

Contiene estas partes:

```text
provider
sourceFileType
sportType
sportSubtype
providerActivityId
summary
streams
laps
heartRateZones
device
vendorFields
```

### 2.1. `provider`

Dice de donde viene el archivo.

Ejemplos:

```text
suunto
garmin
polar
manual
```

En esta PR importan sobre todo:

```text
suunto
garmin
```

### 2.2. `sourceFileType`

Dice el tipo de archivo que se ha leido.

Ahora usamos:

```text
fit
json
```

### 2.3. `sportType`

Es el deporte principal en el idioma de Alzan.

Ejemplos:

```text
running
cycling
swimming
football
basketball
tennis
padel
hiking
strength
gym
other
```

Estos valores vienen de la base de datos, del enum `sport_type_enum`.

### 2.4. `sportSubtype`

Es una variante del deporte.

Ejemplos:

```text
road
trail
track
indoor
outdoor
pool
open_water
```

Ejemplo real:

```text
running + road
running + trail
swimming + pool
swimming + open_water
cycling + indoor
```

### 2.5. `summary`

Es el resumen de la actividad.

Aqui van los valores principales:

```text
startedAt
endedAt
durationSeconds
elapsedSeconds
distanceM
caloriesKcal
avgHeartRate
maxHeartRate
minHeartRate
avgSpeedMps
maxSpeedMps
avgCadence
maxCadence
avgPowerW
maxPowerW
elevationGainM
elevationLossM
avgTemperatureC
maxTemperatureC
totalSteps
recoveryTimeSeconds
vo2Max
epoc
pte
tss
```

No todos los archivos traen todos los valores. La regla es:

```text
Si el archivo no trae un dato, se queda en null.
La UI no debe mostrar metricas vacias.
```

### 2.6. `streams`

Los streams son datos punto a punto durante el entrenamiento.

Por ejemplo, una actividad puede tener frecuencia cardiaca cada segundo:

```text
segundo 0  -> 110 bpm
segundo 1  -> 112 bpm
segundo 2  -> 113 bpm
```

O posicion GPS:

```text
segundo 0  -> lat/lon
segundo 10 -> lat/lon
segundo 20 -> lat/lon
```

El modelo tiene estos streams:

```text
position
heartRate
speed
distance
altitude
cadence
power
temperature
```

Cada muestra suele tener:

```text
offsetSeconds
timestamp
value
```

Para posicion GPS tiene:

```text
offsetSeconds
timestamp
lat
lon
```

### 2.7. `laps`

Los laps son vueltas, intervalos o cortes.

Ejemplo:

```text
Lap 1: 1 km, 5:10, 145 bpm
Lap 2: 1 km, 5:05, 150 bpm
```

Alzan los normaliza con:

```text
lapIndex
lapType
distanceM
durationSeconds
avgPaceSecondsPerKm
avgHeartRate
maxHeartRate
startOffsetSeconds
endOffsetSeconds
```

### 2.8. `heartRateZones`

Son las zonas de frecuencia cardiaca.

Ejemplo:

```text
Zona 1: 30 minutos, 60%
Zona 2: 20 minutos, 40%
```

Regla de prioridad:

```text
1. Si el FIT trae zonas nativas, se usan esas.
2. Si no trae zonas, se calculan desde el stream de frecuencia cardiaca.
3. Si existe FC maxima estimada del usuario, se usa para calcular.
4. Si no hay datos suficientes, no se inventan zonas.
```

### 2.9. `device`

Informacion del reloj o dispositivo.

Ejemplo:

```text
name: Garmin
model: Forerunner
serial: 123456789
```

### 2.10. `vendorFields`

Aqui guardamos informacion especifica del proveedor que todavia no tiene columna clara en Alzan.

Ejemplo:

```text
garminFitSport
garminFitSubSport
garminManufacturer
garminProduct
suuntoActivityId
```

Importante: `vendorFields` sirve para no perder contexto, pero en esta PR no se persiste todo en base de datos.

## 3. El flujo completo cuando subes un archivo

Hay dos flujos principales:

```text
Ruta/deporte endurance -> route parser
Fuerza/gimnasio       -> strength parser
```

## 4. Flujo de ruta/endurance

Este flujo se usa para correr, ciclismo, senderismo, tenis, padel, futbol, baloncesto, natacion, etc.

La entrada desde frontend llama a endpoints existentes:

```text
POST /activity-imports/route/parse
POST /activity-imports/route/apply
```

No se han creado endpoints nuevos para Garmin.

### 4.1. `route/parse`

Se usa cuando estas en el formulario y subes archivo para rellenar campos.

Hace:

```text
archivo -> parsea -> devuelve summary/details/polyline
```

No guarda en base de datos.

### 4.2. `route/apply`

Se usa para aplicar el archivo sobre una sesion.

Puede funcionar en dos modos:

```text
persist_details=false -> solo actualiza route_polyline
persist_details=true  -> actualiza polyline, laps y zonas
```

## 5. Archivo clave: `route-import.parser.ts`

Ruta:

```text
alzan-be/src/components/activity-import/parsers/route-import.parser.ts
```

Este archivo convierte ficheros de ruta en algo que Alzan puede usar.

Soporta:

```text
FIT
GPX
TCX
KML
JSON
TXT/polyline
```

Antes, para FIT, se intentaba aprovechar la logica Suunto. Ahora se usa el orquestador:

```ts
canonical = parseActivityFileToCanonical(binary, filename, options);
```

Eso significa:

```text
route-import.parser.ts ya no decide directamente si es Garmin o Suunto.
Se lo pregunta al orquestador.
```

### 5.1. Que devuelve `route-import.parser.ts`

Devuelve un `ParsedRouteImport`:

```text
polyline
summary
details
```

### 5.2. `polyline`

Es la ruta codificada para pintar el mapa.

Si hay GPS:

```text
polyline = "cadena codificada de ruta"
```

Si no hay GPS:

```text
polyline = ""
```

Esto es importante para deportes como padel o tenis indoor, porque no siempre tienen ubicacion.

### 5.3. `summary`

Resumen que rellena campos del formulario:

```text
sportType
sportSubtype
distanceM
durationSeconds
elevationGainM
elevationLossM
avgHeartRate
maxHeartRate
caloriesKcal
vo2Max
totalSteps
avgSpeedMps
avgCadence
avgPowerW
temperature
```

### 5.4. `details`

Detalles mas especificos:

```text
customSplits
distanceSplits
splits1k
splits5k
splits10k
heartRateZones
```

## 6. El orquestador: `activity-import-canonical.parser.ts`

Ruta:

```text
alzan-be/src/components/activity-import/parsers/activity-import-canonical.parser.ts
```

Este archivo es como un recepcionista.

Recibe:

```text
content
filename
options
```

Y decide:

```text
Esto lo mando al traductor Garmin.
Esto lo mando al traductor Suunto.
```

### 6.1. Como decide si un FIT es Garmin

Los archivos FIT tienen mensajes internos. Uno de ellos es `file_id`.

Dentro de `file_id`, existe el campo `manufacturer`.

Garmin tiene:

```text
manufacturer id = 1
```

Por eso el codigo hace:

```text
leer FIT
buscar manufacturer
si manufacturer === 1 -> Garmin
si no -> Suunto por ahora
```

Tambien acepta el nombre de archivo:

```text
si filename contiene "garmin" -> Garmin
```

Esto ayuda en ficheros donde el manufacturer no se pueda leer.

### 6.2. Como decide si un JSON es Garmin

Mira si el JSON tiene campos tipicos de Garmin:

```text
Summary
ActivityId
SummaryId
ActivityType
StartTimeInSeconds
Steps
BodyBatteryEnd
```

Si ve esos campos, usa Garmin.

### 6.3. Como decide si un JSON es Suunto

Mira si tiene estructura Suunto:

```text
DeviceLog
entryData
```

Si ve eso, usa Suunto.

## 7. Traductor Garmin: `garmin-activity-canonical.mapper.ts`

Ruta:

```text
alzan-be/src/components/activity-import/parsers/garmin-activity-canonical.mapper.ts
```

Este archivo es el traductor Garmin -> Alzan.

Tiene dos caminos:

```text
parseGarminFit
parseGarminJson
```

## 8. Como se lee un FIT Garmin

FIT es binario. No se lee como JSON.

Un JSON puedes abrirlo y ver:

```json
{
  "ActivityType": "RUNNING"
}
```

Un FIT es bytes. Por eso el parser tiene que leer:

```text
header
definition messages
data messages
fields
developer fields
```

No hace falta entender el formato completo, pero si la idea:

```text
FIT primero dice "este mensaje tendra estos campos"
Luego aparecen mensajes con valores
```

### 8.1. Constantes importantes

En el mapper Garmin aparecen constantes como:

```text
FIT_FILE_ID_MESSAGE_NUMBER = 0
FIT_SESSION_MESSAGE_NUMBER = 18
FIT_LAP_MESSAGE_NUMBER = 19
FIT_RECORD_MESSAGE_NUMBER = 20
```

Significan:

```text
0  -> informacion del archivo/dispositivo
18 -> resumen de la sesion
19 -> laps/vueltas
20 -> muestras durante la actividad
```

### 8.2. `FIT_EPOCH_OFFSET_SECONDS`

FIT usa una fecha base distinta a Unix.

Unix cuenta segundos desde:

```text
1970-01-01
```

FIT cuenta desde:

```text
1989-12-31
```

Por eso se suma:

```text
631065600
```

El codigo lo convierte a fecha ISO normal:

```text
2026-05-01T08:00:00.000Z
```

### 8.3. Semicircles

FIT no guarda lat/lon como grados normales.

Guarda coordenadas en `semicircles`.

El codigo convierte:

```text
semicircles -> grados decimales
```

Asi Alzan puede pintar mapas.

## 9. Que mensajes FIT lee Garmin

### 9.1. `file_id`

Se usa para detectar dispositivo:

```text
manufacturer
product
serial
```

Si manufacturer es `1`, se considera Garmin.

### 9.2. `session`

Es el resumen del entrenamiento.

Ejemplos:

```text
start time
sport
sub sport
elapsed time
timer time
distance
calories
avg speed
max speed
avg HR
max HR
cadence
power
elevation gain/loss
native HR zones
```

Todo esto se mete en `summary`.

### 9.3. `record`

Son muestras durante el entrenamiento.

Ejemplos:

```text
lat
lon
altitude
heart rate
cadence
distance
speed
power
temperature
timestamp
```

Todo esto se mete en `streams`.

### 9.4. `lap`

Son vueltas o intervalos.

Ejemplos:

```text
lap start time
lap duration
lap distance
avg HR
max HR
lap trigger
```

Todo esto se mete en `laps`.

## 10. Mapeo de deportes Garmin

La funcion clave es:

```text
mapGarminActivityToCanonicalSport
```

Convierte deportes Garmin en deportes Alzan.

Ejemplos:

```text
FIT sport 1 -> running
FIT sport 2 -> cycling
FIT sport 5 -> swimming
FIT sport 6 -> basketball
FIT sport 7 -> football
FIT sport 8 -> tennis
FIT sport 17 -> hiking
FIT sport 64 + subSport 85 -> padel
FIT sport 4 / 37 / subSport 20 -> strength
```

Tambien intenta leer texto del JSON:

```text
padel -> padel
hike -> hiking
soccer/football -> football
basketball -> basketball
tennis -> tennis
swim -> swimming
bike/cycling -> cycling
run -> running
strength/gym -> strength
```

## 11. Como se calculan zonas de frecuencia cardiaca

En Garmin y Suunto hay dos opciones.

### 11.1. Opcion 1: el archivo trae zonas

Algunos FIT traen el campo:

```text
time_in_hr_zone
```

El parser lo convierte a:

```text
zone
durationSeconds
percentage
```

Si viene esto, se respeta.

### 11.2. Opcion 2: se calculan desde el stream

Si no hay zonas nativas, pero hay muestras de frecuencia cardiaca:

```text
segundo 0  -> 100 bpm
segundo 60 -> 105 bpm
```

El parser calcula el tiempo por zona.

Usa la FC maxima estimada del usuario si existe.

Reglas actuales:

```text
<70% FC max  -> zona 1
<80% FC max  -> zona 2
<90% FC max  -> zona 3
<95% FC max  -> zona 4
>=95% FC max -> zona 5
```

Ejemplo:

```text
FC max estimada = 200
HR = 100
100 / 200 = 0.5
zona 1
```

## 12. Actividades sin GPS

Antes una actividad sin GPS podia fallar en el parser de ruta porque no habia coordenadas.

Pero padel, tenis, futbol indoor o gimnasio pueden no traer ubicacion.

La regla ahora es:

```text
Si no hay GPS pero hay resumen, laps o zonas:
  no falla
  devuelve polyline vacia
```

Ejemplo:

```json
{
  "polyline": "",
  "summary": {
    "sportType": "padel",
    "durationSeconds": 3600
  },
  "details": {
    "heartRateZones": [...]
  }
}
```

La UI debe pintar mapa solo si `polyline` tiene contenido.

## 13. Flujo de fuerza/gimnasio

El parser de fuerza vive en:

```text
alzan-be/src/components/activity-import/parsers/strength-activity-import.parser.ts
```

Se usa con:

```text
POST /activity-imports/strength/apply
```

Este endpoint si escribe en base de datos.

Actualiza:

```text
activity_sessions.provider
activity_sessions.imported_at
activity_sessions.device_id
activity_sessions.start_time
activity_sessions.end_time
activity_sessions.duration_s
activity_sessions.calories_kcal
activity_sessions.avg_heart_rate
activity_sessions.max_heart_rate
activity_sessions.min_heart_rate
activity_sessions.total_steps
activity_sessions.recovery_time_s
activity_sessions.tss_hr
activity_sessions.epoc
activity_sessions.pte
```

Tambien reemplaza:

```text
activity_heart_rate_zones
activity_streams con source = strength_file_import
```

Importante:

```text
No cambia activity_sessions.source.
No crea provider_activity_id.
No crea actividades nuevas.
```

## 14. Que se cambio para Garmin en fuerza

Antes, si subias un FIT Garmin de fuerza, podia no saberse que era Garmin.

Ahora el parser lee el manufacturer del FIT:

```text
manufacturer = 1 -> garmin
```

Entonces el resumen queda:

```text
provider: garmin
```

Y el device puede quedar:

```text
name: Garmin
serial: ...
```

## 15. Salud diaria, sueno y recovery

Hay mappers preparados, pero todavia no guardan en DB.

### 15.1. Suunto health mapper

Ruta:

```text
alzan-be/src/components/activity-import/parsers/suunto-health-canonical.mapper.ts
```

Mapea:

```text
pasos
sueno
recovery/stress
```

### 15.2. Garmin health mapper

Ruta:

```text
alzan-be/src/components/activity-import/parsers/garmin-health-canonical.mapper.ts
```

Mapea:

```text
daily activity
sleep
recovery
Body Battery
stress
HRV
SpO2
respiration
```

Pero solo lo deja como modelo canonico.

No se guarda todavia.

## 16. Por que no guardamos salud todavia

Porque esta PR es solo para importacion manual de entrenamientos.

Guardar salud requiere decidir reglas extra:

```text
que pasa si ya existe el dia
como se mergean fuentes distintas
que prioridad tiene Garmin vs manual
como se evita duplicar suenos
como se sincronizan intervalos
```

Eso pertenece a una PR futura.

## 17. Persistencia actual en base de datos

Las tablas relevantes son:

```text
activity_sessions
activity_streams
activity_laps
activity_heart_rate_zones
devices
```

Preparadas para futuro health:

```text
daily_steps
step_intervals
sleep_sessions
sleep_stage_intervals
sleep_biomarker_samples
daily_recovery
```

En esta PR no hay migraciones.

## 18. Tests

Hay tests especificos para evitar romper esto.

### 18.1. Tests Garmin

Ruta:

```text
alzan-be/src/components/activity-import/parsers/garmin-canonical.mapper.spec.ts
```

Comprueban:

```text
FIT Garmin running con GPS
FIT Garmin sin zonas nativas
FIT Garmin con zonas nativas
FIT Garmin padel sin GPS
FIT Garmin strength/gym
JSON Garmin Activity Details
health Garmin sin persistencia
```

### 18.2. Tests Suunto

Ruta:

```text
alzan-be/src/components/activity-import/parsers/suunto-canonical.mapper.spec.ts
```

Comprueban que Suunto sigue funcionando.

### 18.3. Tests de parsers actuales

Ruta:

```text
alzan-be/src/components/activity-import/parsers/activity-import.parsers.spec.ts
```

Comprueban regresiones del flujo anterior.

## 19. Ejemplo completo: Garmin running con GPS

```text
1. Usuario sube garmin-run.fit.
2. Backend recibe archivo.
3. route-import.parser detecta formato FIT.
4. Llama a parseActivityFileToCanonical.
5. Orquestador lee manufacturer.
6. manufacturer = 1, entonces usa Garmin mapper.
7. Garmin mapper lee session, records, laps y zones.
8. Devuelve CanonicalActivity.
9. route-import.parser convierte streams.position en polyline.
10. Devuelve summary + details al frontend.
11. Al guardar, route/apply persiste polyline/laps/zones.
```

## 20. Ejemplo completo: Garmin padel sin GPS

```text
1. Usuario sube garmin-padel.fit.
2. Backend detecta Garmin.
3. Garmin mapper detecta sport padel.
4. No encuentra lat/lon.
5. Si encuentra duracion, frecuencia cardiaca o zonas.
6. route-import.parser no falla.
7. Devuelve polyline vacia.
8. El formulario puede tener datos aunque no haya mapa.
```

## 21. Ejemplo completo: Suunto gimnasio

```text
1. Usuario esta en una sesion de gimnasio.
2. Sube archivo Suunto FIT/JSON.
3. Frontend llama a strength/apply.
4. Backend parsea resumen de fuerza.
5. Actualiza activity_sessions.
6. Reemplaza zonas HR.
7. Reemplaza stream HR con source strength_file_import.
8. La UI invalida queries y muestra datos importados.
```

## 22. Como leer el codigo sin perderte

Lee en este orden:

```text
1. activity-import-canonical.types.ts
2. activity-import-canonical.parser.ts
3. garmin-activity-canonical.mapper.ts
4. suunto-activity-canonical.mapper.ts
5. route-import.parser.ts
6. strength-activity-import.parser.ts
7. garmin-health-canonical.mapper.ts
8. tests
```

Si empiezas por `route-import.parser.ts`, es facil perderse porque es grande y mezcla GPX, TCX, FIT, JSON, splits y polyline.

## 23. Que significa "parser"

Un parser es una funcion que lee un formato y lo convierte en datos utiles.

Ejemplo simple:

```text
"duration: 3600" -> { durationSeconds: 3600 }
```

En este caso:

```text
FIT binario -> CanonicalActivity
JSON Garmin -> CanonicalActivity
GPX -> polyline + summary
```

## 24. Que significa "mapper"

Un mapper es una funcion que traduce nombres.

Ejemplo:

```text
AverageHeartRateInBeatsPerMinute -> avgHeartRate
ActivityType RUNNING -> sportType running
```

## 25. Que significa "normalizar"

Normalizar significa dejar todo en el mismo formato.

Ejemplos:

```text
Garmin distancia en metros -> distanceM
Suunto distancia en metros -> distanceM
FIT timestamp -> ISO string
semicircles -> lat/lon en grados
calorias de energia -> kcal
```

## 26. Que puede faltar en archivos reales

No todos los relojes dan todo.

Puede faltar:

```text
GPS
potencia
cadencia
temperatura
zonas
laps
calorias
FC
device serial
```

Eso no es un error.

La app debe actuar asi:

```text
si viene -> guardar/mostrar
si no viene -> null/no mostrar
```

## 27. Cosas que quedan para futuras PRs

```text
OAuth Garmin/Suunto real
webhooks
sync automatico
guardar raw FIT original
persistir daily_steps
persistir sleep_sessions
persistir daily_recovery
deduplicar actividades importadas
external_activity_mappings
pantalla de conexiones reales
```

## 28. Resumen final en una frase

Esta parte convierte archivos raros de relojes en un idioma comun de Alzan, para que hoy podamos importar manualmente entrenos y manana podamos conectar relojes sin rehacer toda la logica.

