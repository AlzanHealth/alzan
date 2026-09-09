# Weekly Shopping Availability

## Goal

Allow a user to record how many grams of each aggregated shopping-list ingredient they already have at home for the active date range, and calculate the remaining amount to buy without coupling that calculation to the bought checkbox.

## Approved behavior

- Availability defaults to `0 g` when no value exists for an ingredient in the active range.
- The amount to buy is `max(required grams - available grams, 0)`.
- Availability is stored independently for each user and date range. A new week starts at `0 g`; revisiting a previous week restores that week's values.
- Saving `0 g` is valid and clears the practical availability for that ingredient.
- Marking or unmarking an ingredient as bought changes only its completion state. It never changes availability or the calculated amount to buy.
- Category actions, filters, period changes, reset actions, copy/share, and Apple Reminders preserve these semantics. Reset clears both bought marks and availability for the active range; exports contain the calculated amount to buy.

## Data design

The existing shopping-list state already scopes records by `user_id`, `range_start`, `range_end`, and `ingredient_key`. Add a nullable `available_quantity_g` column to `shopping_list_states` with a non-negative check. The old `purchase_quantity_g` column is not interpreted as availability, avoiding incorrect migration of values that represented a different concept.

Local state uses `availableQuantityGrams`. The local storage prefix is versioned so values from the previous custom-purchase-quantity semantics cannot appear as household availability. Server synchronization reads and writes only `available_quantity_g`.

The shopping planner exposes pure helpers for reading availability, calculating amount to buy, parsing non-negative gram input, and formatting exports. The screen derives the display values from the aggregated required amount plus the range-scoped state.

## UI behavior

Each ingredient row shows required amount, amount available at home, and amount still to buy. The existing quantity sheet becomes an availability sheet with a decimal gram input and a valid `0` value. The action remains manual and does not auto-check the ingredient.

## Validation

Unit tests cover zero/default values, decimal input, values below/equal/above required quantity, aggregation, weekly isolation, persistence parsing/synchronization, reset behavior, exports, and completion independence. The local quality gate and frontend typecheck/lint are run before handoff.
