# Zonas de frecuencia cardiaca por deporte y periodo

## Objetivo

En Evolución cardiovascular, mostrar el tiempo registrado en cada zona de frecuencia cardiaca para el deporte y el periodo seleccionados, comparando el tramo reciente con el tramo anterior de la misma duración.

## Diseño

- Añadir un bloque «Tiempo en zonas de FC» dentro del análisis del deporte seleccionado.
- Mantener sincronizados deporte y periodo con los selectores existentes.
- Mostrar Z1–Z5 con su color, duración del tramo reciente y duración del tramo anterior.
- Reutilizar los registros guardados en `activity_heart_rate_zones` asociados a sesiones de proveedores que envían directamente las zonas y a las dos ventanas del periodo.
- Excluir zonas estimadas durante la importación mientras la tabla no guarde la procedencia de cada registro. En el código actual, WHOOP es el único importador cuyas zonas se construyen directamente desde `score.zone_durations`.
- Indicar que algunos dispositivos no ofrecen un desglose verificable de zonas.
- Mostrar un estado informativo cuando falten registros de zonas y un mensaje de error si no se pueden cargar.
- Mantener aparte el resumen cardiovascular global de los últimos siete días.
- Mantener el icono de mancuerna para `gym` y para el alias `strength` en el selector de deportes.

## Límites y datos

- No inferir zonas en el frontend a partir de la frecuencia cardiaca media, máxima ni de muestras incompletas.
- No recalcular los umbrales ni presentar los límites de una zona como equivalentes entre relojes.
- Usar solo los totales de zona enviados directamente por el proveedor. No presentar estimaciones de importación como zonas verificadas.
- La tabla actual no persiste la procedencia por fila, así que la lista permitida debe limitarse a proveedores cuyo mapper garantiza zonas nativas; actualmente solo WHOOP cumple esa condición.
- No se requieren cambios de backend, esquema ni migraciones.

## Verificación

- Verificar la agregación reciente/anterior por sesión con datos válidos, datos ausentes y filas inválidas.
- Ejecutar el typecheck, formato y lint requeridos por el repositorio.
- Revisar en la interfaz los estados con zonas, sin zonas y con error de carga.

## Revisión propia

- El diseño conserva el resumen global existente y evita mezclarlo con el análisis del deporte seleccionado.
- Los bloques de zonas solo describen totales enviados directamente por los proveedores admitidos; otros deportes o fuentes pueden no mostrar datos.
- El diseño no cambia el icono ya configurado para gimnasio ni introduce cambios de backend.
