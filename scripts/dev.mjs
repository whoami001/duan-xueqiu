import { spawn } from "node:child_process";

const commands = [
  { name: "server", file: "server.mjs" },
  { name: "watcher", file: "scripts/watch.mjs" },
];

if (process.argv.includes("--realtime")) {
  commands.push({ name: "realtime", file: "scripts/realtime-poll.mjs" });
}

let shuttingDown = false;
let exitCode = 0;

const children = commands.map(({ name, file }) => {
  const child = spawn(process.execPath, [file], {
    cwd: process.cwd(),
    env: process.env,
    stdio: "inherit",
  });

  child.on("exit", (code, signal) => {
    console.log(`[${name}] 已退出：code=${code ?? "null"}, signal=${signal ?? "null"}`);
    if (!shuttingDown) {
      exitCode = code ?? 0;
      shutdown();
    }
  });

  return child;
});

function shutdown() {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  for (const child of children) {
    if (child.exitCode === null && !child.killed) {
      child.kill("SIGTERM");
    }
  }

  const forceTimer = setTimeout(() => {
    for (const child of children) {
      if (child.exitCode === null && !child.killed) {
        child.kill("SIGKILL");
      }
    }
  }, 5_000);
  forceTimer.unref();
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    shutdown();
  });
}
