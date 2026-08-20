import { spawn } from "node:child_process";

const [major, minor] = process.versions.node
  .split(".")
  .slice(0, 2)
  .map((value) => Number(value));

const useImportFlag = major > 20 || (major === 20 && minor >= 6) || (major === 18 && minor >= 19);
const loaderArgs = useImportFlag ? ["--import", "tsx"] : ["--loader", "tsx"];
const testTargets = process.argv.slice(2);

if (testTargets.length === 0) {
  console.error("Missing test target. Example: node scripts/run-ts-tests.mjs tests/repositories.test.ts");
  process.exit(1);
}

const child = spawn(
  process.execPath,
  [...loaderArgs, "--test", ...testTargets],
  {
    stdio: "inherit",
  },
);

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 1);
});
