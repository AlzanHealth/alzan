# Mejoras de favoritos y plantillas de comidas — Plan de implementación

> **Para agentes:** este plan se ejecuta en la rama actual sin commits automáticos.

**Objetivo:** hacer que favoritos y recetas guardadas funcionen como una biblioteca de plantillas clara, resistente a errores y reutilizable desde móvil y web.

**Arquitectura:** se conservarán `recipes`, `recipe_favorites` y `recipe_items`. La lógica de ordenación, actualización optimista y mensajes de error se mantendrá tipada y testeable fuera de la vista; la pantalla solo coordinará consultas, mutaciones y estados visuales.

**Tecnologías:** React Native/Expo, TypeScript, TanStack Query, Supabase, react-i18next y Node test runner existente.

## Archivos previstos

- Modificar `alzan-fe/src/modules/nutrition/services/recipeLibraryService.ts`: incluir fecha de creación, errores de dominio y operaciones de favorito con resultado explícito.
- Crear `alzan-fe/src/modules/nutrition/services/recipeLibraryPlanner.ts`: ordenar recetas personales y validar resultados de detalle sin depender de React.
- Modificar `alzan-fe/src/modules/nutrition/components/RecipeDetailModal.tsx`: distinguir carga, vacío y error con reintento.
- Modificar `alzan-fe/src/screens/nutrition/RecipeLibraryScreen.tsx`: actualización optimista, rollback, estados de consulta, nombre claro de la pestaña y orden por creación.
- Modificar `alzan-fe/src/i18n/locales/en.ts` y `alzan-fe/src/i18n/locales/es.ts`: textos nuevos sincronizados.
- Crear pruebas junto a los servicios para cubrir la lógica pura y la regresión de errores.

## Secuencia

1. Escribir pruebas que fallen para orden por creación, estado favorito optimista y validación de detalle.
2. Ejecutar las pruebas y confirmar que fallan por la funcionalidad ausente.
3. Implementar el mínimo necesario en servicios y planificador.
4. Integrar la mutación optimista en la pantalla y actualizar los estados de error/reintento.
5. Ejecutar pruebas específicas, typecheck, formato y lint; revisar el diff y no modificar Supabase.
