# Módulo de Salud - Documentación Técnica

## Índice

1. [Arquitectura](#arquitectura)
2. [Componentes y Pantallas](#componentes-y-pantallas)
3. [Algoritmos de Cálculo](#algoritmos-de-cálculo)
4. [Hooks y Servicios](#hooks-y-servicios)
5. [Base de Datos](#base-de-datos)
6. [Características Recientes](#características-recientes)
7. [Análisis Cardiovascular por Deporte](#análisis-cardiovascular-por-deporte)

---

## Arquitectura

### Stack Tecnológico

- **Frontend**: React Native + TypeScript
- **State Management**: TanStack Query
- **Backend**: Supabase
- **Gráficos**: Victory Native (react-native-svg)
- **UI**: Custom components (RangeBar, HealthInteractiveChart)

### Estructura de Módulo

```
src/modules/health/
├── algorithms/           # Cálculos de composición corporal y cardiovascular
│   ├── bodyComposition.ts
│   ├── cardioEvolution.ts
│   └── cardioSportEvaluation.ts
├── components/          # Componentes específicos
│   ├── RangeBar.tsx
│   ├── HealthInteractiveChart.tsx
│   ├── SimpleChart.tsx
│   ├── CardioEvolutionSection.tsx
│   └── CardioDimensionSummary.tsx
├── constants/           # Rangos y configuraciones
│   └── bodyCompositionRanges.ts
├── hooks/               # Data fetching
│   ├── useHealthInsights.ts
│   ├── useWeight.ts
│   ├── useMeasurements.ts
│   └── useCardioEvolution.ts
├── screens/             # Pantallas
│   ├── HealthHome.tsx
│   ├── BodyCompositionDetail.tsx
│   ├── HealthStatisticsScreen.tsx # Gráficos y estadísticas agregadas
│   ├── WeightAdd.tsx
│   ├── WeightList.tsx
│   ├── MeasurementAdd.tsx
│   ├── MeasurementDetail.tsx # Historial específico de una medida
│   ├── MeasurementsList.tsx
│   ├── RestingHRList.tsx     # Historial de Frecuencia Cardíaca en Reposo
│   ├── SleepAdd.tsx          # Registrar sueño
│   └── SleepList.tsx         # Historial de sueño
└── services/            # APIs
    ├── weightApi.ts
    └── measurementApi.ts
```

---

## Componentes y Pantallas

### 1. HealthHome

**Archivo**: [`src/modules/health/screens/HealthHome.tsx`](file:///Users/josep/Projectos/alzan/src/modules/health/screens/HealthHome.tsx)

**Propósito**: Dashboard principal del módulo de salud.

**Características**:

- Tarjeta de peso actual con tendencia
- Tarjeta de composición corporal (IMC, % grasa)
- Accesos rápidos a registrar peso/medidas
- Gráfico de tendencia de peso

---

### 2. BodyCompositionDetail

**Archivo**: [`src/modules/health/screens/BodyCompositionDetail.tsx`](file:///Users/josep/Projectos/alzan/src/modules/health/screens/BodyCompositionDetail.tsx)

**Propósito**: Vista detallada de composición corporal con cálculos avanzados.

**Características Recientes**:

#### Cálculo Automático de Métricas

```typescript
const { bodyComposition } = useHealthInsights();

// bodyComposition contiene:
{
  bmi: { value: 24.5, category: 'normal' },
  bodyFat: {
    percentage: 18.5,
    method: 'deurenberg' | 'bai' | 'whtr' | 'anthropometry_full',
    massKg: 13.2
  },
  muscle: {
    percentage: 42.3,
    method: 'al_gindan' | 'cmc_advanced',
    massKg: 30.1
  },
  availableData: {
    hasBasicData: true,
    hasAbdomen: true,
    hasHip: true,
    hasFullAnthropometry: false
  }
}
```

#### Modal de Información Rediseñado (Bottom Sheet)

```typescript
const [infoModal, setInfoModal] = useState<'bmi' | 'bodyFat' | 'muscle' | null>(null);

// Modal con:
// - Slide-up animation
// - Colores temáticos por métrica
// - Explicación de cálculo
// - Tips dinámicos según datos disponibles
```

**Colores Temáticos**:

- IMC: Azul (#3B82F6)
- Grasa Corporal: Verde (#10B981)
- Masa Muscular: Morado (#8B5CF6)

#### RangeBar con Segmentos Dinámicos

```typescript
// Rangos específicos por edad y sexo
const bodyFatRanges = useMemo(() =>
  getBodyFatRanges(userAge, isFemale),
  [userAge, isFemale]
);

<RangeBar
  value={bodyComposition.bodyFat.percentage}
  min={5}
  max={45}
  segments={bodyFatSegments}
  label="Grasa Corporal"
/>
```

---

### 3. WeightAdd

**Archivo**: [`src/modules/health/screens/WeightAdd.tsx`](file:///Users/josep/Projectos/alzan/src/modules/health/screens/WeightAdd.tsx)

**Propósito**: Registro de peso con fecha personalizada.

**Características Recientes**:

#### Selector de Fecha Inline (iOS)

```typescript
const [showDatePicker, setShowDatePicker] = useState(false);

{Platform.OS === 'ios' && showDatePicker && (
  <View style={styles.inlinePickerContainer}>
    <DateTimePicker
      value={selectedDate}
      mode="date"
      display="inline"  // Wheel picker inline
      maximumDate={new Date()}
      onChange={(event, date) => {
        if (date) setSelectedDate(date);
      }}
      themeVariant="light"
    />
  </View>
)}
```

**Validaciones**:

- Peso: 20-300 kg
- Fecha: No puede ser futura
- % Grasa (opcional): 3-60%

---

### 4. MeasurementAdd

**Archivo**: [`src/modules/health/screens/MeasurementAdd.tsx`](file:///Users/josep/Projectos/alzan/src/modules/health/screens/MeasurementAdd.tsx)

**Propósito**: Registro de medidas corporales.

**Medidas Soportadas**:

```typescript
type MeasurementType =
  | 'abdomen' // Abdomen
  | 'hips' // Cadera
  | 'chest' // Pecho
  | 'arm' // Brazo
  | 'thigh' // Muslo
  | 'neck'; // Cuello
```

**Selector de Fecha Inline**: Igual que WeightAdd

---

### 5. HealthInteractiveChart

**Archivo**: [`src/modules/health/components/HealthInteractiveChart.tsx`](file:///Users/josep/Projectos/alzan/src/modules/health/components/HealthInteractiveChart.tsx)

**Propósito**: Gráfico interactivo estilo Apple Health.

**Características**:

- Línea Bézier suave con gradiente
- Puntos clickeables con tooltip
- Filtros de tiempo: 1 semana, 1 mes, 3 meses, 6 meses, 1 año, todo
- Fallback inteligente si no hay datos en rango

**Filtros**:

```typescript
type TimeFilter = '1W' | '1M' | '3M' | '6M' | '1Y' | 'ALL';

const filterData = (filter: TimeFilter) => {
  const now = new Date();
  let startDate: Date;

  switch (filter) {
    case '1W':
      startDate = subDays(now, 7);
      break;
    case '1M':
      startDate = subMonths(now, 1);
      break;
    case '3M':
      startDate = subMonths(now, 3);
      break;
    case '6M':
      startDate = subMonths(now, 6);
      break;
    case '1Y':
      startDate = subYears(now, 1);
      break;
    case 'ALL':
      return allData;
  }

  return data.filter(d => new Date(d.date) >= startDate);
};
```

---

## Algoritmos de Cálculo

### 1. IMC (Índice de Masa Corporal)

**Ubicación**: `src/modules/health/algorithms/bodyComposition.ts`

```typescript
export const calculateBMI = (weightKg: number, heightCm: number): number => {
  const heightM = heightCm / 100;
  return weightKg / (heightM * heightM);
};

export const getBMICategory = (bmi: number): string => {
  if (bmi < 18.5) return 'underweight';
  if (bmi < 25) return 'normal';
  if (bmi < 30) return 'overweight';
  if (bmi < 35) return 'obese_1';
  if (bmi < 40) return 'obese_2';
  return 'obese_3';
};
```

**Rangos OMS**:

- Bajo peso: < 18.5
- Normal: 18.5 - 24.9
- Sobrepeso: 25 - 29.9
- Obesidad I: 30 - 34.9
- Obesidad II: 35 - 39.9
- Obesidad III: ≥ 40

---

### 2. Porcentaje de Grasa Corporal

**Archivo**: [`src/modules/health/algorithms/bodyComposition.ts`](file:///Users/josep/Projectos/alzan/src/modules/health/algorithms/bodyComposition.ts)

#### Método CUN-BAE (Escenario A - Básico)

```typescript
export const calculateBodyFatCUNBAE = (
  bmi: number,
  age: number,
  sex: 'male' | 'female'
): number => {
  const isFemale = sex === 'female' ? 1 : 0;
  // Fórmula validada por Universidad de Navarra
  return -44.988 + (0.503 * age) + ...;
};
```

**Uso**: Estándar actual (Escenario A) cuando solo hay peso, altura, edad y sexo. Más preciso que Deurenberg.

#### Método RFM (Relative Fat Mass - Escenario B)

```typescript
export const calculateBodyFatRFM = (heightCm: number, abdomenCm: number, sex: 'male' | 'female'): number => {
  // Fórmula Woolcott & Bergman (2018)
  const sexFactor = sex === 'female' ? 1 : 0;
  return 64 - 20 * (heightCm / abdomenCm) + 12 * sexFactor;
};
```

**Uso**: Preferido (Escenario B) cuando hay medida de **abdomen**. No depende del peso ni IMC.

#### Método BAI (Body Adiposity Index)

```typescript
export const calculateBAI = (hipCm: number, heightCm: number): number => {
  const heightM = heightCm / 100;
  return hipCm / Math.pow(heightM, 1.5) - 18;
};
```

**Uso**: Cuando hay medida de cadera.

#### Método WHtR (Waist-to-Height Ratio)

```typescript
export const calculateWHtR = (abdomenCm: number, heightCm: number): number => {
  return abdomenCm / heightCm;
};

export const whtRtoBodyFat = (whtr: number, isFemale: boolean): number => {
  // Conversión basada en estudios
  if (isFemale) {
    return (whtr - 0.35) * 100 + 15;
  } else {
    return (whtr - 0.35) * 100 + 10;
  }
};
```

**Uso**: Cuando hay medida de abdomen.

#### Método Combinado (BAI + WHtR)

```typescript
export const calculateBodyFatCombined = (bai: number, whtr: number, isFemale: boolean): number => {
  const whtrBF = whtRtoBodyFat(whtr, isFemale);
  return bai * 0.6 + whtrBF * 0.4;
};
```

**Uso**: Cuando hay abdomen y cadera.

#### Método Antropometría Completa (Navy Adaptado)

```typescript
export const calculateBodyFatFull = (
  abdomenCm: number,
  hipCm: number,
  chestCm: number,
  armCm: number,
  thighCm: number,
  heightCm: number,
  bmi: number,
  isFemale: boolean,
): number => {
  // Algoritmo complejo con todas las medidas
  // Basado en Navy Method adaptado
  // Mayor precisión
};
```

**Uso**: Cuando hay todas las medidas corporales.

---

### 3. Preferencia de Importación de Métricas

**Archivo**: [`src/hooks/settings/usePreferences.ts`](file:///Users/josep/Projectos/alzan/src/hooks/settings/usePreferences.ts)

```typescript
interface UserPreferences {
  import_health_metrics: boolean; // NUEVO
  distance_unit: 'km' | 'mi';
  temperature_unit: 'C' | 'F';
}
```

**Lógica de Priorización**:

```typescript
const calculateBodyFat = () => {
  // 1. Si import_health_metrics está activado Y hay loggedBodyFat
  if (preferences.import_health_metrics && latestWeight.bodyfat_percent) {
    return { ... };
  }

  // 2. Escenario B: Si hay Abdomen (RFM)
  if (hasAbdomen) {
    return calculateBodyFatRFM(height, abdomen, sex);
  }

  // 3. Fallback B: Si hay Cadera pero no Abdomen (BAI)
  else if (hasHip) {
    return calculateBodyFatBAI(height, hip);
  }

  // 4. Escenario A: Datos básicos (CUN-BAE)
  else {
    return calculateBodyFatCUNBAE(bmi, age, sex);
  }
};
```

**Implementación en Settings**:

```tsx
<Switch
  value={preferences?.import_health_metrics ?? false}
  onValueChange={val => updatePreferences({ import_health_metrics: val })}
  trackColor={{ false: '#767577', true: colors.primary + '50' }}
  thumbColor={preferences?.import_health_metrics ? colors.primary : '#FFFFFF'}
/>
```

---

### 4. Masa Muscular

**Ubicación**: `src/modules/health/algorithms/bodyComposition.ts`

#### Método Al-Gindan (Básico)

```typescript
export const calculateMuscleMassAlGindan = (
  weightKg: number,
  heightCm: number,
  age: number,
  isFemale: boolean,
): number => {
  const heightM = heightCm / 100;
  const sexFactor = isFemale ? 0 : 1;

  return 0.244 * weightKg + 7.8 * heightM + 6.6 * sexFactor - 0.098 * age + 0.4;
};
```

**Uso**: Cuando solo hay datos básicos.

#### Método CMC Avanzado (Circunferencia Muscular Corregida)

```typescript
export const calculateMuscleMassCMC = (
  chestCm: number,
  armCm: number,
  thighCm: number,
  heightCm: number,
  isFemale: boolean,
): number => {
  // CMC = circunferencia - (π × pliegue_cutáneo)
  // Asumiendo pliegue promedio de 0.5 cm
  const cmcChest = chestCm - Math.PI * 0.5;
  const cmcArm = armCm - Math.PI * 0.5;
  const cmcThigh = thighCm - Math.PI * 0.5;

  const k = isFemale ? -2.5 : 0;

  return 0.01 * (Math.pow(cmcArm, 2) + Math.pow(cmcThigh, 2) + Math.pow(cmcChest, 2)) + 0.12 * heightCm + k;
};
```

**Uso**: Cuando hay medidas de pecho, brazo y muslo.

---

## Hooks y Servicios

### useHealthInsights

**Archivo**: [`src/modules/health/hooks/useHealthInsights.ts`](file:///Users/josep/Projectos/alzan/src/modules/health/hooks/useHealthInsights.ts)

**Propósito**: Hook agregado que calcula todas las métricas de salud.

```typescript
export const useHealthInsights = () => {
  const { user } = useAuth();
  const { profile } = useProfile();
  const { data: weightLogs } = useWeightLogs(2);
  const { data: measurements } = useMeasurements();
  const { preferences } = useUserPreferences();

  const bodyComposition = useMemo(() => {
    // Obtener datos disponibles
    const availableData = {
      hasBasicData: !!(profile?.height_cm && weightLogs?.[0]),
      hasAbdomen: !!measurements?.find(m => m.measurement_type === 'abdomen'),
      hasHip: !!measurements?.find(m => m.measurement_type === 'hips'),
      hasChest: !!measurements?.find(m => m.measurement_type === 'chest'),
      hasArm: !!measurements?.find(m => m.measurement_type === 'arm'),
      hasThigh: !!measurements?.find(m => m.measurement_type === 'thigh'),
      hasNeck: !!measurements?.find(m => m.measurement_type === 'neck'),
    };

    availableData.hasFullAnthropometry =
      availableData.hasWaist &&
      availableData.hasHip &&
      availableData.hasChest &&
      availableData.hasArm &&
      availableData.hasThigh;

    // Calcular IMC
    const bmi = calculateBMI(weight, height);

    // Calcular % grasa (con priorización)
    const bodyFat = calculateBodyFatWithPriority(
      availableData,
      preferences.import_health_metrics,
      weightLogs[0].bodyfat_percent,
    );

    // Calcular masa muscular
    const muscle = calculateMuscleMass(availableData);

    return { bmi, bodyFat, muscle, availableData };
  }, [profile, weightLogs, measurements, preferences]);

  return { bodyComposition, latestWeight, age };
};
```

---

### useWeightLogs

**Archivo**: [`src/modules/health/hooks/useWeight.ts`](file:///Users/josep/Projectos/alzan/src/modules/health/hooks/useWeight.ts)

```typescript
export const useWeightLogs = (days?: number) => {
  return useQuery({
    queryKey: ['weight-logs', user?.id, days],
    queryFn: async () => {
      let query = supabase
        .from('weight_logs')
        .select('*')
        .eq('user_id', user.id)
        .order('measured_at', { ascending: false });

      if (days) {
        const startDate = subDays(new Date(), days).toISOString();
        query = query.gte('measured_at', startDate);
      }

      return query;
    },
  });
};

export const useAddWeightLog = () => {
  return useMutation({
    mutationFn: async (data: { weight_kg: number; measured_at: string; bodyfat_percent?: number }) => {
      return await supabase.from('weight_logs').insert({
        user_id: user.id,
        ...data,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['weight-logs']);
      queryClient.invalidateQueries(['health-insights']);
    },
  });
};
```

---

## Base de Datos

### Tabla: `weight_logs`

```sql
CREATE TABLE weight_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  weight_kg DECIMAL(5,2) NOT NULL,
  bodyfat_percent DECIMAL(4,1),  -- Opcional, de báscula inteligente
  muscle_mass_kg DECIMAL(5,2),   -- Opcional, calculado o medido
  measured_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_weight_logs_user_date ON weight_logs(user_id, measured_at DESC);
```

### Tabla: `body_measurements`

```sql
CREATE TABLE body_measurements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  measurement_type TEXT NOT NULL,  -- 'waist', 'hips', 'chest', 'arm', 'thigh', 'neck'
  value_cm DECIMAL(5,1) NOT NULL,
  measured_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_measurements_user_type ON body_measurements(user_id, measurement_type, measured_at DESC);
```

### Tabla: `user_preferences`

```sql
ALTER TABLE user_preferences
ADD COLUMN import_health_metrics BOOLEAN DEFAULT FALSE;
```

---

## Características Recientes

### 1. Cálculo Automático de IMC y % Grasa

- **Siempre calculado** con fórmulas basadas en datos disponibles
- **Priorización inteligente**: Usa método más preciso según medidas disponibles
- **Preferencia de importación**: Toggle para usar datos de báscula inteligente

### 2. Preferencia "Importar Métricas de Salud"

- **Ubicación**: Settings > Preferencias
- **Función**: Controla si se usan datos de apps externas (báscula, Apple Health)
- **Lógica**: Si activado Y hay `bodyfat_percent` en weight_log, usar ese valor

### 3. Modal de Información Rediseñado

- **Diseño**: Bottom sheet con slide-up animation
- **Colores temáticos**: Azul (IMC), Verde (Grasa), Morado (Músculo)
- **Contenido dinámico**: Tips según datos disponibles
- **Explicación de cálculo**: Muestra fórmula y método usado

### 4. Selector de Fecha Inline (iOS)

- **Componente**: `DateTimePicker` con `display="inline"`
- **Ubicación**: WeightAdd, MeasurementAdd
- **Ventaja**: Wheel picker nativo sin modal

### 5. Gráficos Interactivos Mejorados

- **Filtros de tiempo**: 1W, 1M, 3M, 6M, 1Y, ALL
- **Fallback inteligente**: Si no hay datos en rango, expande automáticamente
- **Tooltip**: Muestra valor exacto al tocar punto

---

## Mejoras Futuras

- [ ] Integración con Apple Health / Google Fit
- [ ] Fotos de progreso con comparación lado a lado
- [ ] Predicción de tendencia con IA
- [ ] Alertas de cambios significativos
- [ ] Exportar datos a PDF
- [ ] Sincronización con básculas Bluetooth
- [ ] Análisis de composición corporal por segmentos
- [ ] Recomendaciones personalizadas de nutrición

---

## Análisis Cardiovascular por Deporte

### Qué ofrece

La pantalla `Salud → Análisis de FC` presenta una evaluación local y determinista para cada deporte que aparece en el historial del usuario. El evaluador separa la respuesta cardiovascular, las métricas de rendimiento disponibles y el volumen de entrenamiento. Running, trail y senderismo pueden mostrar una tendencia parcial de velocidad; ciclismo solo clasifica tendencias con potencia; natación puede mostrar tendencias parciales de ritmo en largos equivalentes. Cuando existen datos válidos, la comparación también presenta la mediana de FC máxima por sesión, sin interpretarla como una mejora o deterioro por sí sola. Los demás deportes tienen explicación y recomendación propias, junto a FC, duración y volumen; no se inventan métricas de rendimiento que el registro no conserva. También muestra una gráfica de medianas de FC media por sesión, agrupadas por día, semana o mes según el periodo elegido. Las sesiones sin datos comparables se describen sin convertir un cambio de FC en una afirmación de mejora.

El nivel A–F describe la calidad y cantidad de evidencia disponible, no la calidad física del usuario. A requiere al menos tres parejas con FC parecida, al menos catorce días de cobertura en ambos grupos, contexto suficiente y una tendencia consistente entre parejas y medianas. B puede describir una tendencia parcial cuando hay al menos tres parejas de rendimiento repartidas en dos semanas, pero falta FC parecida o parte del contexto; natación no alcanza A por la cautela necesaria con la FC en el agua. C describe FC, D volumen, E una primera referencia y F ausencia de sesiones recientes válidas. Si solo hay datos en la mitad anterior, F explica que no existe una referencia actual y conserva esos datos como contexto histórico. La confianza se calcula aparte: A va de media a alta, B puede ser baja y C solo es baja con al menos tres sesiones con FC en ambos periodos; no es una probabilidad.

### Datos y acceso

`useCardioEvolution` obtiene las sesiones completadas del usuario autenticado desde `activity_sessions`, con filtros por `user_id`, duplicados pendientes, estado completado y fecha válida. Pagina las sesiones y mantiene el cálculo en el cliente. Para la selección actual consulta de forma diferida `activity_laps` en running, ciclismo, natación, trail y senderismo; en fuerza consulta `workout_sets` y nombres de ejercicios. Las series temporales de FC, velocidad y potencia alimentan los cálculos separados de deriva cardíaca y recuperación entre intervalos; las zonas se resumen para los últimos siete días. No hay escrituras, migraciones ni datos inventados en este flujo. Referencias de implementación: [`useCardioEvolution.ts`](../../src/modules/health/hooks/useCardioEvolution.ts), [`cardioEvolution.ts`](../../src/modules/health/algorithms/cardioEvolution.ts), [`cardioSportEvaluation.ts`](../../src/modules/health/algorithms/cardioSportEvaluation.ts).

Campos leídos de `activity_sessions`: deporte y subtipo, proveedor y dispositivo, fecha, duración, distancia, FC media y máxima, velocidad, potencia, temperatura, desnivel, totales de fuerza y contexto disponible para piscina, estilo, superficie y modalidades de fútbol, esquí y snowboard. Las FC máxima y media se resumen por separado y solo cuentan valores plausibles; sus coberturas también se muestran por separado. `activity_laps` puede aportar distancia, duración, FC y ritmo por parcial. `workout_sets` aporta ejercicio, peso, repeticiones, esfuerzo percibido, calentamiento y tipo de serie. Si los totales de fuerza de una sesión no están guardados, el cliente los calcula a partir de sus series cargadas; los totales guardados tienen prioridad. Se indican las sesiones que realmente aportan cada métrica.

El enum `sport_type_enum` contiene veinte valores: `basketball`, `padel`, `hiking`, `strength`, `running`, `cycling`, `swimming`, `football`, `tennis`, `other`, `gym`, `martial_arts`, `climbing`, `surf`, `volleyball`, `trail`, `skiing`, `snowboard`, `golf` y `hyrox`. `strength` y `gym` se agrupan visualmente como gimnasio; subtipos heredados de caminata se normalizan a senderismo. La pantalla crea pestañas para deportes presentes en las sesiones del usuario, no para modalidades que no haya registrado. Los identificadores no reconocidos se mantienen separados para evitar mezclar deportes distintos, se presentan como «Deporte sin clasificar» y solo reciben una lectura genérica; no se enseñan sus códigos internos.

### Reglas estadísticas y límites

- Los periodos `day`, `week`, `month`, `three_months` y `six_months` comparan ventanas consecutivas de la misma duración. `all` separa el historial disponible en dos mitades temporales.
- FC fuera de 40–220 lpm, valores no finitos y métricas no positivas no se usan como medidas fisiológicas válidas. La FC máxima también se descarta si es menor que la FC media válida de esa sesión. Velocidad, potencia, duración y distancia tienen controles de plausibilidad.
- Las parejas se forman uno a uno dentro del mismo deporte y subtipo conocido, evitando mezclar modalidades conocidas incompatibles. La duración debe ser comparable; para métricas de velocidad también se requiere distancia. La fuente de velocidad debe coincidir (registrada con registrada o derivada de distancia/duración con la misma fuente).
- La FC de dos sesiones se considera parecida si difiere como máximo 7 lpm. Una tendencia parcial requiere al menos tres parejas de rendimiento y catorce días de cobertura en ambos grupos. El nivel A requiere además FC parecida, contexto completo y deporte/métrica admitidos. El contexto conocido incompatible excluye una pareja; el contexto ausente puede mantenerla en B con confianza baja.
- Se usa la mediana para reducir el peso de valores atípicos. El porcentaje de cambio se calcula a partir de las mismas medianas visibles en la gráfica de periodos; la confianza alta exige cobertura temporal de las parejas con FC similar que respaldan esa tendencia. El umbral mínimo de cambio del 3 %, el umbral de FC de 7 lpm, las razones de duración/distancia, los límites de plausibilidad y la cobertura temporal son **heurísticas de producto**, no umbrales clínicos ni valores universales validados. Si la dirección de la clasificación contradice el cambio entre las medianas mostradas, la pantalla degrada el resultado a descriptivo.
- La deriva solo se calcula en sesiones de al menos 45 minutos con diez o más bloques emparejados por mitad, cobertura temporal mínima de una cuarta parte de la duración total en cada mitad y ningún hueco mayor de cinco minutos. Cada bloque de 30 segundos usa medianas para reducir el efecto de lecturas aisladas. Estas reglas son heurísticas conservadoras del producto.
- El ritmo de largos se compara por distancia de parcial, piscina/aguas abiertas y estilo cuando esos datos existen. Puede describir una tendencia parcial B, nunca una mejora de eficiencia cardíaca A en natación. Una diferencia positiva de velocidad indica más velocidad; el tiempo por distancia mostrado disminuye cuando se nada más rápido.
- La FC puede subir o bajar por intensidad, duración, terreno, temperatura, hidratación, sueño, estrés, enfermedad, sensor y carga externa. Una FC menor no demuestra mejoría; una FC mayor no demuestra deterioro. Un resumen de FC aislado no diagnostica recuperación, condición médica ni sobreentrenamiento.

### Alcance por deporte y evidencia

La taxonomía y las métricas disponibles se contrastaron con los veinte valores del enum local. La tabla define lo que este módulo puede defender con los datos existentes; las modalidades sin una métrica externa útil se mantienen descriptivas. No se asume que la lista de fuentes constituya una revisión sistemática exhaustiva.

| Deporte | Métrica/lectura disponible | Límite que impide una conclusión más fuerte |
|---|---|---|
| `running` | Velocidad derivada de ritmo, distancia o duración en sesiones comparables. Sin FC/contexto suficiente, la conclusión queda en B. | Ritmo, distancia, pendiente, temperatura, pausas y ruta cambian el coste del esfuerzo. La velocidad derivada usa el tiempo total guardado, que puede incluir pausas. [Estudio de adaptación submáxima en carrera](https://pubmed.ncbi.nlm.nih.gov/36157945/). |
| `cycling` | Potencia mediana en parejas de duración comparable; solo clasifica una tendencia cuando hay al menos tres parejas distribuidas en el tiempo. | Velocidad exterior depende de viento, ruta y paradas; la FC puede derivar con el calor y la duración. Potencia y FC son complementarias, no intercambiables. [Revisión de pruebas submáximas de ciclismo](https://pubmed.ncbi.nlm.nih.gov/27701968/), [monitorización de FC en ciclismo](https://pubmed.ncbi.nlm.nih.gov/22587722/). |
| `swimming` | Ritmo mediano de largos con la misma distancia; piscina/aguas abiertas y estilo separan los grupos cuando constan. | La FC óptica de muñeca puede ser menos precisa en agua; el ritmo repetido es una tendencia parcial y no equivale a una prueba de rendimiento. [Validación de sensores en natación](https://pubmed.ncbi.nlm.nih.gov/32298322/). |
| `trail` | Velocidad a FC similar en condiciones comparables; resultado conservador por el terreno. | Desnivel y tecnicidad afectan el coste cardiorrespiratorio aun con velocidad parecida. [Estudio sobre tecnicidad del terreno](https://pubmed.ncbi.nlm.nih.gov/34663199/). |
| `hiking` | Velocidad en sesiones con distancia/duración comparables puede dar una tendencia parcial; FC, duración y desnivel aportan contexto. | Pendiente y carga transportada alteran la FC; la carga de mochila no consta necesariamente. [Estudio de gradiente y carga transportada](https://pubmed.ncbi.nlm.nih.gov/30045754/). |
| `strength` / `gym` | Totales guardados o calculados de peso × repeticiones, series y repeticiones; compara mediana de carga por ejercicio y repeticiones. | FC no mide trabajo muscular; el volumen no controla técnica, rango de movimiento, esfuerzo ni descanso. [Guía ACSM de entrenamiento de fuerza](https://acsm.org/resistance-training-guidelines-update-2026/). |
| `football` | FC, duración y volumen; recuperación entre intervalos si hay series temporales. | Posición, tiempo efectivo, acciones y aceleraciones no se deducen de FC media. [Meta-análisis de carga interna y externa en deportes de equipo](https://pubmed.ncbi.nlm.nih.gov/29288436/). |
| `basketball` | FC, duración y volumen; recuperación entre intervalos si hay series temporales. | Rol, tiempo efectivo, aceleraciones y acciones técnicas requieren datos externos específicos. [Meta-análisis de deportes de equipo](https://pubmed.ncbi.nlm.nih.gov/29288436/). |
| `tennis` | FC, duración y volumen; no compara el rendimiento del juego. | Individual y dobles, superficie, duración de puntos y tiempo efectivo modifican la carga. [Comparación entre pádel y tenis individual/dobles](https://pubmed.ncbi.nlm.nih.gov/36965486/). |
| `padel` | FC y duración descriptivas; recuperación entre intervalos cuando hay series. | La carga del pádel difiere del tenis individual y depende de formato de partido y tiempo efectivo. [Comparación entre pádel y tenis](https://pubmed.ncbi.nlm.nih.gov/36965486/). |
| `volleyball` | FC, duración y volumen descriptivos. | Posición, saltos y acciones técnicas requieren variables externas específicas. [Perfil de demanda por posición](https://pubmed.ncbi.nlm.nih.gov/36097030/). |
| `martial_arts` | FC y duración descriptivas; recuperación entre intervalos cuando hay series. | No identifica modalidad, golpes, agarres, asaltos efectivos ni resultado. [Estudio de karate](https://pubmed.ncbi.nlm.nih.gov/24800001/). |
| `hyrox` | Duración y FC; recuperación de intervalos cuando hay series. | Para medir rendimiento hacen falta tiempos separados de carrera/estaciones, cargas y formato comparable. [Estudio fisiológico de HYROX](https://pubmed.ncbi.nlm.nih.gov/40230601/). |
| `climbing` | FC y duración descriptivas. | Grado, inclinación, desplazamiento y estilo alteran la respuesta fisiológica. [Estudio de estilo de escalada](https://pubmed.ncbi.nlm.nih.gov/17021787/). |
| `surf` | FC y duración descriptivas. | La sesión combina espera, remada y olas; duración o pulso no miden olas surfeadas ni calidad técnica. [Análisis de competición de surf](https://pubmed.ncbi.nlm.nih.gov/21986691/). |
| `skiing` | FC, duración y métricas de sesión guardadas descriptivas. | Remontes, descenso, pendiente, nieve y técnica cambian el esfuerzo entre sesiones. [Estudio de fisiología del esquí alpino](https://pubmed.ncbi.nlm.nih.gov/20561278/). |
| `snowboard` | FC y duración descriptivas. | Pendiente, nieve, remontes y técnica no quedan cuantificados de forma suficiente; la advertencia se extrapola prudentemente de los deportes de nieve. |
| `golf` | FC, duración, distancia o pasos si el proveedor los guarda. | Caminar o usar carrito cambia la carga física sin demostrar cambio en el rendimiento del golpe. [Ensayo de caminar frente a usar carrito](https://pubmed.ncbi.nlm.nih.gov/41360681/). |
| `other` | FC, duración y volumen descriptivos. | Sin una modalidad identificada no hay comparación específica justificable. |
| Identificador de deporte no reconocido | FC, duración y volumen descriptivos, separado por identificador para evitar mezclar deportes. | No existe un modelo específico validado; la interfaz oculta el código interno y no calcula eficiencia deportiva. |

### Matriz de escenarios verificados

La matriz se aplica a cada uno de los 20 valores de `sport_type_enum`; las pruebas sintéticas usan sesiones aisladas por usuario y no escriben en la base de datos.

| Disponibilidad | Deportes cubiertos | Resultado permitido | Comprobación |
|---|---|---|---|
| Sin sesiones recientes; o solo sesiones del periodo anterior | Los 20 tipos | F: sin evaluación actual; el historial anterior no se presenta como tendencia reciente. | `cardioSportEvaluation.spec.ts` |
| Una sesión reciente, aunque falten métricas | Los 20 tipos | E: primera referencia, sin comparación ni dirección de cambio. | `cardioSportEvaluation.spec.ts` |
| Sesiones con fecha y duración, sin FC ni métrica de rendimiento aceptada | Los 20 tipos | D: volumen y constancia; no se infiere mejora por acumular más tiempo o sesiones. | `cardioSportEvaluation.spec.ts` |
| FC media válida en ambos periodos, sin métrica de rendimiento | Los 20 tipos | C: cambio descriptivo de respuesta cardíaca; no se llama mejora o retroceso físico. | `cardioSportEvaluation.spec.ts` |
| Datos repetibles de velocidad/ritmo, potencia, largos equivalentes o series del mismo ejercicio | Running, trail, senderismo, ciclismo con potencia, natación con parciales comparables y fuerza con el mismo ejercicio/repeticiones | B parcial o A solo para modalidades y contexto admitidos por el algoritmo; los cambios se apoyan en parejas comparables y se degradan a descriptivos si la evidencia contradice las medianas. | `cardioSportEvaluation.spec.ts` |
| Deporte desconocido o subtipo no reconocido | Cada identificador se conserva separado; `other` sin subtipo queda genérico | C/D/E/F según los campos reales; nunca se asigna una métrica de otro deporte. | `cardioSportNormalization.spec.ts`, `cardioSportEvaluation.spec.ts` |

No hay cobertura de tendencia A/B de rendimiento para fútbol, baloncesto, tenis, pádel, voleibol, artes marciales, HYROX, escalada, surf, esquí, snowboard, golf ni deportes desconocidos: el esquema actual no aporta para estos deportes un resultado externo comparable y suficientemente estandarizado. La UI muestra la FC, el volumen y una explicación específica cuando existen; no se etiqueta esa salida como análisis completo del rendimiento. Tampoco se cubren todas las combinaciones posibles de dispositivo, clima, nivel competitivo, tipo de sesión y calidad de sensor; los campos no persistidos no pueden recuperarse desde esta pantalla.

La bibliografía de abajo es una consulta dirigida de revisiones y estudios por deporte para justificar límites y evitar extrapolar FC entre modalidades; no constituye una revisión sistemática exhaustiva ni valida los umbrales heurísticos del producto. La revisión sobre pruebas submáximas de carrera encontró asociaciones heterogéneas entre FC a velocidad estandarizada y cambios de forma aeróbica; la revisión de deportes de equipo también advierte que las métricas externas y su vínculo con el rendimiento dependen de cómo se midan y combinen. Por ello, el código no atribuye a una variación de FC aislada una mejora o pérdida de condición.

- **Resistencia y medición:** [monitorización submáxima en deportes de carrera](https://pubmed.ncbi.nlm.nih.gov/36332619/), [pruebas submáximas de ciclismo](https://pubmed.ncbi.nlm.nih.gov/27701968/), [potencia-duración en ciclismo](https://pubmed.ncbi.nlm.nih.gov/34708276/), [wearables de natación](https://pubmed.ncbi.nlm.nih.gov/35632086/) y [revisión paraguas de precisión de wearables](https://pubmed.ncbi.nlm.nih.gov/39080098/).
- **Deportes intermitentes y de raqueta:** [relación entre carga interna/externa y forma en deportes de equipo](https://pubmed.ncbi.nlm.nih.gov/35959321/), [demandas de baloncesto](https://pubmed.ncbi.nlm.nih.gov/32134965/), [demandas de voleibol](https://pubmed.ncbi.nlm.nih.gov/41460726/), [revisión de carga de deportes de raqueta](https://pubmed.ncbi.nlm.nih.gov/37063547/) y [revisión de rendimiento en pádel](https://pubmed.ncbi.nlm.nih.gov/38022770/).
- **Otras modalidades:** [indicadores fisiológicos en deportes de combate](https://pubmed.ncbi.nlm.nih.gov/26993133/), [pruebas de rendimiento en escalada](https://pubmed.ncbi.nlm.nih.gov/39216626/), [respuestas en surf competitivo](https://pubmed.ncbi.nlm.nih.gov/21986691/), [perfil de esquiadores alpinos](https://pubmed.ncbi.nlm.nih.gov/30335713/), [componentes de rendimiento HYROX](https://pubmed.ncbi.nlm.nih.gov/40230601/) y [carga física en golf](https://pubmed.ncbi.nlm.nih.gov/41360681/).

### Qué queda fuera

El esquema normalizado no siempre conserva tipo de sesión, ruta, viento, mochila, superficie detallada, posición, puntuación, grado, estaciones de competición, técnica ni percepción del esfuerzo. El análisis por ahora no estima deriva dentro de todas las sesiones, no reconstruye parciales de 1/3/5/10 km ni evalúa una prueba de esfuerzo. Los datos de series temporales se usan en la lógica existente de deriva/recuperación, pero no equivalen a análisis de rendimiento completo. El periodo «Todo» carga el historial paginado en memoria del cliente; historiales extraordinariamente grandes todavía pueden requerir procesamiento incremental antes de considerarse óptimos para móviles modestos. No se inspeccionaron datos de producción ni se verificó cuántas de estas métricas tiene una cuenta concreta; la cobertura real depende de cada usuario y dispositivo.

### Referencias locales y estado de documentación

- Código: [`cardioEvolution.ts`](../../src/modules/health/algorithms/cardioEvolution.ts), [`cardioSportEvaluation.ts`](../../src/modules/health/algorithms/cardioSportEvaluation.ts), [`CardioEvolutionSection.tsx`](../../src/modules/health/components/CardioEvolutionSection.tsx), [`CardioDimensionSummary.tsx`](../../src/modules/health/components/CardioDimensionSummary.tsx) y [`useCardioEvolution.ts`](../../src/modules/health/hooks/useCardioEvolution.ts).
- Modelo enum y tablas tipadas: [`database.types.ts`](../../src/types/database.types.ts).
- Pruebas sintéticas locales: [`cardioSportEvaluation.spec.ts`](../../src/modules/health/algorithms/cardioSportEvaluation.spec.ts). Las pruebas no escriben datos en Supabase.
- Drift corregido: la documentación anterior no describía la evaluación cardiovascular por deporte, el uso de sesiones reales ni las limitaciones de evidencia; esta sección añade esa cobertura. El resto de páginas históricas de salud aún contiene detalles de composición corporal que deben validarse por separado.
- Resumen de commits consultados (últimos 20): cambios recientes en los módulos de salud, entrenamiento, nutrición, ajustes de interfaz y dos migraciones previas de nutrición en `main`; esta rama añade únicamente cambios frontend y documentación para este trabajo. No se agregó una migración.
- Limpieza: conservar el material histórico existente; corregir o retirar las afirmaciones antiguas solo cuando se auditen sus flujos concretos. No se generaron artefactos temporales permanentes.
