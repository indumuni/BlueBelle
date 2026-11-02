import { App, type Environment, Tags } from "aws-cdk-lib";

export interface ProjectApp {
  app: App;
  project: string;
  stage: string;
  /** Resolved from the active AWS profile; undefined → env-agnostic synth (e.g. CI). */
  env: Environment | undefined;
  /** bb-<project>-<stage>[-<part>] */
  stackName: (part?: string) => string;
}

/**
 * Creates the CDK App for one BlueBelle project (or `shared`): reads the stage
 * from context (`-c stage=<name>`, default `dev`), resolves the AWS env and
 * applies the standard tags to everything in the app.
 */
export function createProjectApp(
  project: string,
  app: App = new App(),
): ProjectApp {
  const stage: string = app.node.tryGetContext("stage") ?? "dev";
  const account = process.env.CDK_DEFAULT_ACCOUNT;
  const region = process.env.CDK_DEFAULT_REGION;
  const env = account && region ? { account, region } : undefined;

  applyStandardTags(app, project, stage);

  return {
    app,
    project,
    stage,
    env,
    stackName: (part) => ["bb", project, stage, part].filter(Boolean).join("-"),
  };
}

export function applyStandardTags(
  app: App,
  project: string,
  stage: string,
): void {
  Tags.of(app).add("Project", "BlueBelle");
  Tags.of(app).add("App", project);
  Tags.of(app).add("Stage", stage);
}
