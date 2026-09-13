const { spawn } = require("node:child_process");

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const processes = [
  spawn(npmCommand, ["run", "start", "--prefix", "server"], { stdio: "inherit" }),
  spawn(npmCommand, ["run", "start", "--prefix", "client"], { stdio: "inherit" }),
];

let stopping = false;
function stop(exitCode = 0) {
  if (stopping) return;
  stopping = true;
  processes.forEach((child) => child.kill("SIGTERM"));
  process.exitCode = exitCode;
}

processes.forEach((child) => {
  child.on("error", (error) => {
    console.error(error.message);
    stop(1);
  });
  child.on("exit", (code, signal) => {
    if (!stopping && code !== 0 && signal !== "SIGTERM") stop(code || 1);
  });
});

process.on("SIGINT", () => stop(0));
process.on("SIGTERM", () => stop(0));
