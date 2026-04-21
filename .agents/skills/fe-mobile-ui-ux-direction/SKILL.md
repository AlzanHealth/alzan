---
name: fe-mobile-ui-ux-direction
description: Use when designing, restyling, or reviewing React Native and Expo screens or components where mobile UX quality, visual hierarchy, touch ergonomics, navigation clarity, theming, or motion matters.
source: adapted for Alzan from mobile-relevant UI UX Pro Max guidance and the current React Native Liquid Glass design direction in this repo
---

# Mobile UI/UX Direction

Use this skill for mobile-first design decisions in `alzan-fe/`.

This skill is intentionally not a web design system. It exists to improve iOS and Android screens in Alzan without leaking Tailwind, shadcn, hover-first, or desktop layout assumptions into the app.

## Mandatory pairing rules

- Pair with `fe-react-native-best-practices` when the change affects lists, charts, blur or glass layers, images, animations, scrolling, or startup behavior.
- Pair with `fe-react-component-performance` when the real problem is component slowness or re-render churn.
- Pair with `fe-manage-translations` when changing user-visible copy.
- Run `shared-pnpm-quality-gate` after code changes.

## Default direction for Alzan

- Prefer calm, trustworthy, athletic UI over flashy trend-chasing.
- Keep the current Liquid Glass direction, but use glass for depth and focus, not decoration spam.
- Favor strong hierarchy, readable metrics, and clean spacing over effect-heavy screens.
- On health and wearable flows, trust and clarity beat novelty.
- On future social flows, energy can increase, but content and actions must still stay legible and thumb-friendly.

## Use this skill when

- designing a new screen or major visual refactor
- improving navigation, information hierarchy, or task clarity
- reviewing whether a UI feels polished enough on mobile
- choosing layout, spacing, theme, motion, or interaction patterns
- shaping health, analytics, social, or wearable-related mobile experiences

## Skip this skill when

- the task is backend-only
- the task is database-only
- the change is purely technical and has no user-facing UI effect
- you only need performance profiling with no design decision involved

## Mobile decision order

1. Define the screen job

- What is the main task on this screen?
- What is the one primary action?
- What can be secondary, collapsed, or delayed?

2. Build hierarchy before styling

- Put the most important action in the thumb-friendly zone.
- Keep one dominant CTA per screen.
- Use spacing, size, and contrast to show hierarchy before adding effects.

3. Choose the right mobile container

- Use bottom tabs only for top-level destinations and keep them to 5 or fewer.
- Use sheets for short contextual tasks.
- Use full routes for deep tasks, creation flows, and complex editing.
- Preserve back behavior and scroll position whenever possible.

4. Respect touch and safe areas

- Minimum tap target: `44x44`.
- Keep critical actions away from notches, gesture bars, and screen edges.
- Do not depend on hover, tiny icons, or edge precision.

5. Apply theme and surfaces with restraint

- Use theme tokens and `useTheme()` instead of hardcoded colors.
- Keep surface layering simple: background, content surface, emphasis surface.
- If using blur or glass, ensure text contrast stays strong.
- Avoid stacking multiple translucent cards unless the depth change is clearly useful.

6. Use motion to explain state

- Prefer short, meaningful transitions around `150-300ms`.
- Motion should explain focus, hierarchy, or feedback.
- Animations must be interruptible and must respect reduced motion.

7. Validate for real mobile use

- Test small phone first, then large phone, then tablet if relevant.
- Check portrait and landscape when the screen can realistically be used that way.
- Verify dynamic type, safe areas, dark/light mode, and loading or empty states.

## Patterns that fit Alzan well

### Health and wearable screens

- Lead with trends and meaning, not raw data dumps.
- Always show source context when relevant: last sync, unit, time range, freshness, missing data.
- Use charts as support for decisions, not as decoration.
- Numeric values should be stable and easy to compare.

### Social screens

- Optimize for scanability first, then engagement.
- Content should remain readable while actions stay secondary until needed.
- Composer, comments, and reactions should feel fast, obvious, and low-friction.
- Keep feed states clear: loading, empty, offline, partial failure, refreshed.

### Forms and settings

- Use the right mobile keyboard type.
- Keep labels visible, errors close to the field, and destructive actions separated.
- Long forms should reduce cognitive load through grouping and progressive disclosure.

### Analytics and charts

- Do not rely on color alone.
- Important points need tap-friendly targets.
- Summaries should explain the chart in words.
- If data is dense, split into sections rather than compressing everything onto one screen.

## Additional guardrails worth enforcing

These are high-value mobile rules adapted from broader UI/UX guidance and kept only because they fit Alzan well.

### Icons and controls

- Do not use emoji as structural UI icons.
- Keep one icon family and one visual language per hierarchy level.
- Prefer native or system-aligned controls over fully custom controls unless branding truly requires otherwise.
- If an icon is visually small, expand the hit area instead of shrinking usability.

### Actions and states

- Each screen should have one clearly dominant primary action.
- Pressed, disabled, loading, success, empty, error, and offline states must be visible and intentional.
- Do not rely on gesture-only critical actions; provide a visible fallback control.
- Destructive actions must be visually separated from normal actions.

### Navigation and flow clarity

- Keep back behavior predictable and preserve state where possible.
- Core navigation should remain reachable from deep flows unless the task is intentionally immersive.
- Do not overload bottom navigation; top-level destinations only.
- Sheets and modals must have an obvious escape route.

### Accessibility and readability

- Respect dynamic type and avoid layouts that collapse when text grows.
- Use meaningful accessibility labels for icon-only actions.
- Make status understandable without color alone.
- Prefer wrapping or expansion over aggressive truncation for important content.

## Anti-patterns

- importing web-first assumptions such as hover states, cursor logic, desktop sidebars, or Tailwind-specific design advice
- more than one competing primary action on the same screen
- emoji used as structural navigation or system icons
- hardcoded colors, shadows, spacing, or radii in screen code
- decorative glass, blur, or animation that reduces readability
- using color alone for status or meaning
- hidden gesture-only critical actions with no visible fallback
- dense dashboards with no clear first read
- feed or detail screens that hide key actions below confusing chrome

## Definition of done

- The screen's primary task is obvious in under a few seconds.
- Touch targets, spacing, and safe areas feel natural on a phone.
- The UI looks intentionally mobile, not like a desktop layout squeezed smaller.
- Theme, motion, and hierarchy support comprehension instead of distracting from it.
- The result fits Alzan's health-first product tone and future social or wearable roadmap.
