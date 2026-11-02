import { createProjectApp } from "@bluebelle/infra-common";
import { SvcPyStack } from "../lib/stack.ts";

const { app, env, stage, stackName } = createProjectApp("svc-py");

new SvcPyStack(app, stackName(), { env, stage });
