# Development Guidelines for AI Agents

This document provides clear instructions for AI agents working on this React Native (Expo) repository. Follow these patterns strictly to ensure code quality, type safety, and cross-platform compatibility (iOS, Android, Web).

## Skills Usage (Mandatory)

- Always use the repository skills when they apply to the task.
- Prioritize frontend skills first (`fe-*`), then shared skills (`shared-*`).
- For commit-related requests, use the commit generator skill and provide commit text only.

---

## Project Structure Overview

```
src/
├── analytics/          # Analytics tracking
├── components/         # Shared, reusable UI components (inputs, cards, etc.)
├── constants/          # App-wide constants
├── context/            # React context providers
├── data/               # Static data, fixtures
├── hooks/              # Shared custom hooks
├── i18n/               # Translations
├── lib/                # Third-party library configurations
├── modules/            # Feature modules (health, nutrition, training)
│   └── [feature]/
│       ├── algorithms/     # Feature-specific logic
│       ├── components/     # Feature-specific components
│       ├── constants/      # Feature-specific constants
│       ├── hooks/          # Feature-specific hooks
│       ├── screens/        # Feature screens
│       ├── services/       # Feature API/data services
│       └── DOCUMENTATION.md
├── navigation/         # Navigation configuration
├── openapi/            # Generated OpenAPI client
├── screens/            # Top-level screens (auth, home, settings, etc.)
├── services/           # Shared services
└── types/              # TypeScript type definitions
```

---

## Critical Rules

### 🚫 Never Use `any`

This is the #1 issue in the codebase. The linter is configured to catch this, **do not ignore it**.

```typescript
// ❌ NEVER do this
function handleData(data: any) { ... }
const response: any = await fetch();
// @ts-ignore
const value = data.something;

// ✅ Always do this
function handleData(data: WeightLogInsert) { ... }
const response: ApiResponse<WeightLog> = await fetch();
// If type is truly unknown, use 'unknown' and narrow it
function handleData(data: unknown) {
  if (isWeightLog(data)) {
    // TypeScript now knows data is WeightLog
  }
}
```

**When you're tempted to use `any`:**

1. Check if a type already exists in `src/types/`
2. If not, define the proper type
3. If the type is truly dynamic, use `unknown` and add type guards

### 🚫 Avoid `as` Keyword (Type Assertions)

**Do not use `as` unless absolutely necessary.**

The Supabase client is fully typed. Rely on **Type Inference**.

```typescript
// ❌ Wrong
const { data } = await supabase.from('users').select('*');
return data as User[]; // unnecessary and unsafe

// ✅ Correct
const { data } = await supabase.from('users').select('*');
if (!data) return [];
return data; // TypeScript knows this is User[]
```

---

## Component Reusability (Critical)

**Before creating ANY component, search the codebase first.**

### Shared Components (`src/components/`)

Place here if the component is:

- A UI primitive (Button, Input, Card, Dropdown, DatePicker, Modal)
- Used across multiple features/modules
- Has no business logic tied to a specific feature

```typescript
// ✅ Belongs in src/components/
src/components/
├── ui/
│   ├── Button.tsx
│   ├── Input.tsx
│   ├── Card.tsx
│   ├── DatePicker.tsx
│   └── Dropdown.tsx
└── forms/
    ├── FormInput.tsx
    └── FormDatePicker.tsx
```

### Feature Components (`src/modules/[feature]/components/`)

Place here if the component:

- Is specific to one feature/module
- Contains feature-specific business logic
- Is unlikely to be used elsewhere

```typescript
// ✅ Belongs in src/modules/health/components/
src/modules/health/components/
├── WeightChart.tsx          # Only used in health module
├── BodyMetricsCard.tsx      # Health-specific
└── BMICalculator.tsx        # Health-specific logic
```

### Checklist Before Creating a Component

- [ ] Did I search for similar components in `src/components/`?
- [ ] Did I check the specific module's `components/` folder?
- [ ] Can I extend an existing component with props instead?
- [ ] If creating new, is it truly reusable (→ `src/components/`) or feature-specific (→ `src/modules/[feature]/components/`)?

---

## Type Safety (Non-Negotiable)

### Type Hierarchy

1. **Generated**: `database.types.ts` (Supabase auto-generated, **NEVER EDIT**)
2. **Generated**: `src/openapi/` (OpenAPI client, **NEVER EDIT**)
3. **Proxy Layer**: `src/types/requests.types.ts` (Your interface to DB types)
4. **Feature Types**: Other files in `src/types/` (navigation, app-specific, etc.)

### Pattern for Database Types

```typescript
// src/types/requests.types.ts

import { Database } from './database.types';

// 1. Export base types using helper pattern (Row, Insert, Update)
export type WeightLog = Row<'weight_logs'>;
export type WeightLogInsert = Insert<'weight_logs'>;
export type WeightLogUpdate = Update<'weight_logs'>;

// 2. Export enums for better DX (Enum)
export type WeightLogStatus = Enum<'weight_log_status'>;

// 3. Add extended types if needed
export type WeightLogWithUser = WeightLog & {
  user: {
    id: string;
    name: string;
  };
};
```

### Database Enums (REQUIRED)

Always use Supabase enums for any field with fixed values. This generates proper TypeScript union types.

```sql
-- ✅ Correct - Generates 'active' | 'paused' | 'completed'
CREATE TYPE workout_status AS ENUM ('active', 'paused', 'completed');

CREATE TABLE workouts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  status workout_status NOT NULL DEFAULT 'active'
);

-- ❌ Wrong - Generates generic 'string' type
CREATE TABLE workouts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  status TEXT NOT NULL DEFAULT 'active',
  CONSTRAINT check_status CHECK (status IN ('active', 'paused', 'completed'))
);
```

---

## Navigation (Fully Typed)

All navigation is defined in `src/types/navigation.types.ts`.

### Pattern

```typescript
// ✅ Correct - Always use typed hooks
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { HealthScreenNavigationProp, HealthStackParamList } from '@/types/navigation.types';

function WeightDetailScreen() {
  const navigation = useNavigation<HealthScreenNavigationProp>();
  const route = useRoute<RouteProp<HealthStackParamList, 'WeightDetail'>>();

  // ✅ TypeScript validates params
  const { weightId } = route.params;

  // ✅ TypeScript validates navigation methods and params
  navigation.navigate('WeightList', { userId: '123' });
}
```

### Adding New Screens

1. **Add route to `navigation.types.ts`:**

```typescript
// src/types/navigation.types.ts

export type HealthStackParamList = {
  WeightList: { userId: string };
  WeightDetail: { weightId: string };
  WeightCreate: undefined; // ← New screen
};
```

2. **Export navigation prop type:**

```typescript
export type HealthScreenNavigationProp = StackNavigationProp<HealthStackParamList>;
```

3. **Use in your screen:**

```typescript
function WeightCreateScreen() {
  const navigation = useNavigation<HealthScreenNavigationProp>();
  // Fully typed!
}
```

---

## Data Fetching Pattern

### For Supabase (Database)

Create a custom hook in `src/modules/[feature]/hooks/` or `src/hooks/` (if shared).

```typescript
// src/modules/health/hooks/useWeightLogs.ts

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import type { WeightLog, WeightLogInsert, WeightLogUpdate } from '@/types/requests.types';

export function useWeightLogs(userId: string) {
  const queryClient = useQueryClient();

  // ✅ Query with proper typing
  const query = useQuery({
    queryKey: ['weight-logs', userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('weight_logs')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data; // Inferred as WeightLog[] | null
    },
  });

  // ✅ Create mutation with proper typing
  const createMutation = useMutation({
    mutationFn: async (log: WeightLogInsert) => {
      const { data, error } = await supabase.from('weight_logs').insert(log).select().single();

      if (error) throw error;
      return data as WeightLog;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['weight-logs', userId] });
    },
  });

  // ✅ Update mutation
  const updateMutation = useMutation({
    mutationFn: async ({ id, ...updates }: WeightLogUpdate & { id: string }) => {
      const { data, error } = await supabase.from('weight_logs').update(updates).eq('id', id).select().single();

      if (error) throw error;
      return data as WeightLog;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['weight-logs', userId] });
    },
  });

  // ✅ Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('weight_logs').delete().eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['weight-logs', userId] });
    },
  });

  return {
    // Query state
    weightLogs: query.data,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,

    // Mutations
    createWeightLog: createMutation.mutate,
    updateWeightLog: updateMutation.mutate,
    deleteWeightLog: deleteMutation.mutate,

    // Mutation states
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
  };
}
```

### For OpenAPI Backend

Use the generated TanStack Query client from `src/openapi/`.

```typescript
// ✅ Correct - Use generated hooks
import { useGetWorkoutPlan, useCreateWorkoutPlan } from '@/openapi/queries';

function WorkoutPlanScreen() {
  const { data, isLoading } = useGetWorkoutPlan({ planId: '123' });
  const createPlan = useCreateWorkoutPlan();

  const handleCreate = () => {
    createPlan.mutate({
      name: 'New Plan',
      duration: 8,
    });
  };
}
```

### Never Do This

```typescript
// ❌ Wrong - Direct Supabase calls in components
function MyScreen() {
  const [data, setData] = useState([]);

  useEffect(() => {
    supabase
      .from('weight_logs')
      .select('*')
      .then(({ data }) => {
        setData(data);
      });
  }, []);
}

// ❌ Wrong - Direct fetch calls
function MyScreen() {
  const [data, setData] = useState([]);

  useEffect(() => {
    fetch('/api/workouts')
      .then(res => res.json())
      .then(setData);
  }, []);
}
```

---

## Cross-Platform Components

Every component must work on **iOS, Android, and Web**.

### Common Platform Issues

```typescript
// ❌ Wrong - Alert doesn't work on web
import { Alert } from 'react-native';
Alert.alert('Title', 'Message');

// ✅ Correct - Use custom cross-platform alert
import { Alert } from '@/components/common/Alert';
Alert.alert('Title', 'Message');

// ❌ Wrong - StatusBar behaves differently
import { StatusBar } from 'react-native';
<StatusBar barStyle="dark-content" />

// ✅ Correct - Use expo-status-bar
import { StatusBar } from 'expo-status-bar';
<StatusBar style="dark" />

// ✅ Platform-specific code when necessary
import { Platform } from 'react-native';

const styles = StyleSheet.create({
  container: {
    paddingTop: Platform.select({
      ios: 20,
      android: 25,
      web: 0,
    }),
  },
});
```

### Platform-Specific Files (When Needed)

```typescript
// Component.ios.tsx
// Component.android.tsx
// Component.web.tsx
// Component.tsx (fallback)
```

---

## Styling & Theming

All components must support **Dark Mode** and **Light Mode**.

### Pattern

```typescript
import { useTheme } from '@/context/ThemeContext';

function MyComponent() {
  const { colors, isDark } = useTheme();

  return (
    <View style={{ backgroundColor: colors.background }}>
      <Text style={{ color: colors.text }}>Hello</Text>
    </View>
  );
}

// ❌ Never hardcode colors
<View style={{ backgroundColor: '#ffffff' }}>
<Text style={{ color: '#000000' }}>

// ✅ Always use theme
<View style={{ backgroundColor: colors.background }}>
<Text style={{ color: colors.text }}>
```

---

## Translations

### Pattern

```typescript
import { useTranslation } from 'react-i18next';

function MyScreen() {
  const { t } = useTranslation();

  return (
    <View>
      <Text>{t('health.weight.title')}</Text>
      <Text>{t('health.weight.addButton')}</Text>
    </View>
  );
}
```

### Rules

- **Only add translations that are actively used**
- Use namespaced keys: `module.feature.key`
- When deleting features, remove unused translation keys
- Never hardcode user-facing strings

```typescript
// ❌ Wrong
<Text>Weight Log</Text>
<Button title="Add Weight" />

// ✅ Correct
<Text>{t('health.weight.title')}</Text>
<Button title={t('health.weight.addButton')} />
```

---

## Code Cleanup

### Dead Code Policy: Delete, Don't Comment

```typescript
// ❌ Wrong - commented "just in case"
// function oldImplementation() {
//   // This was the old way
//   return data.map(...)
// }

function newImplementation() {
  return data.map(...)
}

// ✅ Correct - Just delete it
function newImplementation() {
  return data.map(...)
}
// It's in git history if we need it
```

### Before Completing Any Task

- [ ] Remove unused imports
- [ ] Delete commented code
- [ ] Remove `console.log` statements
- [ ] Delete unused files
- [ ] Remove unused variables (linter will catch this)

---

## Database Changes Workflow

### 1. Create Migration

```sql
-- supabase/migrations/20240205120000_add_workout_logs.sql

-- Create enum first
CREATE TYPE workout_type AS ENUM ('strength', 'cardio', 'flexibility');

-- Create table
CREATE TABLE workout_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  workout_type workout_type NOT NULL,
  duration_minutes INTEGER,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Create indexes
CREATE INDEX idx_workout_logs_user_id ON workout_logs(user_id);
CREATE INDEX idx_workout_logs_created_at ON workout_logs(created_at DESC);

-- Enable RLS
ALTER TABLE workout_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own workout logs"
  ON workout_logs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own workout logs"
  ON workout_logs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own workout logs"
  ON workout_logs FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own workout logs"
  ON workout_logs FOR DELETE
  USING (auth.uid() = user_id);

-- Create trigger for updated_at
CREATE TRIGGER update_workout_logs_updated_at
  BEFORE UPDATE ON workout_logs
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
```

### 2. Run Migration & Generate Types

```bash
# Run migration locally
npx supabase db push

# Generate TypeScript types
pnpm run generate:types
# or
npx supabase gen types typescript --local > src/types/database.types.ts
```

### 3. Update Type Definitions

```typescript
// src/types/requests.types.ts

// Add new types
export type WorkoutLog = Row<'workout_logs'>;
export type WorkoutLogInsert = Insert<'workout_logs'>;
export type WorkoutLogUpdate = Update<'workout_logs'>;
export type WorkoutType = Enum<'workout_type'>;
```

### 4. Create Hook

```typescript
// src/modules/training/hooks/useWorkoutLogs.ts

export function useWorkoutLogs(userId: string) {
  // ... implementation as shown in Data Fetching Pattern
}
```

### 5. Create Service (Optional)

If you have complex queries or business logic:

```typescript
// src/modules/training/services/workoutLogs.service.ts

import { supabase } from '@/lib/supabase';
import type { WorkoutLog, WorkoutLogInsert } from '@/types/requests.types';

export const workoutLogsService = {
  async getByDateRange(userId: string, startDate: string, endDate: string) {
    const { data, error } = await supabase
      .from('workout_logs')
      .select('*')
      .eq('user_id', userId)
      .gte('created_at', startDate)
      .lte('created_at', endDate)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data;
  },

  // ... more complex queries
};
```

---

## Module Organization

When working on a feature (e.g., "health" module):

```
src/modules/health/
├── algorithms/          # Business logic, calculations
│   ├── bmi.ts
│   └── calorieCalculator.ts
├── components/          # Feature-specific components
│   ├── WeightChart.tsx
│   └── BMICard.tsx
├── constants/           # Feature-specific constants
│   └── healthMetrics.ts
├── hooks/               # Feature-specific hooks
│   ├── useWeightLogs.ts
│   └── useBodyMetrics.ts
├── screens/             # Feature screens
│   ├── WeightListScreen.tsx
│   ├── WeightDetailScreen.tsx
│   └── WeightCreateScreen.tsx
├── services/            # Feature API services (if needed)
│   └── healthMetrics.service.ts
└── DOCUMENTATION.md     # Feature-specific docs
```

### When to Create in Module vs. Root `src/`

| Location                            | When to Use                               |
| ----------------------------------- | ----------------------------------------- |
| `src/modules/[feature]/hooks/`      | Hook is only used within this feature     |
| `src/hooks/`                        | Hook is used across multiple features     |
| `src/modules/[feature]/components/` | Component is feature-specific             |
| `src/components/`                   | Component is a reusable UI primitive      |
| `src/modules/[feature]/constants/`  | Constants specific to this feature        |
| `src/constants/`                    | App-wide constants (API keys, app config) |

---

## Common Patterns Summary

| Task                   | Pattern                                          | Location                                                                                |
| ---------------------- | ------------------------------------------------ | --------------------------------------------------------------------------------------- |
| New DB table           | Migration → Generate types → Create hook         | `supabase/migrations/` → `src/types/requests.types.ts` → `src/modules/[feature]/hooks/` |
| New screen             | Add to navigation types → Create component       | `src/types/navigation.types.ts` → `src/modules/[feature]/screens/` or `src/screens/`    |
| Fetch data             | Use TanStack Query via custom hook               | `src/modules/[feature]/hooks/use[Feature].ts`                                           |
| Supabase operation     | Wrap in `useMutation` or `useQuery`              | Inside custom hooks                                                                     |
| OpenAPI call           | Use generated TanStack Query hooks               | Import from `src/openapi/queries`                                                       |
| Reusable UI component  | Create in shared components                      | `src/components/`                                                                       |
| Feature component      | Create in module components                      | `src/modules/[feature]/components/`                                                     |
| Styling                | Use theme hook                                   | `const { colors } = useTheme()`                                                         |
| Platform-specific code | Use `Platform.select()` or `.platform.tsx` files | Anywhere needed                                                                         |
| Translations           | Use `useTranslation` hook                        | `const { t } = useTranslation()`                                                        |

---

## Pre-Implementation Checklist

Before writing code, ask yourself:

- [ ] **Types**: Did I check `src/types/` for existing types?
- [ ] **Components**: Did I search for similar components in `src/components/` and `src/modules/`?
- [ ] **Hooks**: Is there already a hook that does this in `src/hooks/` or the feature's `hooks/` folder?
- [ ] **Navigation**: Are the navigation types updated if I'm adding a new screen?
- [ ] **No `any`**: Am I using proper TypeScript types everywhere?
- [ ] **Cross-platform**: Will this work on iOS, Android, and Web?
- [ ] **Theme**: Am I using theme colors instead of hardcoded values?
- [ ] **Translations**: Am I using `t()` for all user-facing strings?
- [ ] **Data fetching**: Am I using TanStack Query (not raw fetch/Supabase calls)?

---

## Common Mistakes to Avoid

### 1. Using `any` Type

```typescript
// ❌ NEVER
function handleSubmit(data: any) {}
const response: any = await api.call();

// ✅ ALWAYS
function handleSubmit(data: WorkoutLogInsert) {}
const response: WorkoutLog = await api.call();
```

### 2. Direct Database Calls in Components

```typescript
// ❌ Wrong
function MyScreen() {
  useEffect(() => {
    supabase.from('weight_logs').select('*').then(...)
  }, []);
}

// ✅ Correct
function MyScreen() {
  const { weightLogs, isLoading } = useWeightLogs(userId);
}
```

### 3. Creating Duplicate Components

```typescript
// ❌ Wrong - Creating WeightInput when Input already exists
function WeightInput({ value, onChange }: Props) {
  return <TextInput value={value} onChangeText={onChange} />;
}

// ✅ Correct - Reuse existing Input component
import { Input } from '@/components/ui/Input';
<Input value={weight} onChange={setWeight} type="number" />
```

### 4. Hardcoded Colors

```typescript
// ❌ Wrong
<View style={{ backgroundColor: '#ffffff' }}>

// ✅ Correct
const { colors } = useTheme();
<View style={{ backgroundColor: colors.background }}>
```

### 5. Hardcoded Strings

```typescript
// ❌ Wrong
<Text>Add Weight</Text>

// ✅ Correct
const { t } = useTranslation();
<Text>{t('health.weight.addButton')}</Text>
```

### 6. Untyped Navigation

```typescript
// ❌ Wrong
const navigation = useNavigation();
navigation.navigate('WeightDetail', { id: 123 }); // No type checking

// ✅ Correct
const navigation = useNavigation<HealthScreenNavigationProp>();
navigation.navigate('WeightDetail', { weightId: '123' }); // Fully typed
```

---

## When You Need Help

1. **Search the codebase** for similar implementations:
   - Similar components in `src/components/` or `src/modules/*/components/`
   - Similar hooks in `src/hooks/` or `src/modules/*/hooks/`
   - Similar screens in `src/screens/` or `src/modules/*/screens/`

2. **Check type definitions** in `src/types/`:
   - `database.types.ts` - Supabase schema
   - `requests.types.ts` - Database type proxies
   - `navigation.types.ts` - Navigation types

3. **Review module documentation**:
   - Check if the feature has a `DOCUMENTATION.md` file

4. **Ask clarifying questions** if:
   - Requirements are ambiguous
   - You're unsure which approach fits the existing patterns
   - You're about to create something that might already exist

---

## Final Reminder

**The three most common issues:**

1. ❌ Using `any` type
2. ❌ Creating duplicate components instead of reusing
3. ❌ Direct Supabase/fetch calls instead of using hooks

**Before submitting any code, verify:**

- ✅ No `any` types anywhere
- ✅ Checked for existing similar components
- ✅ All data fetching uses TanStack Query hooks
- ✅ Works on iOS, Android, and Web
- ✅ Supports dark and light themes
- ✅ All user-facing strings use translations
- ✅ Navigation is fully typed
- ✅ No commented code, no console.logs, no unused imports
