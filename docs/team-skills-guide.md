# Alzan Team Skills Guide

Esta guía explica, en lenguaje claro, qué hace cada skill del proyecto, cuándo conviene usarla, qué problemas evita y cómo se aplicaría en un caso real de Alzan.

Está pensada para el equipo: Codex, Antigravity y cualquier persona que quiera entender rápido qué herramienta mental usar en cada tipo de tarea.

## Cómo leer esta guía

- `Qué hace`: para qué sirve la skill en la práctica.
- `Cuándo usarla`: el tipo de tarea donde aporta valor real.
- `Qué evita`: el error típico que ayuda a no cometer.
- `Ejemplo real en Alzan`: un caso concreto para aterrizarla.

## Frontend

### `fe-mobile-ui-ux-direction`

**Qué hace**  
Da una dirección clara para diseñar pantallas y componentes mobile-first en Alzan. Ayuda a decidir jerarquía visual, colocación de acciones, navegación, safe areas, motion y tono visual sin caer en patrones web.

**Cuándo usarla**  
Cuando se diseña o rehace una pantalla, un flujo o un componente visual de la app móvil.

**Qué evita**  
Evita interfaces que parecen una web encogida, CTAs mal colocados, exceso de efectos visuales y layouts poco táctiles o poco claros.

**Ejemplo real en Alzan**  
Rediseñar la pantalla de perfil, el feed social o una vista de métricas de wearables para que se sienta realmente de móvil y no solo “bonita”.

### `fe-react-native-expert-developer`

**Qué hace**  
Instruye al agente de IA con las reglas universales (cursor.directory) para generar código React Native/Expo: uso exclusivo de Componentes Funcionales, optimización de listas (FlatList/FlashList) y tipado fuerte.

**Cuándo usarla**  
Cuando pidas a la IA que programe nuevas pantallas, rediseñe componentes o construya interfaces Expo desde cero.

**Qué evita**  
Evita que la IA degenere el código produciendo antiguas clases de React, funciones de renderizado ineficientes en listas, o estilos mal montados.

**Ejemplo real en Alzan**  
Pedir la creación de un nuevo `WorkoutList` y asegurar que la IA usa FlashList y no rompe el rendimiento.

### `fe-react-native-best-practices`

**Qué hace**  
Recoge buenas prácticas técnicas de React Native y Expo para mejorar rendimiento, startup, animaciones, listas, bundle y uso de recursos.

**Cuándo usarla**  
Cuando hay pantallas lentas, listas grandes, jank, problemas de memoria o dudas de arquitectura móvil.

**Qué evita**  
Evita re-renders caros, listas mal implementadas, bundles pesados y animaciones poco fluidas.

**Ejemplo real en Alzan**  
Optimizar el feed social, las gráficas de salud o una lista larga de entrenamientos para que no tiren de más del hilo JS.

### `fe-react-component-performance`

**Qué hace**  
Se centra en componentes concretos que están renderizando demasiado o tienen trabajo innecesario en cada render.

**Cuándo usarla**  
Cuando el problema no es “toda la pantalla”, sino una card, un gráfico, un header o un componente muy usado.

**Qué evita**  
Evita memoizaciones mal aplicadas, props inestables y componentes que hacen más trabajo del necesario.

**Ejemplo real en Alzan**  
Arreglar una `FeedCard`, un `StatsCard` o un componente de onboarding que se recalcula demasiadas veces.

### `fe-manage-translations`

**Qué hace**  
Define cómo añadir, cambiar o borrar textos visibles al usuario sin romper el sistema de traducciones.

**Cuándo usarla**  
Siempre que haya cambios en copy, labels, mensajes, placeholders, botones o textos de error.

**Qué evita**  
Evita claves desalineadas, textos en un idioma sí y en otro no, o referencias rotas en `i18n`.

**Ejemplo real en Alzan**  
Añadir textos nuevos para social, onboarding, ajustes o nutrición manteniendo `en.ts` y `es.ts` sincronizados.

### `fe-upgrading-expo`

**Qué hace**  
Guía upgrades de Expo SDK y dependencias relacionadas de forma controlada.

**Cuándo usarla**  
Cuando se quiere subir versión de Expo o revisar si una dependencia móvil sigue siendo compatible.

**Qué evita**  
Evita migraciones a ciegas, incompatibilidades nativas y upgrades que rompen la app por cambios del ecosistema.

**Ejemplo real en Alzan**  
Pasar a un nuevo SDK Expo revisando compatibilidad con navegación, build properties y módulos usados en la app.

### `fe-expo-cicd-workflows`

**Qué hace**  
Ayuda a definir y mantener workflows de CI/CD para Expo y EAS.

**Cuándo usarla**  
Cuando se montan pipelines de build, preview, release o automatización móvil.

**Qué evita**  
Evita YAML frágiles, automatizaciones inconsistentes y procesos manuales difíciles de repetir.

**Ejemplo real en Alzan**  
Preparar workflows de preview build o automatizar releases internas del equipo móvil.

## Frontend Design / Taste

### `fe-design-taste-frontend`

**Qué hace**  
Empuja una dirección visual mucho más ambiciosa y menos genérica. Fuerza jerarquía fuerte, layouts con más intención, mejor criterio tipográfico y decisiones de diseño menos "default LLM".

**Cuándo usarla**  
Cuando queremos explorar una propuesta visual más potente, con más personalidad, o salir de soluciones demasiado neutras.

**Qué evita**  
Evita interfaces correctas pero olvidables, demasiado simétricas o con estética AI genérica.

**Ejemplo real en Alzan**  
Explorar un nuevo concepto visual para el feed social, onboarding premium o una landing interna de producto antes de aterrizarlo en componentes RN.

### `fe-emil-design-eng`

**Qué hace**  
Aporta criterio fino de detalle, polish y animación. Está muy enfocada en las pequeñas decisiones invisibles que hacen que una interfaz se sienta cuidada.

**Cuándo usarla**  
Cuando una UI ya funciona, pero queremos mejorar sensaciones, feedback, timings, microinteracciones o calidad percibida.

**Qué evita**  
Evita animaciones torpes, transiciones vagas y detalles que hacen que una interfaz se sienta barata o poco refinada.

**Ejemplo real en Alzan**  
Refinar el comportamiento de botones, sheets, toasts o transiciones entre estados en pantallas de salud o social.

### `fe-gpt-taste`

**Qué hace**  
Empuja composiciones muy creativas, con más riesgo visual, motion fuerte y estructura más editorial o cinematográfica.

**Cuándo usarla**  
Cuando buscamos ideas visuales rompedoras, conceptos de alto impacto o una dirección más atrevida para marketing interno, branding o exploración de nuevas superficies.

**Qué evita**  
Evita caer siempre en la misma estructura visual y en layouts demasiado previsibles.

**Ejemplo real en Alzan**  
Idear una experiencia potente para presentar visualmente logros, progreso o una futura narrativa de datos de wearables.

### `fe-high-end-visual-design`

**Qué hace**  
Da una referencia de diseño “agencia premium”: espaciado amplio, motion con peso, contenedores más sofisticados y sensación visual de producto caro y pulido.

**Cuándo usarla**  
Cuando queremos subir mucho el nivel de una interfaz concreta y explorar acabados visuales de alta calidad.

**Qué evita**  
Evita layouts planos, sombras y bordes genéricos, y soluciones que parecen plantilla.

**Ejemplo real en Alzan**  
Explorar una versión más premium de profile, settings o una pantalla aspiracional de progreso personal.

### `fe-minimalist-ui`

**Qué hace**  
Empuja una estética editorial, limpia y muy contenida. Prioriza claridad, aire, monocromo cálido y una interfaz más silenciosa.

**Cuándo usarla**  
Cuando buscamos una dirección más sobria, utilitaria y elegante, especialmente en zonas donde la legibilidad y la calma visual importan mucho.

**Qué evita**  
Evita recargar pantallas con adornos, gradientes o demasiado ruido visual.

**Ejemplo real en Alzan**  
Pensar una interfaz muy clara para settings, historial de salud, lectura de métricas o pantallas de configuración sensible.

### `fe-ui-ux-pro-max`

**Qué hace**  
Sirve como biblioteca muy amplia de criterio UI/UX para web y móvil: estilos, tipografía, paletas, componentes, patrones de interacción y razonamiento de diseño.

**Cuándo usarla**  
Cuando hace falta explorar muchas direcciones visuales, comparar estilos o revisar una interfaz con una base más amplia de heurísticas de diseño.

**Qué evita**  
Evita diseñar a ojo sin referencias suficientes o quedarse bloqueado cuando no está claro qué lenguaje visual encaja mejor.

**Ejemplo real en Alzan**  
Explorar varias direcciones para una nueva superficie social o una experiencia de datos de salud antes de aterrizar la solución móvil final con las skills RN específicas.

## Shared FE + BE + DB

### `shared-pnpm-quality-gate`

**Qué hace**  
Marca el mínimo de calidad antes de cerrar trabajo de código en el monorepo. Distingue entre gate local obligatorio y checks más parecidos a GitHub.

**Cuándo usarla**  
Después de cualquier cambio de código en FE o BE.

**Qué evita**  
Evita dar por buena una tarea sin pasar format/lint o sin aclarar qué nivel de verificación se ha hecho.

**Ejemplo real en Alzan**  
Tras tocar frontend o backend, pasar `pnpm format` y `pnpm run lint:check`; si además importa la paridad con CI, añadir `generate-openapi` y checks equivalentes.

### `shared-database-schema`

**Qué hace**  
Da acceso al esquema real de base de datos para responder con tablas, columnas y relaciones correctas.

**Cuándo usarla**  
Cuando alguien pregunta por el modelo de datos o hay que diseñar encima del esquema actual.

**Qué evita**  
Evita inventarse cómo está modelado algo en la base de datos.

**Ejemplo real en Alzan**  
Revisar cómo guardar métricas de salud, relaciones de usuario o futuras entidades sociales.

### `shared-supabase-expert-developer`

**Qué hace**  
Fuerza a la IA a usar los patrones estándar de Supabase extraídos de cursor.directory: validación estricta de TypeScript con `Database` Types, chequeo de objetos de error nativos y prevención de Server Roles en cliente.

**Cuándo usarla**  
Cuando se pida a la IA que conecte el frontend con Supabase, diseñe hooks de datos, o implemente auth en backend.

**Qué evita**  
Evita que la IA escriba SQL raw inseguro, se salte chequeos de red, o ignore el modelo estricto de RLS.

**Ejemplo real en Alzan**  
Crear un hook para fetchear métricas de salud tipando la respuesta automáticamente usando Types generados.

### `shared-supabase-postgres-best-practices`

**Qué hace**  
Reúne buenas prácticas de Postgres y Supabase para rendimiento, modelado, índices y seguridad de datos.

**Cuándo usarla**  
Cuando se escriben queries, se diseñan tablas, se crean migraciones o se ajusta RLS.

**Qué evita**  
Evita tablas lentas, consultas pobres, índices que faltan y reglas RLS mal montadas.

**Ejemplo real en Alzan**  
Optimizar consultas de actividad, métricas históricas o datos de sincronización con dispositivos externos.

### `shared-api-design`

**Qué hace**  
Ayuda a diseñar APIs consistentes, entendibles y fáciles de mantener.

**Cuándo usarla**  
Cuando se crean o revisan endpoints, respuestas, errores, paginación o filtros.

**Qué evita**  
Evita contratos inconsistentes, errores ambiguos y decisiones improvisadas en los endpoints.

**Ejemplo real en Alzan**  
Diseñar endpoints para feed, perfiles, mensajes, objetivos, stats o integraciones.

### `shared-backend-patterns`

**Qué hace**  
Da una base de patrones para estructurar backend con servicios, controladores, repositorios y responsabilidades claras.

**Cuándo usarla**  
Cuando se implementa lógica de backend o se reorganiza código de servidor.

**Qué evita**  
Evita controladores gigantes, lógica duplicada y capas mal separadas.

**Ejemplo real en Alzan**  
Organizar mejor módulos de usuarios, métricas, integraciones o capa social.

### `shared-nestjs-expert-developer`

**Qué hace**  
La "Biblia" de parámetros para agentes extraída del repositorio awesome-cursorrules. Impone *RO-RO*, *Clean Architecture*, uso estricto de DTOs, y el patrón Assess-Act-Arrange para test unitarios sin cargar `TestingModule`.

**Cuándo usarla**  
Siempre que un agente genere o refactorice un Servicio, un Controlador o un Test de NestJS.

**Qué evita**  
Evita que la IA mezcle lógica de base de datos con controladores, genere tests insoportablemente pesados y viole principios SOLID.

**Ejemplo real en Alzan**  
Pedir a la IA "crea los test unitarios para el AuthService" y forzarla a usar Mocks aislados en vez del contenedor entero.

### `shared-nestjs-patterns`

**Qué hace**  
Especializa la parte backend en NestJS: módulos, DTOs, validación, guards e infraestructura típica del framework.

**Cuándo usarla**  
Cuando el trabajo es claramente de NestJS.

**Qué evita**  
Evita usar NestJS de forma desordenada o mezclar responsabilidades sin criterio.

**Ejemplo real en Alzan**  
Crear un módulo nuevo para social, exportación de datos o sincronización con proveedores externos.

### `shared-security-review`

**Qué hace**  
Sirve para revisar cambios sensibles desde el punto de vista de seguridad.

**Cuándo usarla**  
Cuando se toca auth, permisos, input de usuario, secretos, credenciales o datos sensibles.

**Qué evita**  
Evita agujeros de seguridad, permisos flojos y validaciones insuficientes.

**Ejemplo real en Alzan**  
Revisar endpoints autenticados, privacidad del perfil o conexión con terceros.

### `shared-e2e-testing`

**Qué hace**  
Guía la creación y mantenimiento de tests end-to-end centrados en flujos de usuario reales.

**Cuándo usarla**  
Cuando se quiere validar comportamiento completo, no solo funciones aisladas.

**Qué evita**  
Evita regresiones funcionales en caminos importantes del producto.

**Ejemplo real en Alzan**  
Cubrir login, onboarding, crear un entreno, navegar por tabs o completar un flujo de settings.

### `shared-coding-standards`

**Qué hace**  
Marca el suelo común de calidad de código para todo el proyecto.

**Cuándo usarla**  
Cuando se quiere mantener consistencia general de nombres, estructura y legibilidad.

**Qué evita**  
Evita código difícil de leer, inconsistente o costoso de revisar.

**Ejemplo real en Alzan**  
Refactors generales que afectan a varias áreas del repo.

### `shared-technical-documentation`

**Qué hace**  
Ayuda a redactar documentación técnica clara, escaneable y útil para el lector real.

**Cuándo usarla**  
Cuando se escriben READMEs, docs de arquitectura, setup, runbooks o guías de módulos.

**Qué evita**  
Evita documentación larga pero poco útil, confusa o mal estructurada.

**Ejemplo real en Alzan**  
Mejorar una guía de arquitectura o una documentación de un módulo concreto.

### `shared-alzan-local-docs-sync-from-code`

**Qué hace**  
Se asegura de que la documentación esté alineada con el código y no con supuestos antiguos.

**Cuándo usarla**  
Cuando se quiere revisar si una doc sigue siendo verdad o hay que sincronizar documentación con el repo actual.

**Qué evita**  
Evita documentación desactualizada o drift entre código y docs.

**Ejemplo real en Alzan**  
Revisar si las docs de training, health o arquitectura siguen reflejando lo que realmente hay implementado.

### `shared-skill-crafter-perfect`

**Qué hace**  
Guía la creación de nuevas skills internas con estructura, disparadores y recursos bien pensados.

**Cuándo usarla**  
Cuando detectamos un patrón repetido y queremos convertirlo en una skill reutilizable.

**Qué evita**  
Evita que procesos importantes solo vivan en la cabeza de alguien o queden descritos de forma floja.

**Ejemplo real en Alzan**  
Crear una skill futura para UX de wearables, moderación social o flujos de sincronización.

### `shared-no-commit-without-approval`

**Qué hace**  
Impone una regla de seguridad git: el agente no publica cambios por su cuenta.

**Cuándo usarla**  
Siempre en este repo.

**Qué evita**  
Evita commits, pushes, tags o resets no deseados desde el agente.

**Ejemplo real en Alzan**  
Si alguien pide “haz commit”, el agente devuelve el texto del commit, pero no ejecuta git.

### `shared-commit-generator`

**Qué hace**  
Genera mensajes de commit en formato Conventional Commit y un resumen claro de cambios.

**Cuándo usarla**  
Cuando el usuario pide nombre de commit, resumen de cambios o texto para publicar actualizaciones.

**Qué evita**  
Evita mensajes de commit vagos o inconsistentes.

**Ejemplo real en Alzan**  
Preparar un `feat`, `fix` o `docs` listo para usar junto a un resumen entendible en español.

## Proceso / Superpowers

### `shared-using-superpowers`

**Qué hace**  
Recuerda que el sistema debe trabajar con skills y no solo improvisando.

**Cuándo usarla**  
Cuando se trabaja con el pack de superpowers y hay que decidir qué skill aplicar.

**Qué evita**  
Evita saltarse workflows importantes.

**Ejemplo real en Alzan**  
Detectar que antes de depurar toca usar debugging o que antes de diseñar toca usar brainstorming.

### `shared-brainstorming`

**Qué hace**  
Ayuda a pensar bien una solución antes de implementarla.

**Cuándo usarla**  
Cuando hay una feature nueva, una decisión de UX o una idea todavía abierta.

**Qué evita**  
Evita picar código demasiado pronto sobre una idea mal definida.

**Ejemplo real en Alzan**  
Definir cómo debe funcionar el feed social o la conexión con wearables antes de implementar nada.

### `shared-writing-plans`

**Qué hace**  
Convierte una necesidad grande en un plan de trabajo entendible y ejecutable.

**Cuándo usarla**  
Cuando la tarea tiene varias fases o varias piezas.

**Qué evita**  
Evita empezar sin mapa y acabar mezclando pasos o dejando huecos.

**Ejemplo real en Alzan**  
Planear una integración externa, una gran refactorización o un módulo nuevo.

### `shared-executing-plans`

**Qué hace**  
Sirve para ejecutar un plan ya escrito con orden y puntos de control.

**Cuándo usarla**  
Cuando ya hay estrategia definida y toca pasar a ejecución disciplinada.

**Qué evita**  
Evita desviarse del plan o perder el hilo a mitad del trabajo.

**Ejemplo real en Alzan**  
Ejecutar una hoja de ruta para refactor de navegación o backend.

### `shared-dispatching-parallel-agents`

**Qué hace**  
Ayuda a dividir trabajo independiente en paralelo.

**Cuándo usarla**  
Cuando hay varias subtareas que no dependen entre sí.

**Qué evita**  
Evita hacerlo todo en serie cuando se puede avanzar más rápido.

**Ejemplo real en Alzan**  
Separar revisión de FE, BE y documentación en trabajos paralelos.

### `shared-subagent-driven-development`

**Qué hace**  
Organiza mejor el trabajo con subagentes, revisiones y ownership.

**Cuándo usarla**  
Cuando una ejecución paralela requiere más estructura y control.

**Qué evita**  
Evita paralelizar sin coordinación ni criterios de revisión.

**Ejemplo real en Alzan**  
Dividir una implementación grande entre frontend, backend y revisión de calidad.

### `shared-test-driven-development`

**Qué hace**  
Empuja a pensar primero el comportamiento esperado y luego la implementación.

**Cuándo usarla**  
Cuando se implementan features o fixes donde el comportamiento importa mucho.

**Qué evita**  
Evita desarrollar “a ojo” sin definir qué debería pasar.

**Ejemplo real en Alzan**  
Validar reglas de negocio de stats, cálculos o endpoints.

### `shared-systematic-debugging`

**Qué hace**  
Da un método para depurar con causa raíz y no con parches aleatorios.

**Cuándo usarla**  
Cuando hay bugs, fallos raros o errores intermitentes.

**Qué evita**  
Evita arreglos superficiales que no resuelven el problema real.

**Ejemplo real en Alzan**  
Investigar por qué falla login, una query, una sync externa o una pantalla concreta.

### `shared-requesting-code-review`

**Qué hace**  
Sirve para pedir revisión de forma útil cuando el trabajo ya está avanzado o terminado.

**Cuándo usarla**  
Cuando conviene un segundo pase técnico antes de dar algo por cerrado.

**Qué evita**  
Evita cerrar trabajo con fallos que se podían haber detectado antes.

**Ejemplo real en Alzan**  
Pedir revisión antes de dar por terminado un módulo importante.

### `shared-receiving-code-review`

**Qué hace**  
Ayuda a procesar feedback con criterio técnico.

**Cuándo usarla**  
Cuando llega revisión y hay que decidir qué aplicar y cómo.

**Qué evita**  
Evita aceptar comentarios de forma automática sin comprobar si tienen razón.

**Ejemplo real en Alzan**  
Revisar una sugerencia de arquitectura o de refactor sin romper el diseño actual.

### `shared-verification-before-completion`

**Qué hace**  
Obliga a verificar antes de afirmar que algo ya está bien.

**Cuándo usarla**  
Antes de dar una tarea por terminada.

**Qué evita**  
Evita decir “está hecho” sin evidencia real.

**Ejemplo real en Alzan**  
No cerrar una tarea sin haber pasado los checks relevantes.

### `shared-using-git-worktrees`

**Qué hace**  
Ayuda a usar worktrees para aislar trabajo de forma segura.

**Cuándo usarla**  
Cuando conviene separar líneas de cambio o experimentar sin ensuciar el workspace principal.

**Qué evita**  
Evita mezclar trabajos distintos en el mismo árbol.

**Ejemplo real en Alzan**  
Preparar un espacio separado para una feature grande o una exploración compleja.

### `shared-finishing-a-development-branch`

**Qué hace**  
Ayuda a cerrar una rama o una línea de trabajo con criterio.

**Cuándo usarla**  
Cuando una implementación ya está terminada y toca decidir cómo dejarla lista.

**Qué evita**  
Evita finales ambiguos o ramas que se quedan a medias.

**Ejemplo real en Alzan**  
Dejar una rama lista para revisión interna o siguiente paso del equipo.

### `shared-writing-skills`

**Qué hace**  
Enseña a escribir y mantener skills bien diseñadas.

**Cuándo usarla**  
Cuando se crea, mejora o reorganiza una skill.

**Qué evita**  
Evita skills ambiguas, mal descubiertas o difíciles de usar correctamente.

**Ejemplo real en Alzan**  
Mejorar `shared-pnpm-quality-gate` o crear una skill nueva de producto.

## Recomendación rápida por tipo de trabajo

- Si tocas UI móvil: `fe-mobile-ui-ux-direction`
- Si tocas rendimiento RN: `fe-react-native-best-practices`
- Si tocas textos: `fe-manage-translations`
- Si tocas endpoints: `shared-api-design` + `shared-nestjs-patterns`
- Si tocas datos o SQL: `shared-database-schema` + `shared-supabase-postgres-best-practices`
- Si tocas auth o permisos: `shared-security-review`
- Si tocas documentación: `shared-technical-documentation`, y si hay riesgo de drift también `shared-alzan-local-docs-sync-from-code`
- Si tocas cualquier código: `shared-pnpm-quality-gate`
