const { spawnSync } = require("node:child_process");

function canLoadWithCurrentNode() {
  try {
    const Database = require("better-sqlite3");
    const database = new Database(":memory:");
    database.close();
    return true;
  } catch (error) {
    console.warn(
      `[native:node] better-sqlite3 is not compatible with Node ABI ${process.versions.modules}:`,
      error instanceof Error ? error.message : error,
    );
    return false;
  }
}

if (!canLoadWithCurrentNode()) {
  const environment = { ...process.env };
  for (const key of Object.keys(environment)) {
    if (
      [
        "npm_config_runtime",
        "npm_config_target",
        "npm_config_disturl",
        "npm_config_electron_version",
      ].includes(key.toLowerCase())
    )
      delete environment[key];
  }

  console.log(`[native:node] Rebuilding better-sqlite3 for Node ${process.versions.node} (ABI ${process.versions.modules})...`);
  const npmCli = process.env.npm_execpath;
  const result = spawnSync(
    npmCli ? process.execPath : process.platform === "win32" ? "npm.cmd" : "npm",
    npmCli ? [npmCli, "rebuild", "better-sqlite3"] : ["rebuild", "better-sqlite3"],
    { cwd: process.cwd(), env: environment, stdio: "inherit" },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
  if (!canLoadWithCurrentNode()) {
    console.error("[native:node] better-sqlite3 still cannot load after rebuilding.");
    process.exit(1);
  }
}

console.log(`[native:node] better-sqlite3 is ready for Node ABI ${process.versions.modules}.`);
