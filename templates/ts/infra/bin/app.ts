import { createProjectApp } from "@bluebelle/infra-common";
import { __PASCAL__Stack } from "../lib/stack.ts";

const { app, env, stage, stackName } = createProjectApp("__NAME__");

new __PASCAL__Stack(app, stackName(), { env, stage });
