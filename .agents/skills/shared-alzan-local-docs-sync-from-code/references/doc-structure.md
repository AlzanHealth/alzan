# Recommended docs structure (Markdown)

Prefer existing repo structure. If missing, use:

- docs/README.md (index)
- docs/architecture/architecture.md (stack, boundaries, data flow)
- docs/architecture/security.md (auth, RLS strategy, privacy)
- docs/architecture/deployment.md (Expo/EAS, env vars, Supabase)
- docs/modules/<module>.md (one per module)
- docs/specs/<feature>.md (deep feature specs)
- docs/changelog/docs-sync-YYYY-MM-DD.md (sync report)

Every module doc should include:

1. Overview
2. User flows
3. Data model refs (tables/entities)
4. Data access (queries/RPC/edge)
5. Security & privacy notes
6. States (loading/empty/error)
7. Edge cases
8. Implementation mapping (code pointers)
9. Status + last verified commit range
