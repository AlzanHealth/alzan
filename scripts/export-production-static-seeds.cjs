#!/usr/bin/env node

/**
 * Export the shared production catalogs as local Supabase seed SQL.
 *
 * Safety contract:
 * - Requires EXPORT_PRODUCTION_STATIC_SEEDS=1.
 * - Refuses localhost URLs.
 * - Uses only paginated GET requests against PostgREST.
 * - Never calls an INSERT, UPDATE, DELETE, UPSERT, RPC, or SQL endpoint.
 * - Excludes user-owned recipes and every row that depends on them.
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const SEEDS_DIR = path.join(ROOT, "supabase", "seeds");
const PAGE_SIZE = 1000;
const INSERT_CHUNK_SIZE = 250;
const LEGACY_SEED_FILES = ["3_muscle_group_translations.sql"];

const TABLE_SPECS = [
  {
    file: "1_exercise_types.sql",
    table: "exercise_types",
    columns: ["id", "code"],
    orderBy: ["id"],
  },
  {
    file: "2_equipment.sql",
    table: "equipment",
    columns: ["id", "code"],
    orderBy: ["id"],
  },
  {
    file: "2_equipment_translations.sql",
    table: "equipment_translations",
    columns: ["id", "equipment_id", "language_code", "name"],
    orderBy: ["equipment_id", "language_code", "id"],
  },
  {
    file: "3_muscle_groups.sql",
    table: "muscle_groups",
    columns: ["id", "code"],
    orderBy: ["id"],
  },
  {
    // Keep the parent table prefix so Supabase runs muscle_groups first.
    file: "3_muscle_groups_translations.sql",
    table: "muscle_group_translations",
    columns: ["id", "muscle_group_id", "language_code", "name"],
    orderBy: ["muscle_group_id", "language_code", "id"],
  },
  {
    file: "4_exercises.sql",
    table: "exercises",
    columns: [
      "id",
      "base_name_es",
      "primary_muscle_id",
      "secondary_muscle_id",
      "equipment_id",
      "exercise_type_id",
      "difficulty",
      "description_es",
      "is_custom",
      "owner_user_id",
      "created_at",
      "base_name_en",
      "description_en",
      "load_type",
    ],
    orderBy: ["id"],
    filter: (row) => row.is_custom === false && row.owner_user_id == null,
  },
  {
    file: "5_exercise_media.sql",
    table: "exercise_media",
    columns: ["id", "exercise_id", "media_type", "url", "sort_order"],
    orderBy: ["exercise_id", "sort_order", "id"],
  },
  {
    file: "5_exercise_translations.sql",
    table: "exercise_translations",
    columns: ["id", "exercise_id", "language_code", "name", "description"],
    orderBy: ["exercise_id", "language_code", "id"],
    filter: (row) => row.exercise_id,
  },
  {
    file: "6_ingredients.sql",
    table: "ingredients",
    columns: [
      "id",
      "name_es",
      "name_en",
      "name_norm_es",
      "category",
      "unit_basis",
      "kcal_100",
      "protein_g_100",
      "carbs_g_100",
      "fat_g_100",
      "fiber_g_100",
      "sugar_g_100",
      "sodium_mg_100",
      "salt_g_100",
      "source_primary",
      "source_secondary",
      "quality_score",
      "notes_es",
      "created_at",
      "updated_at",
      "notes_en",
    ],
    orderBy: ["id"],
  },
  {
    file: "7_recipes.sql",
    table: "recipes",
    columns: [
      "id",
      "name_es",
      "name_en",
      "name_norm_es",
      "description_es",
      "quality_score",
      "created_at",
      "updated_at",
      "description_en",
      "owner_user_id",
      "source",
      "visibility",
      "deleted_at",
      "kcal_100",
      "protein_g_100",
      "carbs_g_100",
      "fat_g_100",
      "published_at",
      "public_slug",
      "origin_recipe_id",
      "uses_total",
      "uses_30d",
      "uses_7d",
      "users_unique_30d",
      "saves_total",
      "favorites_total",
      "popularity_score",
    ],
    orderBy: ["id"],
    filter: (row) =>
      row.owner_user_id == null &&
      row.source === "system" &&
      row.visibility === "public" &&
      row.deleted_at == null,
  },
  {
    file: "8_recipe_items.sql",
    table: "recipe_items",
    columns: [
      "id",
      "recipe_id",
      "ingredient_id",
      "order_index",
      "quantity",
      "unit",
      "notes",
      "created_at",
    ],
    orderBy: ["recipe_id", "order_index", "id"],
  },
  {
    file: "9_recipe_aliases.sql",
    table: "recipe_aliases",
    columns: ["id", "recipe_id", "alias_es", "alias_norm_es", "created_at"],
    orderBy: ["recipe_id", "alias_norm_es", "id"],
  },
  {
    file: "11_sport_catalog_options.sql",
    table: "sport_catalog_options",
    columns: [
      "id",
      "sport_type",
      "option_type",
      "option_key",
      "translation_key",
      "group_translation_key",
      "sort_order",
      "is_template_selectable",
      "is_active",
      "created_at",
      "label_es",
      "label_en",
      "group_label_es",
      "group_label_en",
    ],
    orderBy: ["sport_type", "option_type", "sort_order", "option_key", "id"],
    replaceExisting: true,
  },
];

function sqlIdentifier(value) {
  return `"${value.replaceAll('"', '""')}"`;
}

function sqlLiteral(value) {
  if (value == null) return "NULL";
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  if (typeof value === "number")
    return Number.isFinite(value) ? String(value) : "NULL";
  if (typeof value === "object") return sqlLiteral(JSON.stringify(value));
  return `'${String(value).replaceAll("'", "''")}'`;
}

function compareValues(left, right) {
  if (left == null && right == null) return 0;
  if (left == null) return -1;
  if (right == null) return 1;
  return String(left).localeCompare(String(right), "en");
}

function sortRows(rows, orderBy) {
  return [...rows].sort((left, right) => {
    for (const key of orderBy) {
      const result = compareValues(left[key], right[key]);
      if (result !== 0) return result;
    }
    return 0;
  });
}

function filterRowsById(rows, column, allowedIds) {
  return rows.filter((row) => allowedIds.has(row[column]));
}

function buildInsertStatements(table, columns, rows) {
  if (rows.length === 0) return [];

  const columnSql = columns.map(sqlIdentifier).join(", ");
  const statements = [];
  for (let index = 0; index < rows.length; index += INSERT_CHUNK_SIZE) {
    const chunk = rows.slice(index, index + INSERT_CHUNK_SIZE);
    const values = chunk
      .map(
        (row) =>
          `(${columns.map((column) => sqlLiteral(row[column])).join(", ")})`,
      )
      .join(",\n");
    statements.push(
      `INSERT INTO public.${sqlIdentifier(table)} (${columnSql}) VALUES\n${values};`,
    );
  }
  return statements;
}

function buildSeedSql(spec, rows) {
  const sorted = sortRows(rows, spec.orderBy);
  const header = [
    "-- Generated from production by scripts/export-production-static-seeds.cjs.",
    "-- Read-only export: production is never modified by this process.",
    `-- Source table: public.${spec.table}; rows: ${sorted.length}.`,
    "",
  ];
  if (spec.replaceExisting)
    header.push(`DELETE FROM public.${sqlIdentifier(spec.table)};`, "");
  return `${header.join("\n")}${buildInsertStatements(spec.table, spec.columns, sorted).join("\n\n")}\n`;
}

function removeLegacySeedFiles(seedsDir = SEEDS_DIR) {
  for (const file of LEGACY_SEED_FILES) {
    const filePath = path.join(seedsDir, file);
    if (fs.existsSync(filePath)) fs.rmSync(filePath);
  }
}

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const values = {};
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(
      line.trim(),
    );
    if (!match) continue;
    values[match[1]] = match[2].replace(/^(['"])(.*)\1$/, "$2");
  }
  return values;
}

function readProductionConfig() {
  if (process.env.EXPORT_PRODUCTION_STATIC_SEEDS !== "1") {
    throw new Error(
      "Refusing to export: set EXPORT_PRODUCTION_STATIC_SEEDS=1 explicitly.",
    );
  }

  const rootEnv = parseEnvFile(path.join(ROOT, ".env"));
  const backendEnv = parseEnvFile(path.join(ROOT, "alzan-be", ".env"));
  const env = { ...rootEnv, ...backendEnv, ...process.env };
  const url = env.PRODUCTION_SUPABASE_URL || env.SUPABASE_URL;
  const key =
    env.PRODUCTION_SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key)
    throw new Error("Missing production Supabase URL or service-role key.");

  const normalizedUrl = url.toLowerCase();
  if (/(localhost|127\.0\.0\.1|0\.0\.0\.0)/.test(normalizedUrl)) {
    throw new Error(`Refusing to export from a local Supabase URL: ${url}`);
  }
  return { url: url.replace(/\/$/, ""), key };
}

async function fetchAllRows(config, spec) {
  const query = new URLSearchParams({
    select: spec.columns.join(","),
    order: spec.orderBy.join(".asc,") + ".asc",
  });
  const rows = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    query.set("offset", String(offset));
    query.set("limit", String(PAGE_SIZE));
    const response = await fetch(
      `${config.url}/rest/v1/${spec.table}?${query.toString()}`,
      {
        headers: { apikey: config.key, Authorization: `Bearer ${config.key}` },
      },
    );
    if (!response.ok)
      throw new Error(
        `GET ${spec.table} failed (${response.status}): ${await response.text()}`,
      );
    const page = await response.json();
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
  }
}

async function exportSeeds() {
  const config = readProductionConfig();
  const exported = new Map();
  for (const spec of TABLE_SPECS) {
    const rows = (await fetchAllRows(config, spec)).filter(
      spec.filter || (() => true),
    );
    exported.set(spec.table, rows);
  }

  const systemExerciseIds = new Set(
    exported.get("exercises").map((row) => row.id),
  );
  exported.set(
    "exercise_translations",
    filterRowsById(
      exported.get("exercise_translations"),
      "exercise_id",
      systemExerciseIds,
    ),
  );
  const systemRecipeIds = new Set(exported.get("recipes").map((row) => row.id));
  exported.set(
    "recipe_items",
    filterRowsById(exported.get("recipe_items"), "recipe_id", systemRecipeIds),
  );
  exported.set(
    "recipe_aliases",
    filterRowsById(
      exported.get("recipe_aliases"),
      "recipe_id",
      systemRecipeIds,
    ),
  );

  // Remove renamed generated files only after all remote reads succeeded. This
  // prevents an old filename from being picked up before its parent seed.
  removeLegacySeedFiles();

  for (const spec of TABLE_SPECS) {
    const rows = exported.get(spec.table);
    fs.writeFileSync(path.join(SEEDS_DIR, spec.file), buildSeedSql(spec, rows));
    console.log(`${spec.file}: ${rows.length} rows`);
  }
}

if (require.main === module) {
  exportSeeds().catch((error) => {
    console.error(`Static seed export failed: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = {
  TABLE_SPECS,
  buildInsertStatements,
  buildSeedSql,
  filterSystemRecipes: (row) =>
    row.owner_user_id == null &&
    row.source === "system" &&
    row.visibility === "public" &&
    row.deleted_at == null,
  filterRowsById,
  removeLegacySeedFiles,
  sqlLiteral,
  sortRows,
};
