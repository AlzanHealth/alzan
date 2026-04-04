
  create table "public"."social_follows" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "id_follower" uuid not null,
    "id_followed" uuid not null,
    "is_accepted" boolean default false,
    "created_at" timestamp with time zone not null default now()
      );


alter table "public"."social_follows" enable row level security;

alter table "public"."social_follows" add constraint "no_self_follow" CHECK ((id_follower <> id_followed)) not valid;

alter table "public"."social_follows" validate constraint "no_self_follow";

grant delete on table "public"."social_follows" to "anon";

grant insert on table "public"."social_follows" to "anon";

grant references on table "public"."social_follows" to "anon";

grant select on table "public"."social_follows" to "anon";

grant trigger on table "public"."social_follows" to "anon";

grant truncate on table "public"."social_follows" to "anon";

grant update on table "public"."social_follows" to "anon";

grant delete on table "public"."social_follows" to "authenticated";

grant insert on table "public"."social_follows" to "authenticated";

grant references on table "public"."social_follows" to "authenticated";

grant select on table "public"."social_follows" to "authenticated";

grant trigger on table "public"."social_follows" to "authenticated";

grant truncate on table "public"."social_follows" to "authenticated";

grant update on table "public"."social_follows" to "authenticated";

grant delete on table "public"."social_follows" to "postgres";

grant insert on table "public"."social_follows" to "postgres";

grant references on table "public"."social_follows" to "postgres";

grant select on table "public"."social_follows" to "postgres";

grant trigger on table "public"."social_follows" to "postgres";

grant truncate on table "public"."social_follows" to "postgres";

grant update on table "public"."social_follows" to "postgres";

grant delete on table "public"."social_follows" to "service_role";

grant insert on table "public"."social_follows" to "service_role";

grant references on table "public"."social_follows" to "service_role";

grant select on table "public"."social_follows" to "service_role";

grant trigger on table "public"."social_follows" to "service_role";

grant truncate on table "public"."social_follows" to "service_role";

grant update on table "public"."social_follows" to "service_role";


  create policy "Enable read access for all users"
  on "public"."social_follows"
  as permissive
  for select
  to authenticated
using (true);



  create policy "User can follow only him"
  on "public"."social_follows"
  as permissive
  for insert
  to authenticated
with check ((( SELECT auth.uid() AS uid) = id_follower));



  create policy "Users can unfollow someone"
  on "public"."social_follows"
  as permissive
  for delete
  to authenticated
using ((( SELECT auth.uid() AS uid) = id_follower));



