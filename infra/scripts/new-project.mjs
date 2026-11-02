#!/usr/bin/env node
// Scaffolds a standalone CDK app for one project: infra/projects/<name>
// (or infra/shared when name is "shared"). Usage: node new-project.mjs <name>
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const name = process.argv[2];
if (!name || !/^[a-z][a-z0-9-]*$/.test(name)) {
  console.error("usage: new-project.mjs <name>  (lowercase, digits, dashes)");
  process.exit(1);
}

const root = join(import.meta.dirname, "..");
const dir =
  name === "shared" ? join(root, "shared") : join(root, "projects", name);
if (existsSync(dir)) {
  console.error(`${dir} already exists`);
  process.exit(1);
}
const depth = name === "shared" ? "../.." : "../../..";
const pascal = name.replace(/(^|-)([a-z0-9])/g, (_, __, c) => c.toUpperCase());

const files = {
  "package.json": `${JSON.stringify(
    {
      name: `infra-${name}`,
      private: true,
      type: "module",
      scripts: { build: "tsc --noEmit", test: "vitest run" },
      dependencies: {
        "@bluebelle/infra-common": "workspace:*",
        "aws-cdk-lib": "2.275.0",
        constructs: "10.8.1",
      },
      devDependencies: {
        "@types/node": "^24.19.2",
        tsx: "^4.23.15",
        typescript: "^7.0.2",
        vitest: "^5.0.5",
      },
    },
    null,
    2,
  )}\n`,
  "cdk.json": `${JSON.stringify(
    { app: "pnpm exec tsx bin/app.ts", context: { stage: "dev" } },
    null,
    2,
  )}\n`,
  "tsconfig.json": `${JSON.stringify(
    {
      extends: `${depth}/tsconfig.base.json`,
      compilerOptions: {
        lib: ["ES2023"],
        types: ["node"],
        noEmit: true,
        allowImportingTsExtensions: true,
      },
      include: ["bin", "lib", "test"],
    },
    null,
    2,
  )}\n`,
  "bin/app.ts": `import { createProjectApp } from "@bluebelle/infra-common";
import { ${pascal}Stack } from "../lib/stack.ts";

const { app, env, stage, stackName } = createProjectApp("${name}");

new ${pascal}Stack(app, stackName(), { env, stage });
`,
  "lib/stack.ts": `import { Stack, type StackProps } from "aws-cdk-lib";
import type { Construct } from "constructs";

export interface ${pascal}StackProps extends StackProps {
  stage: string;
}

/** Infrastructure for ${name}. Build it from @bluebelle/infra-common constructs. */
export class ${pascal}Stack extends Stack {
  constructor(scope: Construct, id: string, props: ${pascal}StackProps) {
    super(scope, id, props);
  }
}
`,
  "test/stack.test.ts": `import { createProjectApp } from "@bluebelle/infra-common";
import { App } from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";
import { expect, test } from "vitest";
import { ${pascal}Stack } from "../lib/stack.ts";

test("synthesizes", () => {
  const { app, stage, stackName } = createProjectApp(
    "${name}",
    new App({ context: { "aws:cdk:bundling-stacks": [] } }),
  );
  const stack = new ${pascal}Stack(app, stackName(), { stage });
  expect(Template.fromStack(stack).toJSON()).toBeDefined();
});
`,
};

for (const [rel, content] of Object.entries(files)) {
  mkdirSync(join(dir, rel, ".."), { recursive: true });
  writeFileSync(join(dir, rel), content);
}
console.log(`created ${dir}`);
