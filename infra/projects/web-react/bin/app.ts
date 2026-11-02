import { createProjectApp } from "@bluebelle/infra-common";
import { WebReactStack } from "../lib/stack.ts";

const { app, env, stage, stackName } = createProjectApp("web-react");

new WebReactStack(app, stackName(), { env, stage });
