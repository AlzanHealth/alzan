ALTER TYPE "public"."sport_type_enum" ADD VALUE IF NOT EXISTS 'surf';

ALTER TYPE "public"."sport_subtype_enum" ADD VALUE IF NOT EXISTS 'surf';
ALTER TYPE "public"."sport_subtype_enum" ADD VALUE IF NOT EXISTS 'longboard';
ALTER TYPE "public"."sport_subtype_enum" ADD VALUE IF NOT EXISTS 'shortboard';
ALTER TYPE "public"."sport_subtype_enum" ADD VALUE IF NOT EXISTS 'bodyboard';
ALTER TYPE "public"."sport_subtype_enum" ADD VALUE IF NOT EXISTS 'paddle_surf';


