-- Minimal user dump with email: info@alzan.com --- password: FakePassword1

SET session_replication_role = replica;

--
-- Data for Name: users; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

INSERT INTO "auth"."users" ("instance_id", "id", "aud", "role", "email", "encrypted_password", "email_confirmed_at", "invited_at", "confirmation_token", "confirmation_sent_at", "recovery_token", "recovery_sent_at", "email_change_token_new", "email_change", "email_change_sent_at", "last_sign_in_at", "raw_app_meta_data", "raw_user_meta_data", "is_super_admin", "created_at", "updated_at", "phone", "phone_confirmed_at", "phone_change", "phone_change_token", "phone_change_sent_at", "email_change_token_current", "email_change_confirm_status", "banned_until", "reauthentication_token", "reauthentication_sent_at", "is_sso_user", "deleted_at", "is_anonymous") VALUES
	('00000000-0000-0000-0000-000000000000', '4424c5d6-5751-4038-aa39-bd85895ddb78', 'authenticated', 'authenticated', 'info@alzan.com', extensions.crypt('FakePassword1', extensions.gen_salt('bf')), '2026-01-10 17:14:06.996671+00', NULL, '', NULL, '', NULL, '', '', NULL, '2026-01-10 18:21:57.811353+00', '{"provider": "email", "providers": ["email"]}', '{"sub": "4424c5d6-5751-4038-aa39-bd85895ddb78", "email": "info@alzan.com", "email_verified": false, "phone_verified": false}', NULL, '2026-01-10 17:14:06.990543+00', '2026-01-15 19:54:13.465004+00', NULL, NULL, '', '', NULL, '', 0, NULL, '', NULL, false, NULL, false);

--
-- Data for Name: identities; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

INSERT INTO "auth"."identities" ("provider_id", "user_id", "identity_data", "provider", "last_sign_in_at", "created_at", "updated_at", "id") VALUES
	('4424c5d6-5751-4038-aa39-bd85895ddb78', '4424c5d6-5751-4038-aa39-bd85895ddb78', '{"sub": "4424c5d6-5751-4038-aa39-bd85895ddb78", "email": "info@alzan.com", "email_verified": false, "phone_verified": false}', 'email', '2026-01-10 17:14:06.995323+00', '2026-01-10 17:14:06.995337+00', '2026-01-10 17:14:06.995337+00', '76a88c8c-7bf4-4faf-b1dc-c549e13a48c0');

--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."users" ("id", "email", "created_at", "updated_at", "date_of_birth", "sex", "height_cm", "display_name", "avatar_url", "username", "onboarding_step") VALUES
	('4424c5d6-5751-4038-aa39-bd85895ddb78', 'info@alzan.com', '2026-01-10 17:14:06.990408+00', '2026-01-10 17:14:06.990408+00', '2000-10-20', 'male', 175, 'Roberto Milla', NULL, 'robertomilla_', 10);

--
-- Data for Name: user_nutrition_settings; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."user_nutrition_settings" ("user_id", "primary_goal", "goal_mode", "adjustment_type", "adjustment_value", "activity_level", "protein_g_per_kg", "fat_g_per_kg", "created_at", "updated_at") VALUES
	('4424c5d6-5751-4038-aa39-bd85895ddb78', 'gain_strength', 'gain', 'percent', 0, 'moderate', NULL, NULL, '2026-01-10 18:22:16.537522+00', '2026-01-10 18:22:16.537522+00');

--
-- Data for Name: user_preferences; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."user_preferences" ("user_id", "weight_unit", "distance_unit", "energy_unit", "language_code", "timezone", "health_data_consent", "import_health_metrics", "nutrition_prefs", "pace_unit", "temperature_unit", "notification_settings", "appearance_settings", "privacy_settings") VALUES
	('4424c5d6-5751-4038-aa39-bd85895ddb78', 'kg', 'km', 'kcal', 'es', NULL, false, false, '{"meal_types": [{"id": "breakfast", "label": "Desayuno", "order": 0, "enabled": true}, {"id": "morning_snack", "label": "Almuerzo", "order": 1, "enabled": true}, {"id": "lunch", "label": "Comida", "order": 2, "enabled": true}, {"id": "afternoon_snack", "label": "Merienda", "order": 3, "enabled": true}, {"id": "dinner", "label": "Cena", "order": 4, "enabled": true}, {"id": "snack", "label": "Snack", "order": 5, "enabled": true}], "snack_behavior": {"treat_as_meal": false, "show_only_if_content": false}}', 'min_km', 'celsius', '{}', '{"theme": "system"}', '{"profile_public": false, "default_workout_visibility": "private"}');

--
-- Data for Name: weight_logs; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."weight_logs" ("id", "user_id", "measured_at", "weight_kg", "bodyfat_percent", "muscle_mass_kg", "source") VALUES
	('cbd3f877-9b49-40b1-a3f1-9bfffc775dad', '4424c5d6-5751-4038-aa39-bd85895ddb78', '2026-01-10 18:22:23.688938+00', 75, NULL, NULL, 'onboarding');

RESET ALL;
