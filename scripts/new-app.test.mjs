// Tests for scripts/new-app.mjs. Run with: just test-scripts
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { placeholders } from "./new-app.mjs";

const script = join(import.meta.dirname, "new-app.mjs");
const TOKENS = "name=__NAME__ base=__BASE__ pkg=__PKG__ class=__PASCAL__Stack";

/** Temp repo root with fake token-bearing templates for every kind. */
function fakeRoot() {
  const root = mkdtempSync(join(tmpdir(), "bb-new-app-"));
  for (const kind of ["go", "py", "web", "ts"]) {
    for (const part of ["app", "infra"]) {
      const dir = join(root, "templates", kind, part, "src", "__PKG__");
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, "__BASE__.txt"), `${part}: ${TOKENS}\n`);
      writeFileSync(
        join(root, "templates", kind, part, "bin.dat"),
        Buffer.from([0, 95, 95, 78]),
      );
    }
  }
  return root;
}

function run(root, ...args) {
  return spawnSync("node", [script, ...args, "--no-register"], {
    env: { ...process.env, BB_ROOT: root },
    encoding: "utf8",
  });
}

/** Every file path and content under dir, for byte-identical comparisons. */
function snapshot(dir) {
  const out = {};
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else out[p] = readFileSync(p, "base64");
    }
  };
  walk(dir);
  return out;
}

function allText(dir) {
  return Object.entries(snapshot(dir))
    .map(([p, b64]) => `${p}\n${Buffer.from(b64, "base64").toString("utf8")}`)
    .join("\n");
}

test("success writes app and infra with every placeholder replaced", () => {
  const root = fakeRoot();
  const res = run(root, "go", "my-idea");
  assert.equal(res.status, 0, res.stderr);
  assert.match(res.stdout, /created apps\/my-idea-go/);
  assert.match(res.stdout, /created infra\/projects\/my-idea-go/);
  const file = join(
    root,
    "apps",
    "my-idea-go",
    "src",
    "myideago",
    "my-idea.txt",
  );
  assert.equal(
    readFileSync(file, "utf8"),
    "app: name=my-idea-go base=my-idea pkg=myideago class=MyIdeaGoStack\n",
  );
  const written = allText(join(root, "apps")) + allText(join(root, "infra"));
  assert.doesNotMatch(written, /__(NAME|BASE|PKG|PASCAL)__/);
});

test("binary files are copied unchanged", () => {
  const root = fakeRoot();
  assert.equal(run(root, "ts", "x").status, 0);
  const bin = readFileSync(join(root, "apps", "x-ts", "bin.dat"));
  assert.deepEqual([...bin], [0, 95, 95, 78]);
});

test("existing app folder: exit 1 and nothing written", () => {
  const root = fakeRoot();
  mkdirSync(join(root, "apps", "idea-py"), { recursive: true });
  const before = snapshot(root);
  const res = run(root, "py", "idea");
  assert.equal(res.status, 1);
  assert.match(res.stderr, /apps\/idea-py already exists/);
  assert.deepEqual(snapshot(root), before);
  assert.equal(existsSync(join(root, "infra", "projects", "idea-py")), false);
});

test("existing infra folder: exit 1 and nothing written", () => {
  const root = fakeRoot();
  mkdirSync(join(root, "infra", "projects", "web-idea"), { recursive: true });
  const before = snapshot(root);
  const res = run(root, "web", "idea");
  assert.equal(res.status, 1);
  assert.match(res.stderr, /infra\/projects\/web-idea already exists/);
  assert.deepEqual(snapshot(root), before);
});

test("invalid names exit 2", () => {
  const root = fakeRoot();
  for (const name of ["Bad_Name", "1abc", "abc-", "-abc", "a--b", ""]) {
    const res = run(root, "go", name);
    assert.equal(res.status, 2, `name '${name}'`);
    assert.match(res.stderr, /usage:/);
  }
  assert.equal(existsSync(join(root, "apps")), false);
});

test("valid names are accepted", () => {
  const root = fakeRoot();
  for (const name of ["a", "a1", "my-idea-2"]) {
    assert.equal(run(root, "ts", name).status, 0, `name '${name}'`);
  }
});

test("unknown kind exits 2", () => {
  const res = run(fakeRoot(), "rust", "idea");
  assert.equal(res.status, 2);
  assert.match(res.stderr, /unknown kind 'rust'/);
});

test("missing template exits 1 and writes nothing", () => {
  const root = mkdtempSync(join(tmpdir(), "bb-new-app-"));
  const res = run(root, "go", "idea");
  assert.equal(res.status, 1);
  assert.match(res.stderr, /template templates\/go\/app not found/);
  assert.deepEqual(readdirSync(root), []);
});

test("identifier placeholders per kind", () => {
  assert.equal(placeholders("go", "my-idea").__PKG__, "myideago");
  assert.equal(placeholders("py", "my-idea").__PKG__, "my_idea_py");
  assert.equal(placeholders("web", "my-idea").__NAME__, "web-my-idea");
  assert.equal(placeholders("web", "my-idea").__PASCAL__, "WebMyIdea");
  assert.equal(placeholders("ts", "my-idea").__PASCAL__, "MyIdeaTs");
});

test("long names are accepted and fully substituted", () => {
  const root = fakeRoot();
  const base = "a-very-long-project-name-for-checks";
  assert.equal(run(root, "py", base).status, 0);
  const file = join(
    root,
    "apps",
    `${base}-py`,
    "src",
    "a_very_long_project_name_for_checks_py",
    `${base}.txt`,
  );
  assert.match(
    readFileSync(file, "utf8"),
    /class=AVeryLongProjectNameForChecksPyStack/,
  );
});
