# Feature Specification: App Templates

**Feature Branch**: `002-app-templates`

**Created**: 2026-11-02

**Status**: Draft

**Input**: User description: "just new-* command allow to create go, react, python projects. Only react project uses apps/web-react as template project but not the rest of the projects. I need to create a templates project that will use as a template when just new-<> create project. This should include the aws cloud project and add a new typescript backend project."

**Builds on**: [001-monorepo-playground](../001-monorepo-playground/spec.md). Extends FR-005 (three app kinds) and FR-007 (reference apps; the web reference app doubles as its template). Closes the known gap that web scaffolding overwrites an existing app.

## Overview

Today each kind of app is created in a different way: one is generated from scratch, one by a third-party initializer, and one by copying a sample app. None of them creates cloud infrastructure, and there is no way to start a TypeScript backend.

This feature adds one dedicated set of templates: Go service, Python service, React web UI, and a new TypeScript backend, each paired with a matching cloud infrastructure template. One command per kind creates both the app and its infrastructure from those templates.

## Clarifications

### Session 2026-11-02

- Q: Should creating an app also create its infrastructure? → A: Always. One command creates the app and its matching infrastructure project.
- Q: What happens to the existing sample apps? → A: Delete them and their infrastructure, then regenerate them from the new templates, plus one new TypeScript backend sample.
- Q: Which HTTP framework should the TypeScript backend use? → A: A small, standards-based framework that can be tested without starting a server (the plan records the choice).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Create a new app of any kind from a template (Priority: P1)

A developer runs one command with a name and chooses one of four kinds: Go service, Python service, React web UI or TypeScript backend. They get a runnable app built from that kind's template. Backends expose a health endpoint, the web UI renders a starter page, each app has at least one passing test, and project-wide checks pick the app up automatically.

**Why this priority**: Consistent, template-driven scaffolding is the core of the request. Adding the TypeScript backend completes the set of app kinds the constitution already allows.

**Independent Test**: Run the command once for each of the four kinds with a new name. Each app runs, its health check or starter page works, and project-wide lint, test and build pass with all four included.

**Acceptance Scenarios**:

1. **Given** a set-up repository, **When** the developer creates a Go app named `idea`, **Then** a runnable Go service is created from the Go template. It answers its health endpoint with an OK status and has a passing test.
2. **Given** a set-up repository, **When** the developer creates a Python app named `idea`, **Then** a runnable Python service is created from the Python template, with a health endpoint and a passing test.
3. **Given** a set-up repository, **When** the developer creates a web app named `idea`, **Then** a web UI is created from the web template, carries its own name and has a passing test.
4. **Given** a set-up repository, **When** the developer creates a TypeScript backend named `idea`, **Then** a runnable TypeScript service is created from the TypeScript template, with a health endpoint and a passing test.
5. **Given** any newly created app, **When** the developer runs project-wide lint, test and build, **Then** they pass without any manual edits.

---

### User Story 2 - Get matching cloud infrastructure with every app (Priority: P1)

When the developer creates an app, the same command also creates that app's cloud infrastructure project from the kind's infrastructure template. Backends get a pay-per-use HTTP service host, and the web UI gets a static website host. The infrastructure project can be previewed, deployed and destroyed independently.

**Why this priority**: The user asked for the cloud project to be part of the template, and an app that can be deployed in one step is the point of the playground.

**Independent Test**: Create one app of each kind. Each has an infrastructure project with the same name that synthesizes without cloud credentials. With approval, one can be deployed, its endpoint answers, and it can then be destroyed.

**Acceptance Scenarios**:

1. **Given** a newly created backend app, **When** the developer synthesizes its infrastructure project, **Then** it describes an HTTP service that runs the unmodified app, with no manual edits.
2. **Given** a newly created web app, **When** the developer synthesizes its infrastructure project, **Then** it describes a static website host that serves the built app.
3. **Given** a deployed backend app, **When** the developer calls its public health endpoint, **Then** it answers with an OK status.
4. **Given** any created app, **When** the developer destroys its infrastructure, **Then** only that app's resources are removed.

---

### User Story 3 - Maintain templates in one place (Priority: P2)

All templates live in one dedicated location, separate from the apps. To change what new apps look like, the developer edits a template. Automated checks build a throwaway app from every template and prove that it still passes all checks, so the templates cannot rot silently.

**Why this priority**: It keeps scaffolding consistent over time, but the first scaffolds already deliver value without it.

**Independent Test**: Change a template, for example by adding a route. A newly created app includes the change. Break a template on purpose and confirm the automated template check fails.

**Acceptance Scenarios**:

1. **Given** the templates location, **When** the developer looks at it, **Then** there is exactly one app template and one infrastructure template per kind, and nothing there is treated as an app by project-wide commands.
2. **Given** a change to any template or to the scaffolding logic, **When** it is pushed or opened as a pull request, **Then** an automated check creates an app of every kind and runs lint, test, build and infrastructure synthesis on them.
3. **Given** a broken template, **When** the automated check runs, **Then** it fails and names the kind that broke.

---

### User Story 4 - Sample apps generated from the templates (Priority: P3)

The existing sample apps are removed and regenerated with the new commands: a Go service, a Python service, a web UI and a new TypeScript backend, each with its infrastructure. The samples are then real template output and serve as working examples.

**Why this priority**: It proves the templates end to end and removes hand-written drift, but it is cleanup once Stories 1–3 work.

**Independent Test**: After regeneration, every sample's files match a fresh scaffold of the same name (ignoring lockfiles and build output), and all project checks pass.

**Acceptance Scenarios**:

1. **Given** the regenerated samples, **When** the developer compares one with a fresh scaffold of the same kind and name, **Then** they are identical apart from dependency lockfiles and build output.
2. **Given** the regenerated samples, **When** the developer runs project-wide lint, test, build and infrastructure synthesis, **Then** everything passes.

---

### Edge Cases

- **Name already in use**: if either the app folder or its infrastructure folder already exists, the command refuses, names the conflict and writes nothing at all. It must not create a half-made app.
- **Invalid name**: names that are not lowercase letters, digits and dashes, or that don't start with a letter, are rejected with a usage message before anything is written.
- **Names that aren't valid identifiers**: a name with dashes (for example `my-idea`) still produces valid package or module identifiers in every language.
- **Missing template**: if a kind's template is missing, the command fails clearly and writes nothing.
- **Registration fails** (for example dependency install fails): the command reports the failure and says which files were created so the developer can delete them.
- **Deleting a created app**: removing the app folder, its infrastructure folder and its workspace entry leaves every remaining check passing.

## Requirements *(mandatory)*

### Functional Requirements

**Templates**

- **FR-001**: The repository MUST contain one dedicated templates location with an app template and an infrastructure template for each of the four kinds: Go service, Python service, web UI and TypeScript backend.
- **FR-002**: Templates MUST NOT be treated as apps. Project-wide lint, test, build and infrastructure listing MUST ignore the templates location.
- **FR-003**: Templates MUST use placeholders for every name-dependent value (folder names, package or module identifiers, stack class names, display names). Placeholders MUST be replaced with forms of the chosen name that are valid in each language.
- **FR-004**: Every backend template MUST expose a health endpoint that returns an OK status, and the same health interface MUST hold across all backend kinds.
- **FR-005**: Every app template MUST include at least one automated test. Every infrastructure template MUST include at least one automated assertion.

**Scaffolding commands**

- **FR-006**: The developer MUST be able to create an app of each kind with one command per kind and a name. This adds a TypeScript backend command alongside the existing Go, Python and web commands.
- **FR-007**: Each command MUST create the app **and** its matching infrastructure project, using the existing naming rules for apps and the app folder name for the infrastructure project.
- **FR-008**: Each command MUST validate the name, and check that neither the app nor its infrastructure folder exists, **before** writing anything. On any refusal it MUST write nothing.
- **FR-009**: Each command MUST register the new app with its language workspace and install dependencies, so that project-wide checks include it right away.
- **FR-010**: The existing command for creating an empty infrastructure project MUST keep working for stacks that don't belong to an app, including the shared target.

**Infrastructure building blocks**

- **FR-011**: The shared HTTP-service hosting building block MUST also support TypeScript backends, running the unmodified server as the Go and Python backends already do, without containers.

**Samples, checks and docs**

- **FR-012**: The existing sample apps and their infrastructure MUST be replaced by apps generated with the new commands: one Go service, one Python service, one web UI and one TypeScript backend.
- **FR-013**: An automated check MUST run whenever templates, the scaffolding logic or the shared infrastructure building blocks change. It creates an app of every kind and runs lint, test, build and infrastructure synthesis on them.
- **FR-014**: Project docs (readme, agent guide, infrastructure guide) and the constitution's layout table MUST describe the templates location, the four commands and the fact that each command also creates infrastructure.

### Key Entities

- **Kind**: one of Go service, Python service, web UI or TypeScript backend. It decides the app naming rule, the templates and the infrastructure type.
- **App Template**: the source files for one kind's app, with placeholders.
- **Infrastructure Template**: the source files for one kind's infrastructure project, with placeholders. It is paired with the app template of the same kind.
- **Placeholder**: a token in template paths or contents that is replaced with a form of the chosen name (folder name, base name, identifier, PascalCase class name).
- **Scaffolded App**: an app produced from an app template. It is registered with its workspace and paired with one infrastructure project of the same name.
- **Infrastructure Project**: the independently deployable cloud resources for one scaffolded app.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Creating an app plus its infrastructure takes one command and finishes in under 1 minute on a set-up machine (excluding first-time dependency downloads).
- **SC-002**: 4 of 4 kinds produce apps that pass lint, test, build and infrastructure synthesis with 0 manual edits.
- **SC-003**: 100% of refused commands (name in use, invalid name, missing template) leave the working tree unchanged.
- **SC-004**: Each kind has exactly one app template and one infrastructure template, so changing what a kind generates touches a single location.
- **SC-005**: Every change to templates or scaffolding is checked automatically before merge, and a broken template is caught in 100% of cases by the template check.
- **SC-006**: An idle deployed backend or web app costs under $1/month (pay-per-use only, no always-on resources).

## Assumptions

- Naming follows the existing rules: Go apps `<name>-go`, Python apps `<name>-py`, web apps `web-<name>`, TypeScript backends `<name>-ts`. Infrastructure projects use the app folder name.
- The regenerated samples are named `api-go`, `svc-py`, `web-react` and `api-ts`, so existing docs and commands mostly keep working.
- The TypeScript backend serves HTTP only, with no database or auth. It is a starting point like the other backends.
- Templates include only the minimum: a health endpoint (or starter page), one test and infrastructure. Optional extras such as databases, auth or queues are out of scope.
- Deploying samples to the cloud is not required to complete this feature. Synthesis is enough; deployment happens only with the user's explicit approval.
- The constitution change (adding the templates location) is a MINOR amendment, made through the constitution workflow.
