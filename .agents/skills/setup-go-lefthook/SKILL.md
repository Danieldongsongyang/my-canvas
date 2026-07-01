---
name: setup-go-lefthook
description: Install a reusable Lefthook-based layered feedback loop for a Go backend repo.
disable-model-invocation: true
---

# Setup Go Lefthook

Install a tight, reusable Lefthook setup for a Go backend repository.

The goal is to leave the repo with:

- `pre-commit` running fast Go checks on staged changes
- `pre-push` running full Go tests
- a short local doc explaining the three check layers
- a minimal install/run entrypoint in the repo's existing task runner, if one already exists

This is a write-first skill, not a brainstorming skill. Explore the repo, adapt the templates to what is already there, write the files, then verify the wiring.

## Process

### 1. Explore the repo

Read the current repo before writing anything.

Check:

- `go.mod` at the repo root
- existing hook managers and configs: `lefthook.yml`, `.husky/`, `.pre-commit-config.yaml`, `.pre-commit-config.yml`, `.githooks/`
- existing task runners: `Makefile`, `makefile`, `Taskfile.yml`, `Justfile`
- existing docs locations: `docs/`, `README*`, `AGENTS.md`, `CLAUDE.md`
- existing scripts locations: `scripts/`, `hack/`, `bin/`
- whether the repo also contains frontend or packaging subprojects that should stay out of the Go hook path

Completion criterion:

- You know whether this is a Go backend repo worth configuring.
- You know whether another hook system already exists.
- You know the most natural place for helper scripts, docs, and install/run commands.

### 2. Reconcile existing hook tooling

Prefer `Lefthook`, but do not silently trample an existing non-trivial hook setup.

Rules:

- If the repo already uses `Lefthook`, update that setup in place.
- If the repo has only trivial or abandoned hook remnants, replace them only if the replacement is obviously safe.
- If the repo actively uses another hook manager with meaningful logic, stop and ask the user before migrating.

Completion criterion:

- The repo has one clear hook strategy, not competing hook systems.

### 3. Write the tight hook layer

Create or update the Lefthook files using the templates in:

- [LEFTHOOK-TEMPLATE.md](./LEFTHOOK-TEMPLATE.md)
- [DOC-TEMPLATE.md](./DOC-TEMPLATE.md)

Required output:

- `lefthook.yml`
- helper scripts for staged `gofmt` and affected-package `go vet` / `go test`
- a doc explaining `pre-commit`, manual local checks, and CI / release checks

Required behavior:

- `pre-commit` runs `gofmt` on staged `.go` files
- formatting fixes are re-staged
- `pre-commit` runs `go vet` on affected packages
- `pre-commit` runs `go test` on affected packages
- `pre-push` runs `go test ./...`

Adaptation rules:

- If the repo already has a conventional scripts directory, use it; otherwise create `scripts/`
- If the repo already has a docs directory, place the doc there; otherwise create `docs/`
- If a `Makefile` already exists, add install/run commands there
- If a `Taskfile.yml` exists and no `Makefile` exists, add equivalent tasks there
- Do not create both a `Makefile` and a `Taskfile.yml` from scratch just for this setup
- Keep shell scripts POSIX-friendly where reasonable, but prefer correctness over clever compactness

Completion criterion:

- All required hook, script, and doc files exist in the repo and match the repo's existing layout.

### 4. Install Lefthook entrypoints

Wire the repo so a developer can install and run the hooks with one obvious command path.

Preferred order:

1. Reuse existing repo task runner entrypoints
2. Otherwise document the direct `lefthook install` and `lefthook run pre-commit` commands

If the local machine already has `lefthook` available, install the hooks for the current clone. If it does not, do not invent a package-manager-specific install step in repo code; document the install command instead.

Completion criterion:

- The repo has a clear install command and a clear local run command.
- If `lefthook` is available locally, the current clone is installed too.

### 5. Verify the loop

Verify the setup instead of assuming it works.

Check:

- helper scripts are executable
- `lefthook.yml` is syntactically coherent
- the helper scripts behave sensibly when given zero staged files
- the affected-package script behaves sensibly when given real Go file paths
- if `lefthook` is available locally, run `lefthook run pre-commit` or the repo task wrapper

Do not "fix" unrelated pre-existing `go vet` or `go test` failures unless the user asked for that work. Report them as findings from the new loop.

Completion criterion:

- You have evidence that the hook wiring itself works.
- Any failures are clearly identified as repo-existing code issues or missing local dependencies, not hand-waved away.

### 6. Close out

Tell the user:

- what files were added or changed
- how to install the hooks in a fresh clone
- how to run the checks manually
- whether verification was fully completed
- any existing repo issues the new checks exposed

## Notes

- Keep the loop tight. Do not add Docker builds, integration environments, or full release logic to `pre-commit`.
- Preserve existing repo conventions over personal preference.
- Do not add Node-based hook tooling to a Go backend repo unless the repo already standardizes on it.
