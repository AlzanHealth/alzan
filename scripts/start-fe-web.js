#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const rootEnvPath = path.join(ROOT, ".env");

function readEnvValue(filePath, key) {
  if (!fs.existsSync(filePath)) return null;

  const raw = fs.readFileSync(filePath, "utf8");
  const pattern = new RegExp(`^\\s*${key}\\s*=\\s*(.*)\\s*$`, "m");
  const match = pattern.exec(raw);
  if (!match) return null;

  return match[1].replace(/^['"]|['"]$/g, "").trim();
}

const fePort = readEnvValue(rootEnvPath, "FE_PORT") || "8081";

const child = spawn("pnpm", ["--prefix", "alzan-fe", "start", "--", "--port", fePort], {
  cwd: ROOT,
  env: { ...process.env, FE_PORT: fePort },
  stdio: "inherit",
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});
