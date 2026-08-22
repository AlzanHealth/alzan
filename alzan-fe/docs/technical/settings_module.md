# Módulo de Configuración - Documentación Técnica

## Arquitectura

### Estructura

src/screens/settings/
├── SettingsHomeScreen.tsx # Menú principal
├── ProfileSettingsScreen.tsx # Editar perfil (Nombre, bio, foto)
├── PreferencesScreen.tsx # Preferencias (Unidades, métricas, etc.)
├── ObjectivesSettingsScreen.tsx # Objetivos fitness (Global targets)
├── ConnectedAppsScreen.tsx # Apps externas
├── AccountScreen.tsx # Gestión de cuenta
├── LegalScreen.tsx # Términos y Privacidad
├── PrivacyDataScreen.tsx # Privacidad y eliminación (Delete account)
├── SecurityScreen.tsx # Seguridad y contraseña
└── SupportScreen.tsx # Soporte técnico

### 6. Ajustes de Entrenamiento y Nutrición

Se han centralizado aquí los ajustes específicos de los módulos:

- `TrainingSettingsScreen.tsx`: En `src/screens/training/`
- `NutritionSettingsScreen.tsx`: En `src/screens/nutrition/`
- `DataExportScreen.tsx`: En `src/screens/settings/`
- `PrivacyDataScreen.tsx`: En `src/screens/settings/`

````

**Location**: `src/screens/settings/`

---

## Componentes Principales

### 1. PreferencesScreen
**Archivo**: [`src/screens/settings/PreferencesScreen.tsx`](file:///Users/josep/Projectos/alzan/src/screens/settings/PreferencesScreen.tsx)



**Otras Preferencias**:
- Unidad de distancia (km/mi)
- Unidad de temperatura (°C/°F)
- Notificaciones
- Tema (claro/oscuro)

---

### 2. ProfileScreen
- Editar nombre
- Editar bio
- Actualizar altura
- Actualizar peso inicial
- Cambiar foto de perfil

### 3. GoalsScreen
- Objetivo principal (perder peso, ganar músculo, etc.)
- Peso objetivo
- Calorías objetivo (override TDEE)
- Actividad semanal objetivo

### 4. ConnectedAppsScreen
- Gestiona Strava, Suunto, Polar, Apple Health, Health Connect y COROS.
- COROS consulta primero `/wearables/cloud/coros/capability`, por lo que la tarjeta solo aparece para usuarios permitidos por el rollout del backend.
- La conexión y los entrenamientos no dependen del consentimiento de salud; antes de importar pasos, sueño, RHR o HRV se solicita consentimiento explícito vigente. La desconexión usa el backend para revocar y borrar datos, no elimina directamente la fila Supabase.

### 5. DataExportScreen (GDPR)
- Exportar todos los datos a JSON
- Portabilidad de datos

### 6. DeleteAccountScreen (GDPR)
- Eliminación completa de cuenta
- Confirmación con password
- Derecho al olvido

- Confirmación con password
- Derecho al olvido
- **Implementación Técnica**: Edge Function (`delete-user`) + CASCADE en base de datos.

### 7. Reset Data (GDPR)
- Borrado de historial
- **Implementación Técnica**: RPC `reset_user_data`
- Conserva perfil y último peso

---

## Hooks

### useUserPreferences
```typescript
export const useUserPreferences = () => {
  const { data: preferences } = useQuery({
    queryKey: ['user-preferences', userId],
    queryFn: async () => {
      return await supabase
        .from('user_preferences')
        .select('*')
        .eq('user_id', userId)
        .single();
    }
  });

  const updatePreferences = useMutation({
    mutationFn: async (updates: Partial<UserPreferences>) => {
      return await supabase
        .from('user_preferences')
        .upsert({
          user_id: userId,
          ...updates
        });
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['user-preferences']);
      queryClient.invalidateQueries(['health-insights']); // Recalcular si cambia import_health_metrics
    }
  });

  return { preferences, updatePreferences };
};
````

---

## Base de Datos

### `user_preferences`

```sql
CREATE TABLE user_preferences (
  id UUID PRIMARY KEY,
  user_id UUID UNIQUE REFERENCES auth.users(id),
  primary_goal TEXT,
  distance_unit TEXT DEFAULT 'km',
  temperature_unit TEXT DEFAULT 'C',
  import_health_metrics BOOLEAN DEFAULT FALSE, -- NUEVO
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## Mejoras Futuras

- [ ] Sincronización multi-dispositivo
- [ ] Backup automático en la nube
- [ ] Importar datos de otras apps
- [ ] Temas personalizados
