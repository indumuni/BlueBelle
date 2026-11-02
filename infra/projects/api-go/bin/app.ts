import { createProjectApp } from "@bluebelle/infra-common";
import { ApiGoStack } from "../lib/stack.ts";

const { app, env, stage, stackName } = createProjectApp("api-go");

new ApiGoStack(app, stackName(), { env, stage });
