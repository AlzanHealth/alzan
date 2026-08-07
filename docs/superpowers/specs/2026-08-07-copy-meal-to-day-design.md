# Copiar una comida a otro día

## Objetivo

Permitir que una persona copie cualquier comida visible en Nutrición —registrada o planificada— a otra fecha disponible en el calendario y a cualquier tipo de comida configurado, sin sobrescribir comidas existentes.

## Decisiones de producto

- El gesto de entrada será pulsar el nombre de la comida.
- El flujo usará dos pasos:
  1. Seleccionar la fecha destino.
  2. Seleccionar el tipo de comida destino.
- La fecha inicial será el día nutricional actual, mostrado como “Hoy”.
- La fecha se elegirá con un selector multiplataforma:
  - iOS y Android: `@react-native-community/datetimepicker`.
  - Web: el selector de fecha nativo del navegador, abierto desde el mismo control y con los mismos límites; así aprovechamos el calendario del navegador sin depender de soporte web variable del selector nativo.
- El selector solo permitirá fechas que el calendario de Nutrición actual puede mostrar: cuatro semanas anteriores, la semana actual y cuatro semanas posteriores, usando una única función compartida para calcular los límites.
- El tipo destino se seleccionará entre los tipos de comida habilitados por las preferencias actuales de Nutrición.
- La copia siempre creará una nueva comida. No se hará `upsert` por fecha/tipo ni se eliminarán registros existentes.
- Tras una copia correcta, se mostrará confirmación y se invalidarán las consultas de comidas, día nutricional y lista de la compra.

## Comportamiento de datos

### Comida registrada

Cuando la comida tiene `logId`, el servicio copiará:

- `name`, `notes`, macros, procedencia y calidad de datos del `meal_logs` original.
- Todos los registros relacionados de `meal_items`, con sus cantidades, macros por 100 g, fuentes y metadatos.
- La fecha y `meal_type` se sustituirán por los valores elegidos.
- `diet_template_meal_id` se dejará vacío: la copia es una comida nueva y puede caer en un día distinto de la plantilla.
- `adherence_status` será `extra_meal`, evitando que se confunda con la instancia original de una plantilla.

### Comida planificada sin registro

Cuando la fila solo tiene `templateMeal`, el servicio copiará los datos planificados disponibles:

- `base_name` como nombre.
- `target_kcal`, `target_protein_g`, `target_carbs_g` y `target_fats_g` como macros.
- No se crearán ingredientes, porque la planificación no contiene `meal_items` que copiar.
- La nueva fila será una comida independiente del destino, sin `diet_template_meal_id`, con estado `extra_meal` y la misma información visible que la planificación original.

Esta separación evita asociar una comida copiada a una plantilla cuyo `day_of_week` ya no coincide con la nueva fecha, pero cumple la petición de copiar exactamente la información disponible en cada fuente.

## Diseño técnico

### Componentes

- `MealRow`: convertirá el nombre en un control táctil accesible y recibirá una devolución `onCopy`.
- `MealSection`: propagará la comida seleccionada hacia la pantalla de Nutrición.
- Nuevo componente de flujo, ubicado en `alzan-fe/src/modules/nutrition/components/CopyMealModal.tsx`: gestionará el paso de fecha, el paso de tipo, los límites, estados de carga/error y la cancelación.
- `NutritionHomeScreen`: mantendrá la comida origen y el estado visible del modal, y lanzará la mutación de copia.
- Nuevo servicio o funciones en `dietCopyService.ts`: construirán y persistirán la copia sin sobrescritura, incluyendo rollback del log si falla la inserción de ingredientes.
- Nuevo helper `alzan-fe/src/modules/nutrition/services/nutritionCalendarRange.ts`: será compartido por `DaySwitcher` y el modal para evitar que ambos calculen límites distintos.

### Flujo de persistencia

1. Validar que la fecha destino está dentro de los límites calculados y que el tipo destino es válido.
2. Leer el log e ingredientes de origen cuando exista `logId`; para una comida planificada usar `templateMeal`.
3. Insertar un nuevo `meal_logs` con un id nuevo, sin `diet_template_meal_id`.
4. Insertar los `meal_items` clonados si existen.
5. Si la inserción de ingredientes falla, borrar el nuevo log y devolver un error.
6. Invalidar las queries afectadas y cerrar el modal solo después de completar la operación.

## Estados de interfaz

- Paso 1: botón “Continuar” deshabilitado solo mientras la fecha sea inválida; hoy aparece seleccionado inicialmente.
- Paso 2: botón “Copiar comida” deshabilitado durante la petición y muestra progreso.
- Cancelar y volver atrás no escriben datos.
- Error de persistencia: mantener el modal abierto, mostrar el error cerca de la acción y permitir reintentar.
- Éxito: cerrar el flujo y mostrar una confirmación con la fecha y tipo destino.
- Los controles de edición y borrado existentes permanecen separados del gesto de copia.

## Compatibilidad y accesibilidad

- El selector nativo se usará en iOS y Android.
- En web se proporcionará un selector de fecha accesible con `min` y `max` sincronizados con el rango compartido.
- El nombre de la comida tendrá `accessibilityRole="button"` y una etiqueta que indique que abre el flujo de copia.
- Los objetivos táctiles mantendrán al menos 44 puntos de alto/ancho cuando el control sea iconográfico.
- Todos los textos nuevos pasarán por las traducciones existentes en español e inglés.

## Pruebas

- Tests unitarios del helper de límites: rango inclusivo de nueve semanas y fechas en los extremos.
- Tests unitarios del plan de copia: comida registrada conserva campos e ingredientes; planificada conserva nombre/macros sin inventar ingredientes; destino reemplaza fecha/tipo y elimina la asociación de plantilla.
- Test de no sobrescritura: copiar a una fecha/tipo con datos existentes añade un nuevo log.
- Test de rollback: un fallo al insertar ingredientes no deja un log huérfano.
- Test de interacción del componente: segundo paso permite escoger cualquier tipo habilitado y el botón copia una sola vez mientras está cargando.
- Verificación TypeScript, formato y lint del monorepo.

## Alcance excluido

- Copiar comidas a fechas fuera del rango visible del calendario.
- Sobrescribir, fusionar o eliminar comidas existentes.
- Copiar o modificar plantillas de dieta semanales.
- Crear ingredientes para comidas planificadas que no los tienen.
