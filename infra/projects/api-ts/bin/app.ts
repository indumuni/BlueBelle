import { createProjectApp } from "@bluebelle/infra-common";
import { ApiTsStack } from "../lib/stack.ts";

const { app, env, stage, stackName } = createProjectApp("api-ts");

new ApiTsStack(app, stackName(), { env, stage });
