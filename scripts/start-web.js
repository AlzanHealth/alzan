#!/usr/bin/env node

const { spawn, spawnSync } = require("child_process");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");

function runPrestart() {
  const useCloud = process.argv.includes("--cloud");

  if (useCloud) {
    const guard = spawnSync(process.execPath, [path.join(ROOT, "scripts", "guard-cloud.js")], {
      cwd: ROOT,
      stdio: "inherit",
    });

    if (guard.status !== 0) {
      process.exit(guard.status ?? 1);
    }
  }

  const syncArgs = [path.join(ROOT, "scripts", "sync-env.js")];
  if (useCloud) syncArgs.push("--cloud");

  const result = spawnSync(process.execPath, syncArgs, {
    cwd: ROOT,
    stdio: "inherit",
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function spawnNamed(name, command, args) {
  const child = spawn(command, args, {
    cwd: ROOT,
    env: process.env,
    stdio: "inherit",
  });

  child.on("error", (error) => {
    console.error(`[${name}] ${error.message}`);
  });

  return child;
}

runPrestart();

const children = [
  spawnNamed("be", "pnpm", ["--prefix", "alzan-be", "start:dev"]),
  spawnNamed("fe", process.execPath, [path.join(ROOT, "scripts", "start-fe-web.js")]),
];

let shuttingDown = false;

function stopAll(signal = "SIGTERM") {
  if (shuttingDown) return;
  shuttingDown = true;

  for (const child of children) {
    if (!child.killed) child.kill(signal);
  }
}

for (const child of children) {
  child.on("exit", (code, signal) => {
    if (shuttingDown) return;

    if (signal) {
      stopAll(signal);
      process.exit(1);
    }

    if (code !== 0) {
      stopAll();
      process.exit(code ?? 1);
    }
  });
}

process.on("SIGINT", () => {
  stopAll("SIGINT");
  process.exit(130);
});

process.on("SIGTERM", () => {
  stopAll("SIGTERM");
  process.exit(143);
});
