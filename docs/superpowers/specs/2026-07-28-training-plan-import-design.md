# Importación de planes de entrenamiento y ciclo de vida de plantillas

## Objetivo

Permitir importar desde el frontend un plan JSON semanal de running y fuerza, reutilizando plantillas por familia estructural, aplicando progresiones semanales y limpiando automáticamente las plantillas temporales al día siguiente de su fecha límite sin borrar historial.

## Decisiones aprobadas

- Los únicos deportes de la primera versión serán `running` y `strength`.
- El JSON aceptará un `template_key` opcional. Si falta, se calculará una coincidencia estructural.
- Ritmo, distancia, duración, repeticiones, cargas y descansos son valores variables; la estructura de fases, ejercicios y orden define la familia.
- El ajuste de eliminación automática estará activado por defecto.
- Una plantilla sin fecha límite será permanente.
- Una plantilla con fecha límite se limpiará al comenzar el día posterior a esa fecha.
- Se conservarán siempre las sesiones de `activity_sessions` y el historial de planes.
- Los planes posteriores a la fecha límite se eliminarán; los planes históricos se conservarán y se desvincularán de la plantilla antes de eliminarla.
- El historial completado nunca se elimina ni se modifica en sus métricas.

## Modelo de ciclo de vida

Las dos tablas de plantillas tendrán identidad de familia, origen, fecha de inicio, fecha de finalización y una bandera de eliminación automática. Las plantillas de running reutilizarán `recurrence_end_date` y `endurance_workout_step_progressions`. Las plantillas de gimnasio recibirán fecha final y, si necesitan variantes semanales, progresiones de fuerza equivalentes o variantes temporales según la decisión de implementación.

La limpieza será idempotente y se ejecutará durante entradas relevantes de la app (inicio de entrenamiento, calendario, importación y guardado). La lista de plantillas filtrará las expiradas aunque una ejecución de limpieza todavía esté pendiente.

## Identidad y coincidencia

La coincidencia priorizará `template_key`, después una firma estructural y finalmente una revisión manual en la vista previa cuando existan varias candidatas. El nombre será solo una señal secundaria.

Para running, la firma incluirá deporte, modalidad/objetivo, secuencia de fases, tipo de duración, patrón de recuperaciones y grupos de repeticiones. Los valores de ritmo, distancia, duración y repeticiones declaradas como progresión no rompen la familia.

Para fuerza, la firma incluirá modalidad, ejercicios canónicos, orden y superseries. Series, repeticiones, peso, descanso y RPE serán variables.

## Flujo de importación

1. El usuario copia una plantilla JSON desde la pantalla de importación.
2. Pega el JSON y pulsa analizar.
3. El frontend valida versión, fechas, deportes, estructura y valores numéricos.
4. Se muestran semanas, sesiones, candidatos de plantilla, nuevas familias, progresiones y conflictos.
5. Reemplazar una progresión o un plan existente requiere confirmación explícita.
6. La inserción se procesa en lote, con progreso visible y protección contra duplicados.
7. Los `workout_plans` se crean con estado `planned`.
8. Se invalidan calendario, semana, día y lista de plantillas.

## Seguridad de datos

Las mutaciones deben limitarse al usuario autenticado. Antes de eliminar una plantilla se eliminarán únicamente planes futuros no históricos, se desvincularán todos los planes restantes y sesiones que la referencien, se eliminarán dependencias y después la plantilla. La operación de limpieza deberá poder repetirse sin producir referencias huérfanas.

## Fuera de alcance inicial

- Importar actividades completadas.
- Crear deportes adicionales.
- Borrar `activity_sessions`, `workout_sets` o estadísticas.
- Ejecutar migraciones contra producción.
