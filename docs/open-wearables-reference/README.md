# Referencia Open Wearables

Esta carpeta conserva documentacion tecnica del repo Open Wearables para usarla como referencia al implementar wearables en Alzan.

Estos documentos no describen codigo implementado en Alzan. Sirven como material base para entender una arquitectura de agregacion de wearables y adaptar sus patrones al backend NestJS, frontend Expo/React Native y Supabase de Alzan.

## Documentos

- `wearable-integration-architecture.mdx`: arquitectura completa de integracion de wearables, flujos por proveedor, modelo unificado, OAuth, webhooks, normalizacion, deduplicacion y seguridad.
- `how-to-add-new-provider.mdx`: guia tecnica para anadir un proveedor nuevo en Open Wearables. Es util como referencia de patrones, aunque los nombres de carpetas y clases deben adaptarse a Alzan.

## Como usar esta referencia en Alzan

Usa `docs/wearables.md` como documento principal de decision para Alzan.

Usa esta carpeta cuando necesites mas detalle sobre:

- tipos de capacidades por proveedor;
- diferencia entre SDK movil, REST pull, webhook ping y webhook stream;
- estructura de adaptadores por proveedor;
- normalizacion e idempotencia;
- almacenamiento de payloads raw;
- seguridad de OAuth, tokens y webhooks.
