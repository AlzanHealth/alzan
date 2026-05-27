-- Add 'race' to sport_subtype_enum to support Carrera popular
ALTER TYPE sport_subtype_enum ADD VALUE IF NOT EXISTS 'race';
