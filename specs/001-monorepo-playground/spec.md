# Feature Specification: Polyglot Monorepo Playground

**Feature Branch**: `001-monorepo-playground` (retroactive; built on `main` in commits `8adc28b`, `7f0c27c`, `dc6409d`)

**Created**: 2026-11-02

**Status**: Implemented (retroactive spec)

**Input**: User description: "Create a spec for what we have done so far in the project. What we have done basically create a project as a playground for new projects with ability to create go, python, react, aws infrastructure"

## Overview

BlueBelle is a personal playground where a single developer can start new ideas quickly. One repository holds every experiment. A new app can be a Go service, a Python service or a React web UI. Each app can get its own cloud infrastructure, which the developer can create and delete without affecting other apps. The same few commands check, test and build everything. Every idea bigger than a quick spike starts as a written spec.

This spec documents the capabilities already delivered, so later features have a baseline to build on.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Set up the playground from a fresh clone (Priority: P1)

A developer clones the repository onto a new machine. One setup step installs the exact tool versions the project expects plus every dependency. Then one verification step checks, tests and builds every app in every language.

**Why this priority**: Nothing else works until the environment is reproducible. This is the foundation for every other story.

**Independent Test**: On a machine that has only the version manager installed, clone the repo, run setup, then run the combined lint/test/build step. All three succeed without any globally installed language toolchains.

**Acceptance Scenarios**:

1. **Given** a fresh clone and only the version manager installed, **When** the developer runs setup, **Then** the pinned versions of every language toolchain and helper tool are installed and all dependencies are resolved.
2. **Given** a completed setup, **When** the developer runs the combined lint, test and build commands, **Then** all of them pass for every existing app and shared infrastructure package.
3. **Given** a completed setup, **When** the developer lists the available commands, **Then** they see every lint, test, build, format, scaffold and infrastructure command in one place.

---

### User Story 2 - Start a new app in Go, Python or React (Priority: P1)

A developer has a new idea. They run one scaffold command with a name and choose the kind of app: a Go service, a Python service or a React web UI. They get a working, runnable app that the project-wide lint, test and build commands pick up automatically.

**Why this priority**: Quick starts are the reason the playground exists.

**Independent Test**: Run each scaffold command with a new name. Confirm that the app is created at the expected location, that it runs, and that the project-wide lint, test and build still pass with the new app included.

**Acceptance Scenarios**:

1. **Given** a set-up repository, **When** the developer scaffolds a Go app named `idea`, **Then** a runnable Go app appears at `apps/idea-go` and is registered with the workspace.
2. **Given** a set-up repository, **When** the developer scaffolds a Python app named `idea`, **Then** a Python package with a tests folder appears at `apps/idea-py` and is registered with the workspace.
3. **Given** a set-up repository, **When** the developer scaffolds a web app named `idea`, **Then** a copy of the reference web app appears at `apps/web-idea` under its own name, with working tests.
4. **Given** any newly scaffolded app, **When** the developer runs the project-wide lint, test and build commands, **Then** the new app is included without editing any command definitions.

---

### User Story 3 - Give an app its own cloud infrastructure (Priority: P2)

A developer wants to put an app online. They scaffold an infrastructure project with the same name as the app and assemble it from reusable building blocks: a network, a static website host, and an HTTP service host for an unmodified Go or Python server. They can preview, deploy and destroy that project's resources for a chosen stage without touching any other project.

**Why this priority**: Deploying matters, but most experiments start locally. Story 3 builds on Stories 1 and 2.

**Independent Test**: Scaffold infra for an app, synthesize it and preview the diff. With approval, deploy it to a `dev` stage, check that the app is reachable, then destroy it. Confirm that other projects' resources are unchanged throughout.

**Acceptance Scenarios**:

1. **Given** an app named `idea`, **When** the developer scaffolds infra named `idea`, **Then** an empty infrastructure project appears that can be deployed on its own and is listed among the infra targets.
2. **Given** an infrastructure project, **When** the developer synthesizes or previews it, **Then** they see the resources that would be created, and nothing changes in the cloud.
3. **Given** an infrastructure project, **When** the developer deploys it to a stage, **Then** only that project's resources are created or updated. Their names include the project and the stage, and they are tagged with project, app and stage.
4. **Given** a deployed project, **When** the developer destroys it, **Then** all of that project's resources are removed and every other project and the shared resources are untouched.
5. **Given** resources that should exist only once per stage (for example the network), **When** a project needs them, **Then** it finds them by lookup and never depends directly on another project's resources.

---

### User Story 4 - Start every idea from a spec (Priority: P2)

A developer describes an idea in plain language. A guided flow turns it into a spec, clarifying questions, a plan that picks languages and locations, a task list and an implementation. The project's principles are written down and every plan is checked against them.

**Why this priority**: It keeps experiments deliberate and documented, but the playground still works without it.

**Independent Test**: Run the specify step with a short idea. Confirm that a numbered spec folder is created from the project's template and that the plan template uses the monorepo layout.

**Acceptance Scenarios**:

1. **Given** the repository, **When** the developer runs the specify step with an idea, **Then** a sequentially numbered spec folder is created with a spec built from the template.
2. **Given** a spec, **When** the developer runs the plan step, **Then** the plan must state each app or package it touches, the language, and a justification, and must include a check against the constitution.

---

### User Story 5 - Keep the project healthy automatically (Priority: P3)

On every push or pull request, automated checks lint, test and build each language. Infrastructure is synthesized without cloud credentials, and every commit is checked for real-person authorship.

**Why this priority**: It is a safety net. Local commands already cover the core loop.

**Independent Test**: Open a pull request that touches one language's app and confirm that only the relevant checks run and pass. Push a commit whose message has an AI co-author line and confirm that it is rejected both locally and in CI.

**Acceptance Scenarios**:

1. **Given** a change to a Go, Python, web or infra path, **When** it is pushed or opened as a pull request, **Then** that area's lint, test and build (or synthesize) checks run and must pass.
2. **Given** a commit message with an AI co-author or "Generated with" line, **When** the developer tries to commit, **Then** the local hook rejects it, and the CI authorship check fails if it reaches the remote anyway.
3. **Given** the CI environment, **When** infrastructure checks run, **Then** no cloud credentials are used or stored.

---

### Edge Cases

- **Name collision when scaffolding**: if an app or infra project with that name already exists, the scaffold must not silently overwrite it.
- **Reference web app missing**: if the web template app has been deleted, web scaffolding fails with a clear message instead of creating a broken app.
- **Language with no projects**: if a language has no apps or packages (for example all Python apps were deleted), its test command reports "nothing to test" and succeeds.
- **Unknown infra target**: previewing or deploying an unknown target fails with a message that points to the list of valid targets.
- **Shared resources missing**: deploying a project that looks up shared resources before they are deployed fails clearly. The shared stack is deployed first and destroyed last.
- **Deleting an app**: removing an app's folder and its workspace entry leaves the rest of the repository passing lint, test and build, because no app imports from another.
- **Tool not on PATH**: if pinned tools are not active in the shell, the developer is told how to activate them.

## Requirements *(mandatory)*

### Functional Requirements

**Environment & command surface**

- **FR-001**: The repository MUST pin an exact version of every language toolchain and helper tool, and MUST install them, plus all dependencies, with a single setup command.
- **FR-002**: The repository MUST provide one command entry point that offers lint, format, test and build across all languages, plus per-language variants.
- **FR-003**: Project-wide lint, test and build MUST pass from a clean checkout after setup.
- **FR-004**: Setup MUST enable the repository's local git hooks.

**App scaffolding**

- **FR-005**: The developer MUST be able to scaffold a Go service, a Python service or a React web UI with one command and a name.
- **FR-006**: Scaffolded apps MUST follow fixed naming and location rules (`apps/<name>-go`, `apps/<name>-py`, `apps/web-<name>`) so that project-wide commands discover them without manual edits.
- **FR-007**: The repository MUST include one working reference app per kind (Go, Python, web), each with at least one passing test. The reference web app also serves as the template for new web apps.
- **FR-008**: Apps MUST NOT depend on other apps. Shared code MUST live in a per-language shared-libraries area, and interfaces that cross languages MUST be defined in a shared contracts area.

**Infrastructure**

- **FR-009**: Each app MUST be able to have its own infrastructure project, with the same name as the app, that is deployed and destroyed independently of every other project.
- **FR-010**: The developer MUST be able to list infra targets, and to synthesize, preview, deploy and destroy any target for a named stage. The default stage is `dev`.
- **FR-011**: The repository MUST provide reusable, tested infrastructure building blocks: a standard app setup (stage, naming, tagging), a low-cost network, a lookup for the shared network, a static website host with single-page-app fallback, and an HTTP service host that runs an unmodified Go or Python server without containers.
- **FR-012**: Resources needed only once per stage MUST live in a separate shared target. Projects MAY look them up but MUST NOT reference another project's resources.
- **FR-013**: Every deployed resource MUST be tagged with project, app and stage, and stack names MUST include both project and stage.
- **FR-014**: Every infrastructure project MUST be fully destroyable.
- **FR-015**: Deploy, destroy and account bootstrap operations MUST run only from the developer's machine, with explicit approval. CI MUST NOT hold cloud credentials.
- **FR-016**: The developer MUST be able to scaffold an empty, independently deployable infrastructure project with one command.

**Spec-driven workflow & governance**

- **FR-017**: The repository MUST include a written constitution that covers language choice, contracts, testing, the single command surface, disposability, infrastructure rules and commit authorship.
- **FR-018**: The repository MUST provide a guided specify → clarify → plan → tasks → implement flow that creates sequentially numbered spec folders and uses a plan template adapted to the monorepo layout.

**Automated checks & authorship**

- **FR-019**: CI MUST run each language's lint, test and build checks, scoped to changes in that language's paths. It MUST also synthesize every infra target.
- **FR-020**: Commits MUST be authored by a real person. AI co-author trailers and "Generated with" lines MUST be rejected by a local hook and by CI, and both MUST use the same check.
- **FR-021**: Secrets and account-identifying data MUST NOT be committed. Local configuration uses ignored files plus a committed example.

### Key Entities

- **App**: one experiment of a single kind (Go service, Python service or web UI). It has a name and a fixed location, and it can be deleted on its own.
- **Shared Library**: reusable code for one language that apps may import.
- **Contract**: the definition of an interface between components written in different languages.
- **Infrastructure Project**: the cloud resources for one app, named after it. Created and destroyed independently for each stage.
- **Shared Infrastructure**: resources deployed once per stage (currently the network). Projects look them up and never own them.
- **Stage**: a named environment (for example `dev` or `prod`). It scopes resource names and tags.
- **Spec (Feature)**: a numbered folder with the spec, plan and tasks for one idea.
- **Constitution**: the versioned project principles that every plan is checked against.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: From a fresh clone with only the version manager installed, a developer reaches a fully passing lint, test and build in under 15 minutes with no manual tool installation.
- **SC-002**: A new, runnable app of any of the three kinds can be created in under 1 minute with a single command, and project-wide checks pass with it included on the first try.
- **SC-003**: Any single app, including its infrastructure, can be removed by deleting at most two folders and one workspace entry, and all remaining checks still pass.
- **SC-004**: Deploying or destroying one infrastructure project changes 0 resources that belong to other projects.
- **SC-005**: An idle `dev` stage with the default building blocks costs under $5/month. The network adds no fixed cost by default.
- **SC-006**: 100% of commits containing AI attribution lines are rejected, and CI holds 0 cloud credentials.
- **SC-007**: Each reference app has at least one automated test, and every infrastructure building block and project has automated assertions.

## Assumptions

- There is a single developer (the repository owner) on macOS or Linux, with a personal cloud account and local credentials.
- A single cloud provider is used. Multi-cloud is out of scope.
- The reference apps are smoke tests for the tooling, not products. They may be deleted, except that the web reference app is kept as the web scaffold template.
- No cross-language contracts or shared libraries exist yet. The areas exist and the rules apply once they are needed.
- Throwaway spikes (less than a day) may skip a spec, as the constitution allows.
- This spec is retroactive. It describes what was built, and no new implementation is expected from it. Future features reference it as the baseline.
- Name-collision protection during scaffolding (Edge Cases) is required behavior. If the current scaffolds don't fully enforce it, that becomes follow-up work, which `/speckit-converge` can find.
