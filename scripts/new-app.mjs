#!/usr/bin/env node
// Scaffolds an app and its infra from templates/<kind>/{app,infra}.
// Usage: node scripts/new-app.mjs <go|py|web|ts> <name> [--no-register]
// Contract: specs/002-app-templates/contracts/scaffold-cli.md
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative } from "node:path";

const NAME_RE = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

/** Per-kind naming, identifier and registration rules. */
export const KINDS = {
  go: {
    appName: (base) => `${base}-go`,
    pkg: (app) => app.replaceAll("-", ""),
    register: (app) => [["go", ["work", "use", `./apps/${app}`]]],
    format: (app) => [["gofmt", ["-w", `apps/${app}`]]],
  },
  py: {
    appName: (base) => `${base}-py`,
    pkg: (app) => app.replaceAll("-", "_"),
    register: () => [["uv", ["sync", "--all-packages"]]],
    format: (app) => [
      ["uv", ["run", "ruff", "check", "--fix", "--quiet", `apps/${app}`]],
      ["uv", ["run", "ruff", "format", "--quiet", `apps/${app}`]],
    ],
  },
  web: {
    appName: (base) => `web-${base}`,
    pkg: () => "",
    register: () => [],
    format: () => [],
  },
  ts: {
    appName: (base) => `${base}-ts`,
    pkg: () => "",
    register: () => [],
    format: () => [],
  },
};

const pascal = (s) =>
  s
    .split("-")
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join("");

/** Placeholder values for one scaffold request. */
export function placeholders(kind, base) {
  const k = KINDS[kind];
  const app = k.appName(base);
  return {
    __NAME__: app,
    __BASE__: base,
    __PKG__: k.pkg(app),
    __PASCAL__: pascal(app),
  };
}

const substitute = (text, values) =>
  text.replace(/__(NAME|BASE|PKG|PASCAL)__/g, (token) => values[token]);

function copyTree(src, dest, values) {
  for (const entry of readdirSync(src, { withFileTypes: true })) {
    const from = join(src, entry.name);
    const to = join(dest, substitute(entry.name, values));
    if (entry.isDirectory()) {
      copyTree(from, to, values);
      continue;
    }
    mkdirSync(dirname(to), { recursive: true });
    const buf = readFileSync(from);
    // Binary files (any NUL byte) are copied unchanged.
    writeFileSync(
      to,
      buf.includes(0) ? buf : substitute(buf.toString("utf8"), values),
    );
  }
}

function usage(msg) {
  if (msg) console.error(msg);
  console.error(
    `usage: new-app.mjs <${Object.keys(KINDS).join("|")}> <name> [--no-register]\n` +
      "  name: lowercase letters and digits, single dashes between parts (e.g. my-idea)",
  );
  process.exit(2);
}

function main(argv) {
  const flags = argv.filter((a) => a.startsWith("--"));
  const [kind, base, ...extra] = argv.filter((a) => !a.startsWith("--"));
  const unknown = flags.filter((f) => f !== "--no-register");
  if (unknown.length > 0) usage(`unknown option ${unknown.join(" ")}`);
  if (extra.length > 0) usage(`unexpected argument ${extra.join(" ")}`);
  if (!kind || !Object.hasOwn(KINDS, kind))
    usage(`unknown kind '${kind ?? ""}'`);
  if (!base || !NAME_RE.test(base)) usage(`invalid name '${base ?? ""}'`);

  const root = process.env.BB_ROOT ?? join(import.meta.dirname, "..");
  const values = placeholders(kind, base);
  const app = values.__NAME__;
  const parts = [
    {
      src: join(root, "templates", kind, "app"),
      dest: join(root, "apps", app),
    },
    {
      src: join(root, "templates", kind, "infra"),
      dest: join(root, "infra", "projects", app),
    },
  ];
  const rel = (p) => relative(root, p);

  // Check everything before writing anything.
  const missing = parts.filter((p) => !existsSync(p.src));
  for (const p of missing) console.error(`template ${rel(p.src)} not found`);
  const taken = parts.filter((p) => existsSync(p.dest));
  for (const p of taken) console.error(`${rel(p.dest)} already exists`);
  if (missing.length > 0 || taken.length > 0) process.exit(1);

  for (const p of parts) {
    copyTree(p.src, p.dest, values);
    console.log(`created ${rel(p.dest)}`);
  }
  if (flags.includes("--no-register")) return;

  const k = KINDS[kind];
  const steps = [
    ...k.register(app),
    ["pnpm", ["install", "--silent"]],
    [
      "pnpm",
      [
        "exec",
        "biome",
        "check",
        "--write",
        "--no-errors-on-unmatched",
        `apps/${app}`,
        `infra/projects/${app}`,
      ],
    ],
    ...k.format(app),
  ];
  for (const [cmd, args] of steps) {
    const res = spawnSync(cmd, args, { cwd: root, stdio: "inherit" });
    if (res.status !== 0) {
      console.error(`failed: ${cmd} ${args.join(" ")}`);
      console.error(
        `created: ${parts.map((p) => rel(p.dest)).join(", ")}; delete them to retry`,
      );
      process.exit(1);
    }
  }
}

if (import.meta.main) main(process.argv.slice(2));
