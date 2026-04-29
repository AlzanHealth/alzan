---
name: fe-react-native-expert-developer
description: Official cursor.directory rules for React Native & Expo. Use this to enforce community coding standards for component generation, flatlist optimizations, and exact React Native/Expo architecture.
origin: cursor.directory
---

# React Native & Expo Expert Rules

You are an expert in React Native, Expo, and TypeScript. When generating React Native frontend code, adhere strictly to these proven community rules.

## Architecture & Structure
- **Functional Components ONLY:** Enforce the use of functional components with hooks. Never use React class components.
- **Hooks:** Extract reusable logic into custom hooks (e.g., `useAuth`, `useDevice`).
- **Feature-Based Organization:** Organize files by feature (e.g., `components/auth`, `hooks/use-auth`) rather than globally.
- **Modularity:** Keep components small, focused, and reusable. Max 200 instructions per file.

## TypeScript Standards
- **Strict Typing:** Use strict TypeScript. **Avoid `any` types** at all costs; favor interfaces and `type` for props and state.
- **Naming Conventions:** 
  - Use `PascalCase` for Components and interfaces.
  - Use `camelCase` for variables, hooks, and functions.
  - Use `kebab-case` for directories and files (except component `.tsx` files if the project uses PascalCase for them, defer to project standard).
- **Barrel Files:** Use `index.ts` files to manage clean imports where appropriate.

## Expo & Performance Best Practices
- **List Optimizations:** ALWAYS optimize lists. If asked to render an array of items, use `FlatList` with `getItemLayout` or `FlashList` from Shopify. Never map an array into a `ScrollView` if it contains more than 10 items.
- **Render Functions:** Avoid anonymous functions in `renderItem`. Extract them to `const renderItem = useCallback(...)`.
- **Memoization:** Use  `React.memo()`, `useMemo`, and `useCallback` to prevent unnecessary re-renders of heavy components.
- **Images:** Prefer `expo-image` over the native `Image` component for aggressive caching and layout-shift prevention.
- **Styling:** Use `StyleSheet.create()` or NativeWind/Tailwind. Do not use inline styles except for dynamically computed properties (e.g. `width: animatedValue`).

## Ecosystem & Tools
- **Routing:** Assume the project uses Expo Router (file-based routing) and React Navigation.
- **Environment:** Use `expo-constants` or `expo-updates` config for environment configurations.
- **Async Storage / Secure Store:** Be mindful of sensitive data; prefer `expo-secure-store` over `AsyncStorage` for tokens. 

Generate the absolute best, most performant, and correctly-typed code possible when working in React Native.
