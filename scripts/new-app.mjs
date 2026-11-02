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

/**
 * Per-kind naming, identifier and registration rules. `matches` is the app
 * folder pattern that the workspaces and just recipes glob on (apps/*-go,
 * apps/*-py, apps/web-*, apps/*-ts); `unregister` undoes `register` after the
 * folders are deleted. Kinds without `pkg` have no __PKG__ placeholder.
 */
export const KINDS = {
  go: {
    appName: (base) => `${base}-go`,
    matches: (app) => app.endsWith("-go"),
    pkg: (app) => app.replaceAll("-", ""),
    register: (app) => [["go", ["work", "use", `./apps/${app}`]]],
    unregister: (app) => [`go work edit -dropuse ./apps/${app}`],
    format: (app) => [["gofmt", ["-w", `apps/${app}`]]],
  },
  py: {
    appName: (base) => `${base}-py`,
    matches: (app) => app.endsWith("-py"),
    pkg: (app) => app.replaceAll("-", "_"),
    register: () => [["uv", ["sync", "--all-packages"]]],
    unregister: () => ["uv sync --all-packages"],
    format: (app) => [
      ["uv", ["run", "ruff", "check", "--fix", "--quiet", `apps/${app}`]],
      ["uv", ["run", "ruff", "format", "--quiet", `apps/${app}`]],
    ],
  },
  web: {
    appName: (base) => `web-${base}`,
    matches: (app) => app.startsWith("web-"),
    register: () => [],
    unregister: () => [],
    format: () => [],
  },
  ts: {
    appName: (base) => `${base}-ts`,
    matches: (app) => app.endsWith("-ts"),
    register: () => [],
    unregister: () => [],
    format: () => [],
  },
};

/** Other kinds whose folder pattern the app name would also match. */
export function clashingKinds(kind, base) {
  const app = KINDS[kind].appName(base);
  return Object.keys(KINDS).filter((k) => k !== kind && KINDS[k].matches(app));
}

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
    __PKG__: k.pkg?.(app),
    __PASCAL__: pascal(app),
  };
}

/** Replaces placeholders; throws if a template uses one this kind doesn't define. */
function substitute(text, values, where) {
  return text.replace(/__(NAME|BASE|PKG|PASCAL)__/g, (token) => {
    const value = values[token];
    if (!value)
      throw new Error(`${where} uses ${token}, which this kind doesn't define`);
    return value;
  });
}

/** Every file to write, as [destination, content], with placeholders replaced. */
function planTree(src, dest, values, rel) {
  const files = [];
  for (const entry of readdirSync(src, { withFileTypes: true })) {
    const from = join(src, entry.name);
    const to = join(dest, substitute(entry.name, values, rel(from)));
    if (entry.isDirectory()) {
      files.push(...planTree(from, to, values, rel));
      continue;
    }
    const buf = readFileSync(from);
    // Binary files (any NUL byte) are copied unchanged.
    files.push([
      to,
      buf.includes(0)
        ? buf
        : substitute(buf.toString("utf8"), values, rel(from)),
    ]);
  }
  return files;
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
  const clashes = clashingKinds(kind, base);
  if (clashes.length > 0) {
    usage(
      `invalid name '${base}': apps/${KINDS[kind].appName(base)} would also match the ` +
        `${clashes.join(", ")} naming rule and be picked up by that workspace`,
    );
  }

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

  // Substitute everything in memory first, so a template error writes nothing.
  let plans;
  try {
    plans = parts.map((p) => planTree(p.src, p.dest, values, rel));
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
  for (const [i, files] of plans.entries()) {
    for (const [to, content] of files) {
      mkdirSync(dirname(to), { recursive: true });
      writeFileSync(to, content);
    }
    console.log(`created ${rel(parts[i].dest)}`);
  }
  if (flags.includes("--no-register")) return;

  const k = KINDS[kind];
  // Exact commands that remove the app again, including what `register` changed.
  const undo = [
    `rm -rf ${parts.map((p) => rel(p.dest)).join(" ")}`,
    ...k.unregister(app),
    "pnpm install",
  ].join(" && ");
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
      console.error(
        `failed: ${cmd} ${args.join(" ")}${res.error ? ` (${res.error.message})` : ""}`,
      );
      console.error(`created: ${parts.map((p) => rel(p.dest)).join(", ")}`);
      console.error(`to undo and retry, run:\n  ${undo}`);
      process.exit(1);
    }
  }
}

if (import.meta.main) main(process.argv.slice(2));
