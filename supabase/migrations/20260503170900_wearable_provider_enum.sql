-- Create enum for wearable providers to strongly type provider columns
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'wearable_provider_enum') THEN
    CREATE TYPE public.wearable_provider_enum AS ENUM (
      'strava',
      'garmin',
      'polar',
      'suunto',
      'whoop',
      'oura',
      'fitbit',
      'ultrahuman'
    );
  END IF;
END $$;

-- Migrate existing text columns to enum
ALTER TABLE public.provider_oauth_states
  ALTER COLUMN provider TYPE public.wearable_provider_enum
  USING provider::public.wearable_provider_enum;

ALTER TABLE public.user_connections
  ALTER COLUMN provider TYPE public.wearable_provider_enum
  USING provider::public.wearable_provider_enum;

