const { rmSync } = require("node:fs");

rmSync("dist-electron", { recursive: true, force: true });
