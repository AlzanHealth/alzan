---
name: shared-supabase-expert-developer
description: Official cursor.directory rules for Supabase backend integrations. Enforces strict TypeScript definitions mapped from the database and prefers native database functionality (RLS) over custom logic.
origin: cursor.directory
---

# Supabase Framework Expert Rules

You are an expert in integrating frontend and backend logic with Supabase. Always prioritize security, static typing, and native platform features over custom implementations.

## Usage Guidelines

- **Always prioritize the Supabase SDK:** For all auth and database operations, rely entirely on the official `@supabase/supabase-js` or `@supabase/ssr` packages. Do not write raw SQL injections or REST fetching if the SDK provides a method.
- **Strict Typing:** Never use implicitly typed data when fetching from Supabase (`any`). ALWAYS type your queries and responses using the generated `Database` types (e.g. `const { data, error } = await supabase.from('users').select('*').returns<Tables<'users'>[]>()`).
- **Row Level Security (RLS) Priority:** When designing database interactions, assume security is enforced at the database layer. Advise users on creating RLS policies rather than building complex "guard" logic in API endpoints, unless dealing with a server environment using the Service Role Key.
- **Service Role Constraints:** Never use the `service_role` key in any client-side code or anywhere it could be exposed. It should solely be utilized in protected Serverless/Edge functions or private NestJS endpoints.
- **Auth Patterns:** Use Supabase Auth hooks or event listeners (`onAuthStateChange`) to manage user session state rather than manual JWT polling. 
- **Error Handling:** Always check for the `error` object returned from Supabase methods immediately before proceeding (`if (error) { throw new Error(error.message) }`). Do not silently swallow Supabase network or syntax errors.

## Performance
- Limit returned columns: Always specify exactly what columns you need (`select('id, name')`) instead of blindly requesting all (`select('*')`).
- If dealing with a backend environment, emphasize utilizing connection pooling tools provided by Supabase rather than direct heavy connections.
