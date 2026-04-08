-- Create enum for notification types
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typnamespace = 'public'::regnamespace
      AND typname = 'notification_type'
  ) THEN
    CREATE TYPE public.notification_type AS ENUM (
      'USER_FOLLOW_REQUEST',
      'USER_FOLLOW_REQUEST_ACCEPTED',
      'USER_FOLLOW_REQUEST_REJECTED'
    );
  END IF;
END
$$;

-- Create notifications table
CREATE TABLE IF NOT EXISTS "public"."notifications" (
  "id"           uuid                     DEFAULT gen_random_uuid() NOT NULL,
  "user_id"      uuid                     NOT NULL,
  "type"         public.notification_type NOT NULL,
  "data"         jsonb                    NOT NULL DEFAULT '{}'::jsonb,
  "read_at"      timestamp with time zone,
  "created_at"   timestamp with time zone NOT NULL DEFAULT now()
);

-- Primary key
CREATE UNIQUE INDEX IF NOT EXISTS notifications_pkey ON public.notifications USING btree (id);
ALTER TABLE "public"."notifications" ADD CONSTRAINT "notifications_pkey" PRIMARY KEY USING INDEX "notifications_pkey";

-- Foreign key to users
ALTER TABLE "public"."notifications"
  ADD CONSTRAINT "notifications_user_id_fkey"
  FOREIGN KEY (user_id) REFERENCES public.users(id)
  ON UPDATE CASCADE ON DELETE CASCADE NOT VALID;

ALTER TABLE "public"."notifications" VALIDATE CONSTRAINT "notifications_user_id_fkey";

-- Enable RLS
ALTER TABLE "public"."notifications" ENABLE ROW LEVEL SECURITY;

-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "public"."notifications" TO "anon";
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "public"."notifications" TO "authenticated";
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "public"."notifications" TO "postgres";
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "public"."notifications" TO "service_role";

-- RLS Policies

-- Users can only read their own notifications
CREATE POLICY "Users can read own notifications"
  ON "public"."notifications"
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);

-- Users can mark their own notifications as read (update read_at)
CREATE POLICY "Users can update own notifications"
  ON "public"."notifications"
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);

-- Users can delete their own notifications
CREATE POLICY "Users can delete own notifications"
  ON "public"."notifications"
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);

-- Only service_role / backend can insert notifications (no user self-insert)
-- Authenticated users are intentionally excluded from INSERT to prevent abuse.

COMMENT ON TABLE public.notifications IS
  'Per-user notifications. RLS ensures each user can only access their own rows.';

COMMENT ON COLUMN public.notifications.user_id IS
  'The recipient user. All RLS policies are keyed on this column via auth.uid().';

COMMENT ON COLUMN public.notifications.type IS
  'Notification category, constrained by the notification_type enum.';

COMMENT ON COLUMN public.notifications.data IS
  'Arbitrary JSON payload carrying context for the notification (e.g. follower id, name).';

COMMENT ON COLUMN public.notifications.read_at IS
  'Timestamp when the user marked the notification as read. NULL means unread.';
