import { createProjectApp } from "@bluebelle/infra-common";
import { SharedStack } from "../lib/stack.ts";

const { app, env, stage, stackName } = createProjectApp("shared");

new SharedStack(app, stackName("network"), { env, stage });
