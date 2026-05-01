# Wearables en Alzan: resumen muy simple

Este documento explica, sin tecnicismos innecesarios, que estamos intentando construir y como encaja cada pieza.

## La idea en una frase

Queremos que Alzan pueda leer datos de relojes, apps de salud y plataformas deportivas, ordenarlos bien y usarlos dentro de las pantallas de salud y entrenamiento.

```text
Apple Health / Health Connect / Strava / Garmin / Suunto
→ Alzan
→ datos limpios
→ progreso, salud, entrenos e insights
```

## Que hace la otra app

La otra app, Open Wearables, funciona como una central de datos.

Su trabajo es:

1. Conectarse a muchos proveedores.
2. Recibir datos en formatos distintos.
3. Guardar el dato original por seguridad.
4. Traducir todo a un formato comun.
5. Evitar duplicados.
6. Exponer datos limpios para que otra app los use.

Ejemplo sencillo:

```text
Strava dice: "activity_id, elapsed_time, distance"
Garmin dice: "summaryId, durationInSeconds, totalDistance"
Apple dice: "workout, startDate, endDate"

Alzan debe convertir todo a:
"entrenamiento con fecha, duracion, distancia, calorias, pulso y origen"
```

## El problema real

Cada proveedor habla su propio idioma.

Apple Health, Android Health Connect, Strava, Garmin y Suunto no entregan los datos igual.

Algunos datos vienen desde el movil. Otros vienen desde internet. Otros llegan por webhooks. Otros requieren pedir acceso de partner.

Por eso no conviene meter todo directamente en las pantallas de Alzan. Primero hay que crear una capa intermedia que ordene el caos.

## Dos tipos de integraciones

### 1. Integraciones desde el movil

Apple Health y Android Health Connect viven en el telefono.

El backend de Alzan no puede decirle directamente a Apple:

```text
Dame los pasos de este usuario.
```

Tiene que hacerlo la app movil:

```text
Usuario da permiso
→ movil lee Apple Health o Health Connect
→ movil manda datos a Alzan backend
→ backend guarda datos
```

Ejemplos de datos:

- pasos;
- entrenamientos;
- peso;
- sueño;
- frecuencia cardiaca;
- calorias;
- distancia;
- HRV si el usuario da permiso.

### 2. Integraciones desde la nube

Strava, Garmin y Suunto funcionan mas como servicios externos.

El usuario conecta su cuenta y el backend gestiona la relacion.

```text
Usuario conecta Strava
→ Strava da permiso a Alzan
→ backend guarda tokens
→ Strava avisa cuando hay una actividad
→ backend descarga y guarda el entrenamiento
```

Aqui el frontend no debe guardar secretos. Todo lo delicado va en backend.

## Como esta Alzan ahora

Alzan ya tiene algunas piezas:

- una pantalla de apps conectadas;
- una pantalla de integraciones de entrenamiento;
- un paso de onboarding para Apple Health o Health Connect;
- tablas de Supabase para entrenamientos, peso, sueño y frecuencia cardiaca;
- un backend NestJS que puede crecer para gestionar integraciones.

Pero todavia falta el motor real.

Ahora mismo esas pantallas son mas una promesa que una integracion completa.

## Que hay que construir

Hay que construir una capa de wearables en Alzan.

Esa capa tendria tres partes:

```text
Frontend
→ pedir permisos y mostrar conexiones

Backend
→ OAuth, tokens, webhooks, seguridad y normalizacion

Supabase
→ guardar datos originales y datos limpios
```

## Que hace cada parte

### Frontend

El frontend debe:

- mostrar proveedores disponibles;
- dejar conectar y desconectar;
- pedir permisos de Apple Health o Health Connect;
- abrir OAuth para Strava, Garmin o Suunto;
- mostrar si una cuenta esta conectada;
- lanzar sincronizaciones manuales;
- refrescar pantallas de salud y entrenamiento.

El frontend no debe:

- guardar secretos;
- guardar refresh tokens;
- procesar toda la logica compleja;
- decidir como deduplicar datos importantes.

### Backend

El backend debe:

- crear URLs de conexion;
- validar OAuth;
- guardar tokens cifrados;
- recibir webhooks;
- comprobar firmas;
- refrescar tokens;
- guardar datos originales;
- convertir datos a formato comun;
- evitar duplicados;
- escribir en Supabase.

### Supabase

Supabase debe:

- guardar entrenamientos;
- guardar metricas de salud;
- guardar conexiones;
- guardar payloads originales;
- proteger datos por usuario;
- permitir consultas rapidas para Health y Training.

## Donde se guarda cada dato

| Dato | Donde deberia acabar |
| --- | --- |
| Entrenamiento | `activity_sessions` |
| Series de pulso/potencia/cadencia | `activity_streams` |
| Dispositivo | `devices` |
| Peso | `weight_logs` |
| Sueño simple | `sleep_logs` |
| Pulso en reposo | `resting_hr_logs` |
| HRV, pasos, SpO2, temperatura | `wearable_samples` nueva |
| Sueño con fases | `wearable_sleep_sessions` nueva |
| Errores y sincronizaciones | `wearable_sync_jobs` nueva |
| Dato original recibido | `wearable_raw_payloads` nueva |

## Por que guardar el dato original

Porque los proveedores cambian, fallan y mandan datos raros.

Si guardamos solo el dato procesado y luego algo esta mal, no podemos saber que paso.

Lo correcto es:

```text
guardar raw
→ procesar
→ guardar limpio
```

Asi podemos corregir errores despues.

## Por que hay que evitar duplicados

Un mismo entrenamiento puede aparecer en varios sitios.

Ejemplo:

```text
Sales a correr con Garmin
Garmin lo sube a Garmin Connect
Garmin lo sincroniza con Strava
Apple Health tambien recibe el entrenamiento
```

Si Alzan importa todo sin pensar, puede crear tres entrenamientos iguales.

Por eso hay que deduplicar.

Regla simple:

```text
usuario + proveedor + id externo = una actividad unica
```

Y cuando haya datos repetidos, usar prioridad:

```text
manual
→ dispositivo principal
→ proveedor directo
→ agregador del sistema
→ agregador externo
```

Ejemplo:

```text
Garmin graba una carrera
Strava recibe copia de Garmin
Apple Health recibe otra copia

Alzan debe guardar el origen de todas,
pero mostrar una sola carrera principal.
```

La version detallada de esta decision esta en `docs/wearables-workout-import-resolution.md`.

## Orden recomendado de implementacion

### Paso 1: Strava

Empezar por Strava porque es el proveedor cloud mas sencillo para validar la arquitectura.

Sirve para probar:

- OAuth;
- tokens;
- actividades;
- webhooks;
- deduplicacion;
- proyeccion a entrenamientos.

### Paso 2: Apple Health y Health Connect

Despues integrar datos desde el movil.

Sirve para importar:

- peso;
- sueño;
- pasos;
- frecuencia cardiaca;
- entrenamientos;
- calorias.

### Paso 3: Suunto y Garmin

Despues ir a Suunto y Garmin.

Son importantes, pero pueden requerir acceso de partner, aprobaciones o condiciones especiales.

No conviene bloquear todo el proyecto esperando a estos dos.

### Paso 4: Insights avanzados

Cuando los datos ya entran bien, usar Alzan para sacar valor:

- recuperacion;
- fatiga;
- HRV;
- sueño por fases;
- carga de entrenamiento;
- recomendaciones.

## Que significa cada palabra rara

**OAuth**: forma segura de conectar una cuenta externa sin pedirle la contraseña al usuario.

**Token**: permiso que permite al backend consultar datos del proveedor.

**Refresh token**: token que permite renovar el acceso cuando caduca.

**Webhook**: aviso que manda un proveedor cuando pasa algo.

**Backfill**: importacion historica de datos antiguos.

**Raw payload**: dato original recibido, sin tocar.

**Normalizar**: convertir datos distintos a un formato comun.

**Deduplicar**: evitar guardar dos veces lo mismo.

**Provider**: proveedor externo, como Strava, Garmin o Apple Health.

**HealthKit**: sistema de Apple para datos de salud.

**Health Connect**: sistema moderno de Android para datos de salud.

## Resumen final

Open Wearables nos enseña la arquitectura general.

Alzan debe copiar la idea, pero adaptada a su stack:

```text
Expo / React Native
→ NestJS backend
→ Supabase
→ Health y Training
```

La regla de oro:

```text
El frontend pide permisos.
El backend protege y ordena.
Supabase guarda.
Alzan muestra valor al usuario.
```
