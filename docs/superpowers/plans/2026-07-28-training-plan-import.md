# Training Plan Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Importar planes JSON de running y fuerza, reutilizar familias de plantillas con progresiones y limpiar plantillas expiradas sin perder historial.

**Architecture:** La validación y la coincidencia serán funciones puras en módulos de entrenamiento. La persistencia usará Supabase con operaciones agrupadas y limpieza idempotente; las pantallas solo orquestarán hooks y mostrarán estado. El calendario seguirá leyendo `workout_plans` y las plantillas existentes.

**Tech Stack:** React Native/Expo web, TypeScript, React Query, Supabase, date-fns, pruebas unitarias existentes del frontend y migraciones SQL locales.

---

### Task 1: Añadir ciclo de vida de plantillas al esquema

**Files:**
- Create: `supabase/migrations/20260728120000_training_template_lifecycle.sql`
- Modify: `alzan-fe/src/types/database.types.ts` (regenerado desde Supabase local)
- Modify: `alzan-be/src/types/database.types.ts` (regenerado desde Supabase local)
- Modify: `supabase/database.types.ts` (regenerado desde Supabase local)

- [ ] **Step 1: Escribir la migración local**

Añadir a `workout_templates` y `endurance_workout_templates` columnas `template_family_key text`, `auto_delete_after_end boolean not null default true`, `source text not null default 'user'`, y `recurrence_start_date`/`recurrence_end_date` donde falten. Añadir índices por `(user_id, template_family_key)` y `(user_id, recurrence_end_date)`.

- [ ] **Step 2: Añadir restricciones de seguridad**

Mantener las políticas RLS existentes y añadir checks para que la fecha final no sea anterior a la inicial cuando ambas existan.

- [ ] **Step 3: Aplicar y regenerar solo en local**

Ejecutar `supabase db reset` y regenerar tipos con el flujo del repositorio. No ejecutar ninguna migración remota.

- [ ] **Step 4: Verificar compatibilidad**

Comprobar que las plantillas existentes mantienen sus valores, que `source='user'` se aplica a filas antiguas y que ninguna FK histórica queda afectada.

### Task 2: Modelar la identidad estructural

**Files:**
- Create: `alzan-fe/src/modules/training/helpers/templateFamilySignature.ts`
- Create: `alzan-fe/src/modules/training/helpers/templateFamilySignature.spec.ts`
- Modify: `alzan-fe/src/modules/training/helpers/enduranceProgression.helper.ts`

- [ ] **Step 1: Escribir pruebas RED**

Cubrir firmas iguales para ritmos/distancias diferentes, firmas distintas para fases diferentes, firmas de fuerza por ejercicios/orden y prioridad del `template_key`.

- [ ] **Step 2: Implementar firmas deterministas**

Normalizar deporte, modalidad, fases, duración, recuperaciones, exercise IDs y superseries. Excluir valores variables declarados como progresión.

- [ ] **Step 3: Implementar clasificación de coincidencia**

Devolver `exact`, `possible` o `none`, además de diferencias legibles para la vista previa. No asociar automáticamente coincidencias ambiguas.

- [ ] **Step 4: Ejecutar las pruebas**

Ejecutar el spec específico y confirmar que falla antes de implementar y pasa después.

### Task 3: Centralizar expiración y preservación de historial

**Files:**
- Create: `alzan-fe/src/modules/training/services/templateLifecycleService.ts`
- Create: `alzan-fe/src/modules/training/services/templateLifecycleService.spec.ts`
- Modify: `alzan-fe/src/modules/training/services/enduranceProgressionService.ts`
- Modify: `alzan-fe/src/hooks/useGymRoutines.ts`
- Modify: `alzan-fe/src/hooks/useEnduranceTemplates.ts`

- [ ] **Step 1: Escribir pruebas RED**

Cubrir plantilla sin fecha final, fecha final todavía vigente, expiración al día siguiente, preservación de planes históricos y eliminación de planes futuros.

- [ ] **Step 2: Implementar limpieza idempotente**

Seleccionar únicamente plantillas del usuario con `auto_delete_after_end=true` y `recurrence_end_date < localDate`. Desactivar recurrencia, borrar planes futuros no completados, desvincular planes restantes y sesiones, borrar dependencias y plantilla.

- [ ] **Step 3: Conservar historial**

No borrar `activity_sessions`, `workout_sets`, feedback ni planes históricos. Si la plantilla desaparece, dejar las FKs de plantilla en `null`.

- [ ] **Step 4: Integrar la limpieza**

Invocarla en calendario, TrainingHome, creación/edición de plantilla, importación y carga de listas. Filtrar expiradas antes de renderizar.

### Task 4: Ajustes sincronizados

**Files:**
- Modify: `alzan-fe/src/hooks/useTrainingSettings.ts`
- Modify: `alzan-fe/src/screens/training/TrainingSettingsScreen.tsx`
- Modify: `alzan-fe/src/types/requests.types.ts`
- Modify: `alzan-fe/src/i18n/locales/es.ts`
- Modify: `alzan-fe/src/i18n/locales/en.ts`

- [ ] **Step 1: Escribir pruebas del valor por defecto**

Verificar que el ajuste existe, está activo por defecto y no se guarda solo en `AsyncStorage`.

- [ ] **Step 2: Persistir el ajuste por usuario**

Guardar el ajuste en preferencias sincronizadas, manteniendo compatibilidad con perfiles antiguos.

- [ ] **Step 3: Añadir selector en Ajustes**

Mostrar descripción clara: las plantillas sin fecha final no se eliminan automáticamente.

### Task 5: Extender editor y guardado de plantillas

**Files:**
- Modify: `alzan-fe/src/screens/training/GymRoutineEditorScreen.tsx`
- Modify: `alzan-fe/src/screens/training/EnduranceWorkoutBuilderScreen.tsx`
- Modify: `alzan-fe/src/hooks/useEnduranceWorkoutBuilder.ts`
- Modify: `alzan-fe/src/hooks/useGymRoutineEditor.ts`

- [ ] **Step 1: Añadir fecha final y eliminación automática**

Mostrar ambos controles en gimnasio y running, con valor por defecto tomado del ajuste global.

- [ ] **Step 2: Validar fechas**

Rechazar fecha final anterior a la inicial y limpiar planes futuros posteriores cuando se reduzca el límite.

- [ ] **Step 3: Guardar `template_family_key` y `source`**

Conservar la identidad al editar y evitar crear una nueva familia por cambios de ritmo, cargas o repeticiones.

- [ ] **Step 4: Cubrir edición y borrado manual**

Reusar el servicio de ciclo de vida para que el borrado manual también conserve historial.

### Task 6: Extender progresiones de running y resolver familias

**Files:**
- Modify: `alzan-fe/src/modules/training/services/enduranceProgressionService.ts`
- Modify: `alzan-fe/src/modules/training/helpers/enduranceProgression.helper.ts`
- Create: `alzan-fe/src/modules/training/services/templateFamilyResolver.ts`
- Create: `alzan-fe/src/modules/training/services/templateFamilyResolver.spec.ts`

- [ ] **Step 1: Escribir pruebas RED**

Cubrir coincidencia por `template_key`, coincidencia estructural de intervalos con distinto ritmo/km, conflicto ambiguo y creación de nueva familia.

- [ ] **Step 2: Implementar resolución**

Buscar primero por clave, después por firma entre plantillas activas del usuario y devolver candidatas con puntuación/diferencias.

- [ ] **Step 3: Fusionar progresiones**

Actualizar únicamente las semanas afectadas y rechazar conflictos sin confirmación de la vista previa.

- [ ] **Step 4: Proteger el rango temporal**

No aceptar progresiones fuera del intervalo de inicio/fin ni crear planes posteriores al fin.

### Task 7: Crear contrato y analizador JSON

**Files:**
- Create: `alzan-fe/src/modules/training/services/trainingPlanImportPlanner.ts`
- Create: `alzan-fe/src/modules/training/services/trainingPlanImportPlanner.spec.ts`
- Create: `alzan-fe/src/modules/training/types/trainingPlanImport.ts`

- [ ] **Step 1: Escribir pruebas RED**

Cubrir JSON válido de running/fuerza, cuatro semanas, fechas inválidas, deportes no soportados, duplicados y progresiones.

- [ ] **Step 2: Implementar parser tipado**

Validar `schema`, `version`, `start_date`, `end_date`, `weeks`, `sessions`, `sport`, `template_key` y payload específico sin `any`.

- [ ] **Step 3: Construir preview**

Generar sesiones nuevas, familias reutilizables, progresiones, conflictos y acciones de reemplazo.

- [ ] **Step 4: Ejecutar pruebas de carga**

Probar cuatro semanas, múltiples sesiones diarias y cientos de pasos sin peticiones por elemento.

### Task 8: Persistir importaciones en lote

**Files:**
- Create: `alzan-fe/src/modules/training/services/trainingPlanImportService.ts`
- Create: `alzan-fe/src/modules/training/services/trainingPlanImportService.spec.ts`
- Modify: `alzan-fe/src/lib/trainingQueryKeys.ts`

- [ ] **Step 1: Escribir pruebas RED**

Cubrir inserción idempotente, reemplazo confirmado, omisión de conflicto y recuperación de errores sin tocar historial.

- [ ] **Step 2: Implementar operaciones agrupadas**

Resolver familias, insertar/actualizar plantillas, pasos, ejercicios, progresiones y `workout_plans` en lotes.

- [ ] **Step 3: Mantener estado `planned`**

Nunca insertar actividades completadas ni modificar sesiones existentes.

- [ ] **Step 4: Invalidar consultas**

Invalidar calendario diario/semanal, marcas de fechas, plantillas y detalles.

### Task 9: Pantalla de importación web responsive

**Files:**
- Create: `alzan-fe/src/screens/training/TrainingPlanImportScreen.tsx`
- Create: `alzan-fe/src/screens/training/components/TrainingPlanImportPreview.tsx`
- Modify: `alzan-fe/src/navigation/TrainingStack.tsx`
- Modify: `alzan-fe/src/screens/training/TrainingHomeScreen.tsx`
- Modify: `alzan-fe/src/i18n/locales/es.ts`
- Modify: `alzan-fe/src/i18n/locales/en.ts`

- [ ] **Step 1: Añadir navegación y acceso**

Incluir un acceso visible en entrenamiento, con texto neutral y botón para copiar la plantilla.

- [ ] **Step 2: Implementar editor y análisis**

Mostrar estados vacío, error, análisis y progreso de inserción.

- [ ] **Step 3: Implementar vista previa**

Agrupar por semana, fecha y deporte; mostrar coincidencias, nuevas plantillas y conflictos.

- [ ] **Step 4: Añadir confirmación de reemplazo**

Preguntar antes de modificar progresiones o planes existentes.

### Task 10: Verificación completa

**Files:**
- Modify: tests específicos creados en Tasks 2, 3, 6, 7 y 8

- [ ] **Step 1: Ejecutar pruebas específicas**

Ejecutar los specs de familia, ciclo de vida, progresión, parser e importación.

- [ ] **Step 2: Ejecutar calidad local**

Ejecutar `pnpm format`, `pnpm run lint:check` y `pnpm run verify:import-review`.

- [ ] **Step 3: Verificar esquema local**

Ejecutar `supabase db reset`, regenerar tipos y repetir pruebas con la base local. No tocar producción.

- [ ] **Step 4: Revisar preservación de datos**

Comprobar que una plantilla expirada elimina solo su definición y planes futuros, mientras que `activity_sessions`, sets, feedback y planes históricos permanecen.
