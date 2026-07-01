# Doc Template

Use this as the default structure for the repo-local doc. Keep it short, operational, and concrete.

Suggested filename:

- `docs/lefthook-workflow.md`
- or another nearby docs path that matches the repo's existing conventions

## Structure

### 1. `pre-commit` light checks

Explain:

- where `lefthook.yml` lives
- which helper scripts it calls
- that `pre-commit` runs staged `gofmt`, affected-package `go vet`, and affected-package `go test`
- that formatting fixes are re-staged
- how to install hooks
- how to run the checks manually

### 2. Manual local checks

Explain that larger changes should also run:

```bash
go test ./...
go vet ./...
go build ./...
```

If the repo includes important frontend packaging or embedded assets, add the existing repo-specific build commands that should accompany backend changes.

### 3. CI / release checks

Explain that CI and release checks should cover the full path to shippable output, commonly:

```bash
go test ./...
go vet ./...
go build ./...
```

Then add repo-specific build or packaging checks already present in the repository, such as:

- frontend builds
- Docker builds
- release packaging

## Tone

- Keep the wording procedural, not theoretical
- Explain why the loop is layered: `pre-commit` is fast, `pre-push` is broader, CI/release is full
- Distinguish new hook behavior from pre-existing repo failures exposed by the new checks
