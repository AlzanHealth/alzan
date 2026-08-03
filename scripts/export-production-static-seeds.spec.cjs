const assert = require("assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const {
  buildSeedSql,
  filterRowsById,
  filterSystemRecipes,
  sqlLiteral,
  sortRows,
  TABLE_SPECS,
  removeLegacySeedFiles,
} = require("./export-production-static-seeds.cjs");

const seedFiles = TABLE_SPECS.map((spec) => spec.file).sort();
assert.ok(
  seedFiles.indexOf("3_muscle_groups.sql") <
    seedFiles.indexOf("3_muscle_groups_translations.sql"),
  "muscle groups must be seeded before their translations",
);

const tempSeedsDir = fs.mkdtempSync(path.join(os.tmpdir(), "alzan-seeds-"));
fs.writeFileSync(
  path.join(tempSeedsDir, "3_muscle_group_translations.sql"),
  "legacy",
);
fs.writeFileSync(path.join(tempSeedsDir, "keep.sql"), "keep");
removeLegacySeedFiles(tempSeedsDir);
assert.equal(
  fs.existsSync(path.join(tempSeedsDir, "3_muscle_group_translations.sql")),
  false,
);
assert.equal(fs.existsSync(path.join(tempSeedsDir, "keep.sql")), true);
fs.rmSync(tempSeedsDir, { recursive: true, force: true });

assert.equal(sqlLiteral(null), "NULL");
assert.equal(sqlLiteral(true), "TRUE");
assert.equal(sqlLiteral(12.5), "12.5");
assert.equal(sqlLiteral("Josep's recipe"), "'Josep''s recipe'");
assert.equal(
  sqlLiteral({ provider: "USDA", reference_id: "FDC:1" }),
  '\'{"provider":"USDA","reference_id":"FDC:1"}\'',
);

assert.equal(
  filterSystemRecipes({
    owner_user_id: null,
    source: "system",
    visibility: "public",
    deleted_at: null,
  }),
  true,
);
assert.equal(
  filterSystemRecipes({
    owner_user_id: "user-id",
    source: "user",
    visibility: "private",
    deleted_at: null,
  }),
  false,
);
assert.equal(
  filterSystemRecipes({
    owner_user_id: null,
    source: "system",
    visibility: "public",
    deleted_at: "2026-01-01",
  }),
  false,
);
assert.deepEqual(
  filterRowsById(
    [{ recipe_id: "system" }, { recipe_id: "user" }],
    "recipe_id",
    new Set(["system"]),
  ),
  [{ recipe_id: "system" }],
);

const sorted = sortRows([{ id: "b" }, { id: "a" }], ["id"]);
assert.deepEqual(
  sorted.map((row) => row.id),
  ["a", "b"],
);

const seedSql = buildSeedSql(
  { table: "example", columns: ["id", "label"], orderBy: ["id"] },
  [{ id: "a", label: "O'Hara" }],
);
assert.match(seedSql, /INSERT INTO public\."example"/);
assert.match(seedSql, /'O''Hara'/);

console.log("export-production-static-seeds: all assertions passed");
