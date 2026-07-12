import { accessSync, constants, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync, chmodSync, copyFileSync } from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";

export const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const skillRoot = join(packageRoot, "product-loop");
export const configRoot = join(homedir(), ".config", "product-loop");
export const agentRoot = join(homedir(), ".pi", "agent");

export function ensureDir(path, mode = 0o700) {
  mkdirSync(path, { recursive: true, mode });
}

export function readJson(path, fallback = {}) {
  if (!existsSync(path)) return structuredClone(fallback);
  return JSON.parse(readFileSync(path, "utf8"));
}

export function atomicWrite(path, content, mode = 0o600) {
  ensureDir(dirname(path));
  const temporary = `${path}.tmp-${process.pid}-${Date.now()}`;
  writeFileSync(temporary, content, { mode });
  chmodSync(temporary, mode);
  renameSync(temporary, path);
}

export function writeJson(path, value, mode = 0o600) {
  atomicWrite(path, `${JSON.stringify(value, null, 2)}\n`, mode);
}

export function backup(path) {
  if (!existsSync(path)) return null;
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const destination = `${path}.backup-${stamp}`;
  copyFileSync(path, destination);
  chmodSync(destination, 0o600);
  return destination;
}

export function shellQuote(value) {
  return `'${String(value).replaceAll("'", `'\\''`)}'`;
}

export function commandExists(command) {
  const result = spawnSync(process.platform === "win32" ? "where" : "which", [command], { stdio: "ignore" });
  return result.status === 0;
}

export function run(command, args = [], options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    env: options.env ?? process.env,
    encoding: options.encoding ?? "utf8",
    stdio: options.stdio ?? "pipe"
  });
  if (!options.allowFailure && result.status !== 0) {
    const detail = [result.stderr, result.stdout].filter(Boolean).join("\n").trim();
    throw new Error(`${command} ${args.join(" ")} failed${detail ? `:\n${detail}` : ""}`);
  }
  return result;
}

export function output(command, args = [], options = {}) {
  return run(command, args, options).stdout.trim();
}

export function safeProjectRoot(input = process.cwd()) {
  return resolve(input);
}

export function canRead(path) {
  try {
    accessSync(path, constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

export function tailText(path, maxBytes = 80_000) {
  if (!existsSync(path)) return "";
  const content = readFileSync(path, "utf8");
  return content.slice(-maxBytes);
}

export function stripTrailingSlash(url) {
  return String(url).trim().replace(/\/+$/, "");
}

export function findModel(ids, preferences) {
  for (const preferred of preferences) if (preferred && ids.includes(preferred)) return preferred;
  return ids[0] ?? null;
}

export function parseArgs(argv) {
  const positional = [];
  const flags = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      positional.push(token);
      continue;
    }
    const [rawName, inline] = token.slice(2).split("=", 2);
    if (inline !== undefined) flags[rawName] = inline;
    else if (argv[index + 1] && !argv[index + 1].startsWith("--")) flags[rawName] = argv[++index];
    else flags[rawName] = true;
  }
  return { positional, flags };
}

export function executablePath(command) {
  if (!commandExists(command)) return null;
  try {
    return execFileSync(process.platform === "win32" ? "where" : "which", [command], { encoding: "utf8" }).trim().split(/\r?\n/)[0];
  } catch {
    return null;
  }
}
