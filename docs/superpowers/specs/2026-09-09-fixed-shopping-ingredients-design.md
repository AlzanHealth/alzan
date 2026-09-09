# Fixed Shopping Ingredients Design

## Goal

Allow each user to mark catalog ingredients that they do not buy through the regular market, such as protein powder or creatine, so those ingredients are excluded from the shopping list while remaining part of the nutrition plan.

## Approved behavior

- Nutrition settings expose an “Ingredients I don't buy” control with catalog search.
- The setting is global for the user and persists across shopping-list weeks and custom ranges.
- The shopping-list service filters excluded ingredients after aggregation, so the UI, copy/share actions, exports, and Apple Reminders all use the same filtered result.
- Exclusions are keyed by stable catalog ingredient IDs. Ingredients entered only as free-text meal items are not selectable in this first version.
- Exclusions do not change meal logs, meal nutrition, macros, or the weekly availability state.
- Removing an exclusion makes the ingredient eligible for the shopping list again; any range-specific availability state remains intact.
- With no exclusions configured, existing shopping-list behavior remains unchanged.

## Data flow

`nutrition_prefs.shopping_list_excluded_ingredient_keys` stores stable keys in the existing user preference JSON. The frontend settings component searches the ingredient catalog, adds or removes `id:<ingredient-id>` keys, and updates preferences through the existing preferences context.

The shopping-list hook includes the sorted exclusion keys in its cache/query identity and passes them to the shopping-list service. The planner exposes a pure exclusion filter used by the service after ingredient aggregation. This keeps the exclusion behavior consistent for all consumers of the shopping-list result.

## UI

Add a dedicated section in `NutritionSettingsScreen` near the existing shopping-list settings. The section contains an explanatory label, a debounced ingredient search field, search results with add/remove state, and the currently selected ingredients with remove actions. Loading and empty states use existing theme and translation patterns.

## Error handling

- Search failures produce an empty result and do not modify saved preferences.
- Preference updates use the existing `updatePreferences` flow; no optimistic mutation is required beyond the existing shared preference state behavior.
- Invalid or missing preference values are treated as an empty exclusion list.
- The shopping-list cache key changes when exclusions change, preventing stale unfiltered results from being shown as the current list.

## Testing

- Pure planner tests cover no exclusions, excluded catalog IDs, non-catalog name keys, and duplicate aggregation before filtering.
- Preference parsing tests cover valid keys, malformed values, and empty defaults.
- Hook/service-facing tests cover the exclusion keys becoming part of the shopping-list request/cache identity.
- Frontend typecheck, format, lint, import-review, and direct local app verification cover the integrated flow.
