# Historial de zapatillas de running — Plan de implementación

> **Para agentes de implementación:** ejecutar por tareas y respetar los pasos de verificación de cada una. Mantener los cambios aislados en la rama de trabajo actual.

**Objetivo:** Permitir que cada usuario gestione sus zapatillas de running, asigne una a cada carrera y consulte los kilómetros acumulados frente a su límite recomendado.

**Arquitectura:** Guardar las zapatillas y la zapatilla asignada en Supabase. Calcular el kilometraje como la suma de `activity_sessions.distance_m` de las carreras asociadas, evitando mantener contadores que puedan quedar desincronizados. Una migración asignará la zapatilla predeterminada a nuevas carreras de running, tanto manuales como importadas; una operación transaccional permitirá completar carreras históricas desde la fecha de inicio de uso sin modificar asignaciones existentes.

**Tecnologías:** React Native, Expo, React Navigation, TanStack Query, Supabase/Postgres, RLS y traducciones en inglés y español.

---

## Decisiones funcionales

- La sección de gestión estará en Ajustes.
- Una zapatilla tendrá nombre requerido; marca, modelo y fecha de compra opcionales; fecha de inicio de uso; límite recomendado de kilómetros opcional; y una marca de predeterminada. No tendrá estado activa/retirada ni kilometraje inicial.
- Al crearla, la persona podrá asignar a esa zapatilla las carreras de running desde la fecha de inicio de uso que aún no tengan una zapatilla. Se preservan asignaciones previas.
- Cada carrera guarda una única zapatilla opcional. El detalle de una carrera del historial permite asociarla o cambiarla; al cambiarla, el kilometraje se refleja en la nueva asignación porque se calcula desde las actividades vinculadas.
- Las nuevas carreras de running, manuales o importadas, reciben la zapatilla predeterminada si no traen una asignación explícita. Cambiar la predeterminada no reasigna carreras pasadas.
- El alcance incluye `sport_type = 'running'`; `trail` queda fuera aunque alguna actividad se haya registrado como modalidad de trail.
- Al alcanzar el límite recomendado se muestra un aviso en la gestión de zapatillas. La entrega de una notificación push queda como decisión de canal antes de implementarla.

## Archivos y responsabilidades

- Crear migraciones en `supabase/migrations/` para `running_shoes`, la relación desde `activity_sessions`, políticas RLS, índice de zapatilla predeterminada, asignación en inserciones y operaciones transaccionales de alta, edición con retroasignación y cambio de predeterminada.
- Regenerar los tipos Supabase mediante `pnpm run supabase:types`; no editar a mano `alzan-fe/src/types/database.types.ts`, `alzan-be/src/types/database.types.ts` ni `supabase/database.types.ts`.
- Crear `alzan-fe/src/modules/training/services/runningShoesService.ts` para consultas y operaciones de zapatillas, y `alzan-fe/src/modules/training/hooks/useRunningShoes.ts` para caché, mutaciones e invalidación.
- Crear `alzan-fe/src/screens/settings/RunningShoesSettingsScreen.tsx` para el listado, alta, edición, selección predeterminada, kilometraje y aviso de límite.
- Modificar `alzan-fe/src/screens/settings/SettingsHomeScreen.tsx` y `alzan-fe/src/navigation/SettingsNavigator.tsx` para incluir la sección y su ruta tipada.
- Modificar `alzan-fe/src/screens/training/EnduranceSessionDetailScreen.tsx` y la mutación de `alzan-fe/src/hooks/useEnduranceSessions.ts` para permitir asignar o cambiar zapatilla y refrescar el kilometraje.
- Añadir textos a `alzan-fe/src/i18n/locales/es.ts` y `alzan-fe/src/i18n/locales/en.ts`.

## Tareas

### Tarea 1: Persistencia, permisos y reglas de asignación

**Archivos:**
- Crear: `supabase/migrations/20261031120000_running_shoes.sql`
- Crear: `supabase/migrations/20261031123000_running_shoe_update_backfill.sql`
- Crear: `supabase/migrations/20261031130000_running_shoe_default_switch.sql`
- Generar: tipos Supabase con `pnpm run supabase:types`
- Verificar el esquema frente a: `.agents/skills/shared-database-schema/references/schema.md`

- [x] Crear `public.running_shoes` con `id`, `user_id`, `name`, `brand`, `model`, `purchase_date`, `in_use_since`, `recommended_max_km`, `is_default`, `created_at` y `updated_at`.
- [x] Validar que el nombre no esté vacío, `recommended_max_km` sea positivo cuando exista y `in_use_since` no sea posterior a hoy.
- [x] Añadir `running_shoe_id` nullable a `public.activity_sessions`, con relación que preserve la integridad del usuario dueño.
- [x] Activar RLS y políticas de lectura, alta, edición y borrado limitadas al usuario autenticado; impedir asociar una actividad a una zapatilla de otra cuenta.
- [x] Crear índice único parcial para que cada cuenta tenga como máximo una zapatilla predeterminada e índices para consultar carreras por zapatilla y fecha.
- [x] Añadir trigger de inserción: si la actividad es `running`, no trae `running_shoe_id` y existe predeterminada del usuario, asignarla. Respetar IDs explícitos y no modificar otros deportes.
- [x] Añadir RPC transaccional para crear la zapatilla y retroasignar carreras `running` sin asignación desde `in_use_since`; conservar las asignaciones existentes.
- [x] Añadir RPC transaccional para cambiar la predeterminada sin permitir dos predeterminadas simultáneas.
- [x] Regenerar tipos; comprobar que `running_shoes` y `activity_sessions.running_shoe_id` aparecen en los tipos generados.

### Tarea 2: Servicio, kilometraje y caché

**Archivos:**
- Crear: `alzan-fe/src/modules/training/services/runningShoesService.ts`
- Crear: `alzan-fe/src/modules/training/hooks/useRunningShoes.ts`
- Modificar: `alzan-fe/src/hooks/useEnduranceSessions.ts`

- [x] Implementar operaciones tipadas para listar, crear, editar y elegir la zapatilla predeterminada mediante Supabase.
- [x] Implementar una función SQL de lectura segura que devuelva por zapatilla la suma de `distance_m / 1000`, limitada por `user_id` y carreras de tipo `running`; indexar `activity_sessions(user_id, running_shoe_id, start_time)` para ayudar a esa consulta.
- [x] Tratar `distance_m` nulo como cero y mantener asociadas carreras sin distancia para que se puedan corregir desde el historial.
- [x] Al reasignar una carrera, invalidar tanto `['enduranceSessions']` como las consultas `['runningShoes', userId]` para actualizar ambos totales.
- [x] No guardar `total_km` en la zapatilla; calcularlo a partir de las actividades para que cambios y borrados de carreras no desajusten el total.

### Tarea 3: Gestión de zapatillas en Ajustes

**Archivos:**
- Crear: `alzan-fe/src/screens/settings/RunningShoesSettingsScreen.tsx`
- Modificar: `alzan-fe/src/screens/settings/SettingsHomeScreen.tsx`
- Modificar: `alzan-fe/src/navigation/SettingsNavigator.tsx`
- Modificar: `alzan-fe/src/i18n/locales/es.ts`
- Modificar: `alzan-fe/src/i18n/locales/en.ts`

- [x] Añadir «Zapatillas de running» al bloque de entrenamiento/contenido de Ajustes y registrar una ruta tipada en `SettingsStackParamList`.
- [x] Mostrar cada zapatilla con nombre, marca/modelo si existen, fecha de inicio de uso, total de kilómetros y límite recomendado.
- [x] Crear formulario para alta/edición con nombre, marca, modelo, fecha de compra, fecha «La uso desde», límite recomendado y opción para hacerla predeterminada.
- [x] Usar la fecha de compra como valor inicial de «La uso desde» cuando esté disponible; permitir editar la fecha de inicio de uso para controlar la retroasignación.
- [x] Mostrar progreso y aviso al alcanzar o superar el límite recomendado; omitir el aviso cuando no haya límite configurado.
- [x] Cubrir estados de carga, lista vacía, error, guardado y confirmación de retroasignación. No añadir fotos ni estado retirada.
- [x] Añadir todos los textos en español e inglés.

### Tarea 4: Asignar zapatilla desde el detalle del historial

**Archivos:**
- Modificar: `alzan-fe/src/screens/training/EnduranceSessionDetailScreen.tsx`
- Modificar: `alzan-fe/src/hooks/useEnduranceSessions.ts`

- [x] Mostrar selector de zapatilla solo para actividades con `sport_type = 'running'`.
- [x] Permitir elegir «Sin zapatilla» y cualquiera de las zapatillas de la cuenta; mostrar la predeterminada como sugerencia para carreras nuevas.
- [x] Guardar el cambio en `activity_sessions.running_shoe_id`; la consulta agregada debe restar la distancia de la anterior y sumarla a la nueva automáticamente.
- [x] Manejar usuarios sin zapatillas registradas con un acceso a Ajustes, sin bloquear el detalle del entrenamiento.
- [x] Invalidar el detalle y el resumen de zapatillas tras guardar.

### Tarea 5: Integración con actividades manuales e importadas

**Archivos:**
- El trigger de inserción de `supabase/migrations/20261031120000_running_shoes.sql`
- Revisar: `alzan-fe/src/hooks/useEnduranceSessions.ts`
- Revisar los puntos de inserción del importador de actividad, incluido `alzan-be/src/components/activity-import/`

- [x] Confirmar que los nuevos registros manuales de running pasan por `activity_sessions` y reciben la predeterminada mediante el trigger.
- [x] Confirmar que las actividades importadas por los proveedores también pasan por `activity_sessions`; el trigger debe cubrir todos los proveedores sin duplicar lógica en cada importador.
- [x] Confirmar que una asignación explícita existente se conserva al editar o reconciliar una importación, y que un deporte distinto de running nunca recibe zapatilla.
- [x] Confirmar que al cambiar la zapatilla predeterminada las carreras antiguas siguen asociadas a la que tenían.

### Tarea 6: Comprobaciones y revisión de flujos

- [x] Añadir pruebas para conversión de metros a kilómetros, límite no configurado y alcance del umbral; verificar asignación histórica por fecha, conservación de asignaciones, cambio de zapatilla, registros nuevos y RLS con SQL de integración local.
- [x] Añadir verificación de migración/RLS para impedir lectura y asignación entre usuarios.
- [x] Hacer un smoke visual local de Ajustes, formulario de alta y selector en el detalle de running. La persistencia, retroasignación, valores predeterminados, kilometraje y aislamiento entre usuarios se verificaron con SQL local; no se ejecutó un flujo end-to-end de importación de proveedor.
- [x] Ejecutar `pnpm format`, `pnpm run lint:check`, `pnpm run verify:import-review` y `pnpm --prefix alzan-fe run typecheck`.
- [ ] Si se modifica el OpenAPI o un endpoint de NestJS durante la implementación, ampliar las comprobaciones según `shared-pnpm-quality-gate`; la arquitectura encontrada usa Supabase directamente desde el frontend, así que el plan no requiere un endpoint nuevo.

## Revisión del plan

- Todos los requisitos contestados por el usuario tienen una tarea: Ajustes, datos y fechas, retroasignación, asignación por actividad, importación automática, kilometraje, valor recomendado y aviso.
- La regla de creación no pisa asignaciones previas; la asignación por defecto solo afecta a nuevas carreras.
- La distancia se toma de `activity_sessions.distance_m`, que está en metros.
- El aviso implementado aparece dentro de Ajustes al alcanzar el límite recomendado; no se añadieron notificaciones push.
