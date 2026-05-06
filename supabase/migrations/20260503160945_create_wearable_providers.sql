-- Store short-lived OAuth state during the authorization flow
CREATE TABLE public.provider_oauth_states (
    state text PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    provider text NOT NULL,
    redirect_uri text,
    code_verifier text,
    expires_at timestamptz NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL
);

-- Protect state table with RLS
ALTER TABLE public.provider_oauth_states ENABLE ROW LEVEL SECURITY;

-- Store the final OAuth connection and tokens for a user
CREATE TABLE public.user_connections (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    provider text NOT NULL,
    provider_user_id text,
    provider_username text,
    access_token text NOT NULL,
    refresh_token text,
    token_expires_at timestamptz NOT NULL,
    scope text,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL,
    UNIQUE(user_id, provider)
);

-- Enable RLS on user connections
ALTER TABLE public.user_connections ENABLE ROW LEVEL SECURITY;

-- Create policies for user connections (users can manage their own)
CREATE POLICY "Users can view their own connections" ON public.user_connections FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own connections" ON public.user_connections FOR DELETE USING (auth.uid() = user_id);
-- Insert/Update are generally handled by the backend (Service Role) and don't need policies if using service role, but we can allow it for completeness if needed. Let's keep it restricted to backend.
