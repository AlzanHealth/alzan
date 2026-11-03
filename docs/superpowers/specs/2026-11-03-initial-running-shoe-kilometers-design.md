# Kilómetros iniciales de zapatillas de running

## Objetivo

Permitir indicar cuántos kilómetros acumula un par antes de empezar a registrar sus carreras en Alzan, para que el desgaste mostrado refleje el uso real.

## Diseño

- Añadir un campo opcional de kilómetros previos en los formularios de alta y edición de zapatillas. Un valor vacío equivale a `0`; se permiten decimales finitos de `0` a `1e305` km y se rechazan valores negativos, mal formados o que se desborden al convertirlos a metros.
- Guardar el valor como una base de kilometraje en `running_shoes`, separada de las actividades. No se crea una actividad ficticia ni aumenta el contador de sesiones.
- Hacer que el kilometraje devuelto por `get_running_shoe_mileage` sea la base manual convertida a metros más la distancia de las carreras asociadas. El progreso y los avisos del máximo recomendado usan ese total combinado.
- Permitir corregir la base desde «Editar zapatillas» sin alterar las actividades ya asociadas.
- Mantener la asociación retrospectiva como una opción independiente. La base manual cubre solo kilómetros que no estén registrados; las carreras asociadas se suman además.
- Añadir validación en la base de datos y en el formulario. Las pruebas cubren base inicial, acumulación con carreras, edición, el límite representable y el rechazo de valores inválidos.

## Alcance

La interfaz se traduce al español y al inglés. No se muestran entrenos ficticios en el historial y no se cambia el comportamiento de asignación o eliminación de carreras.
