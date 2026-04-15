---
name: shared-commit-generator
description: Genera mensajes de commit en formato estándar Angular/Conventional Commits en inglés junto a un resumen/changelog en español orientado a usuarios finales. Úsalo cuando el usuario pida un nombre de commit, resumen de cambios o texto para publicar actualizaciones.
---

# Commit & Changelog Generator

Esta skill se encarga de estandarizar la forma en la que se documentan los cambios en el proyecto.

Cuando el usuario pida "un nombre para el commit", "un resumen de los cambios" o "qué poner en el commit", DEBES generar un bloque con dos partes claramente diferenciadas:

## Disparadores obligatorios (MUST)

Si el mensaje del usuario contiene intención de commit, esta skill es obligatoria.
Ejemplos de intención:

- "commit"
- "dame el commit"
- "nombre del commit"
- "commit name"
- "mensaje de commit"
- "dame el nombre en inglés"
- "title + description del commit"

En estos casos, SIEMPRE responde con:

1. Commit (inglés, Conventional Commit)
2. Descripción/update (español, lista para release/update)

## 1. El Mensaje de Commit (en Inglés)

Utiliza el estándar estricto de **Conventional Commits** (también conocido como formato Angular). Es el estándar de la industria más robusto y adecuado (superior al formato con barras `feat/` que se suele usar más para ramas).

**Estructura:**
`<tipo>(<scope opcional>): <descripción corta en imperativo>`

**Reglas para el Commit:**

- **Idioma:** INGLÉS estricto.
- **Tipos permitidos:**
  - `feat`: (Feature) Una nueva característica.
  - `fix` o `bug`: (Bug fix) Resolución de un error o fallo específico.
  - `docs`: Cambios únicamente en la documentación.
  - `style`: Cambios que no afectan el significado del código (espacios, formateo, etc).
  - `refactor`: Un cambio en el código que ni arregla un error ni añade una característica.
  - `perf`: Un cambio que mejora el rendimiento.
  - `test`: Añadir tests que faltaban o corregir tests existentes.
  - `chore`: Cambios en el proceso de build o herramientas auxiliares y librerías.
- **Descripción:** Escrita en minúsculas y modo imperativo (ej. `add user login` en lugar de `added user login` o `adds user login`). Sin punto final.

**Ejemplo:** `feat(auth): implement google social login`

_(Nota: Si el usuario te pidió explícitamente el formato con barra como `feat/mi-commit`, infórmale sutilmente que el formato `feat:` es el estándar oficial para Commits y el de barra se reserva para nombrar Ramas (branches), pero dale ambas opciones por si necesita crear la rama)._

## 2. El Resumen de Actualización / Changelog (en Español)

Genera un texto orientado a producto/negocio, ideal para publicar en las "Release Notes", redes sociales o comunicaciones a usuarios sobre lo que incluye esta nueva versión.

**Reglas para el Changelog:**

- **Idioma:** ESPAÑOL.
- **Tono:** Entusiasta, profesional y claro ("modo update").
- **Enfoque:** Qué gana el usuario o qué mejora en la app, NO los detalles técnicos del código. Evita hablar de archivos modificados o variables.

**Ejemplo de formato esperado del Output:**

```markdown
### Commit (EN)

`<conventional-commit>`
_(Opcional - Si precisas nombrar la rama: `feat/mi-rama`)_

### Update (ES)

<1-3 frases claras orientadas a producto. Entusiastas, enumerando qué gana el usuario>
```
