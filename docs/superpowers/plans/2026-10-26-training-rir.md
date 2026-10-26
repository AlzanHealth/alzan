# RIR objetivo por serie — Plan de implementación

> **Objetivo:** transportar el RIR prescrito en cada serie desde la importación de planes hasta la sesión interactiva, conservando el RPE real ya registrado.
>
> **Arquitectura:** usar un vector opcional `rir_by_set` en el contrato de importación y persistirlo como `smallint[]` en la plantilla base y sus progresiones semanales. La pantalla activa mostrará una insignia compacta en la celda existente de serie; no se añade captura del RIR realizado.
>
> **Tecnología:** React Native/Expo, TypeScript, Supabase local y migración SQL aditiva.

## Archivos y responsabilidades

- `alzan-fe/src/modules/training/services/trainingPlanImportContract.ts`: validar RIR entero por serie (0–10 o `null`) y longitud igual a `sets`.
- `alzan-fe/src/modules/training/services/trainingPlanImportTemplate.ts`: instruir a la IA para conservar RIR explícito y actualizar el JSON de ejemplo.
- `alzan-fe/src/modules/training/services/trainingPlanImportService.ts`: guardar vector base y las progresiones por semana.
- `supabase/migrations/20261026120000_add_target_rir_by_set.sql`: añadir columnas con validación de longitud y rango.
- `alzan-fe/src/modules/training/helpers/strengthProgression.helper.ts` y `services/strengthProgressionService.ts`: cargar y aplicar overrides semanales, incluyendo una semana sin objetivos explícitos.
- `alzan-fe/src/hooks/useGymRoutineEditor.ts` y `modules/training/helpers/strengthExerciseReconciliation.helper.ts`: conservar el vector al editar una plantilla existente y adaptarlo si cambia el número de series.
- `alzan-fe/src/screens/training/helpers/activeWorkoutDraft.ts`: aceptar borradores previos que aún no tengan el campo.
- `alzan-fe/src/screens/training/ActiveWorkoutScreen.tsx`: insignia accesible y compacta por serie, oculta en series marcadas como calentamiento.
- `alzan-fe/src/i18n/locales/en.ts` y `es.ts`: textos y accesibilidad bilingües.
- Tipos Supabase de `supabase/database.types.ts`, `alzan-fe/src/types/database.types.ts` y `alzan-be/src/types/database.types.ts`: reflejar migración local.

## Secuencia

1. Extender el contrato y el prompt de importación con `rir_by_set`, sin dejar que el modelo invente valores ausentes.
2. Crear y aplicar en Supabase local la migración aditiva; actualizar los tipos compartidos.
3. Conectar los valores importados con las filas base y progresiones, diferenciando `NULL` (heredar base) de un vector compuesto por `NULL` (esa semana no prescribe RIR).
4. Preservar el vector al editar rutinas y mantener borradores locales antiguos legibles.
5. Integrar la insignia por serie y sus etiquetas accesibles en español e inglés.
6. Ejecutar formato, lint y comprobación de tipos; revisar el diff, la migración local y la interfaz abierta en el navegador.

No se modifica `workout_sets.rpe`, no se añade un valor de RIR realizado y no se despliega a producción.
