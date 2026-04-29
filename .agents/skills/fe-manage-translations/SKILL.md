---
name: fe-manage-translations
description: 'Guía maestra y obligatoria para añadir, modificar o gestionar sistema de traducciones internacionales (i18n) en Alzan'
---

# Gestión de Traducciones en Alzan (i18n)

Esta skill define el procedimiento estricto que debes seguir siempre que necesites añadir, modificar o eliminar textos en la interfaz humana de la aplicación.

## 📁 Archivos Clave

El sistema de traducciones se basa en **dos archivos principales** ubicados en el directorio `src/i18n/locales/`:

1. **`en.ts` (Inglés - MASTER)**: Es la fuente de la verdad para todas las claves (keys). El tipado del sistema nace de aquí.
2. **`es.ts` (Español)**: Importa el tipo directo desde `en.ts` (`typeof en`). Esto significa que **TypeScript fallará inmediatamente** si existe una clave aquí que no existe en el archivo maestro inglés.

---

## 🛠 Procedimiento de Inserción (Paso a Paso)

Cuando necesites añadir un nuevo texto a la interfaz de usuario, sigue **ESTRICTAMENTE** este orden:

### 0️⃣ Comprobar si la traducción ya existe (¡CRÍTICO!)

Antes de crear una nueva traducción, debes comprobar obligatoriamente si el texto o uno muy similar ya existe en los archivos `en.ts` o `es.ts` (por ejemplo, en la sección `common`).

- Si ya existe y el contexto es el mismo (ej: botones "Guardar", "Aceptar", etc.), **DEBES REUTILIZAR** la clave existente en lugar de crear una nueva.
- Solo si no existe un texto equivalente o si el contexto difiere completamente, pasa al siguiente paso.

### 1️⃣ Identifica el contexto o sección

Las traducciones están divididas modularmente mediante objetos (ej. `common`, `auth`, `training`, `nutrition`, `settings`, `health`, `onboarding`, `home`, `alzan`).

Determina a qué módulo pertenece tu texto. Si no estás seguro, agrégalo a la sección más relevante para la pantalla donde se muestra o en `common` si es genérico.

### 2️⃣ Añadir en el archivo MASTER (`en.ts`)

Abre `src/i18n/locales/en.ts`. Dirígete a la sección elegida y añade la clave en formato `camelCase` con su valor en **inglés**.

```typescript
// src/i18n/locales/en.ts
const en = {
  // ...
  training: {
    // ... otras claves ...
    newFeatureTitle: 'New Feature Title', // Añadir aquí
  },
};
```

### 3️⃣ Añadir en el archivo ES (`es.ts`)

Abre `src/i18n/locales/es.ts`. Dirígete a la EXACTAMENTE la misma sección y añade la MISMA CLAVE EXACTA con su traducción el **español**.

```typescript
// src/i18n/locales/es.ts
import en from './en';

export default {
  // ...
  training: {
    // ... otras claves ...
    newFeatureTitle: 'Título de la Nueva Característica', // Misma clave que en.ts
  },
}; // ...
```

### 4️⃣ Uso en Componentes (React/React Native)

Una vez creadas las claves en ambos archivos, ya puedes usar el hook `useTranslation` de `react-i18next` en tus componentes funcionales:

```tsx
import { useTranslation } from 'react-i18next';

export const MyScreen = () => {
  const { t } = useTranslation();

  return (
    <Text>{t('training.newFeatureTitle')}</Text> // Formato: 'namespace.clave'
  );
};
```

---

## 📅 Fechas y Localización (dateLocale.ts)

Para asegurar que las fechas se formatean correctamente en toda la aplicación según el idioma del usuario, **TODO EL CÓDIGO NUEVO O MODIFICADO QUE MUESTRE FECHAS DEBE UTILIZAR `src/i18n/dateLocale.ts`**. Nunca uses configuraciones locales sueltas ni formatées manualmente las fechas; utiliza SIEMPRE las utilidades ya preparadas en este script:

1. **`formatLocalizedDate(date, patterns)`**: Utilízalo para formatear fechas a nivel complejo apoyándote en `date-fns`. Pasas la fecha y los patrones string diferenciados para inglés y español.

   ```tsx
   import { formatLocalizedDate } from '../../i18n/dateLocale';

   const formatted = formatLocalizedDate(new Date(), {
     en: 'EEEE, MMMM d',
     es: "EEEE, d 'de' MMMM",
   });
   ```

2. **`getLocaleTag()`**: Útil para obtener el string estándar de la localización activa (`en-US` o `es-ES`). Perfecto para APIs nativas de JavaScript como `toLocaleDateString` o `Intl`.

   ```tsx
   import { getLocaleTag } from '../../i18n/dateLocale';

   const str = date.toLocaleDateString(getLocaleTag(), { day: 'numeric', month: 'short' });
   ```

3. **`getDateFnsLocale()`**: Devuelve el objeto `locale` completo de `date-fns` (`enUS` o `es`). Úsalo si requieres llamar a funciones de `date-fns` nativas que aceptan `{ locale }`.

---

## 🚨 Reglas de Oro (CRÍTICAS)

- **Regla de la Sincronía**: Nunca dejes una clave "huérfana". Lo que añadas, borres o modifiques en `en.ts` debes replicarlo exactamente en `es.ts`.
- **Regla del Naming**: Las claves DEBEN escribirse en `camelCase` (ej: `saveButton`, `errorMessage`). NUNCA uses `snake_case` ni `kebab-case`.
- **Regla del TypeScript**: Recuerda que si el usuario reporta un error de TypeScript en `es.ts` del estilo _"Type '{...}' is not assignable to type '{...}'"_, el 99% de las veces es porque falta una clave en uno de los dos archivos o la clave está mal escrita (case sensitivity).
- **Prohibido Modificar Textos Existentes sin Permiso**: Si el usuario te pide añadir algo nuevo basándose en traducciones existentes, limita tus cambios única y exclusivamente a tus nuevas inclusiones.
- **Evita Variables Puras**: Salvo que la librería configure parametrización compleja, crea textos completos. Si necesitas unir componentes dinámicos como números, divídelos lógicamente si el contexto lo requiere o utiliza la interpolación nativa si i18next lo tiene configurado así.
