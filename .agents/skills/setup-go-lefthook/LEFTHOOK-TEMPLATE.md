# Lefthook Template

Use this template as the default shape, then adapt names and paths to the target repo.

## `lefthook.yml`

```yaml
glob_matcher: doublestar

pre-commit:
  parallel: false
  jobs:
    - name: gofmt-staged
      glob: "**/*.go"
      run: scripts/lefthook-gofmt.sh {staged_files}
      stage_fixed: true

    - name: go-vet-affected-packages
      glob: "**/*.go"
      run: scripts/lefthook-go-packages.sh vet {staged_files}

    - name: go-test-affected-packages
      glob: "**/*.go"
      run: scripts/lefthook-go-packages.sh test {staged_files}

pre-push:
  parallel: false
  jobs:
    - name: go-test-all
      run: go test ./...
```

## `scripts/lefthook-gofmt.sh`

```bash
#!/usr/bin/env bash

set -euo pipefail

if [ "$#" -eq 0 ]; then
  echo "lefthook: no staged Go files, skipping gofmt."
  exit 0
fi

gofmt -w "$@"
```

## `scripts/lefthook-go-packages.sh`

```bash
#!/usr/bin/env bash

set -euo pipefail

if [ "$#" -lt 2 ]; then
  echo "usage: $0 <vet|test> <go-files...>" >&2
  exit 1
fi

mode="$1"
shift

if [ "$mode" != "vet" ] && [ "$mode" != "test" ]; then
  echo "lefthook: unsupported mode: $mode" >&2
  exit 1
fi

packages=()
seen=""

for file in "$@"; do
  case "$file" in
    *.go) ;;
    *) continue ;;
  esac

  dir="$(dirname "$file")"
  pkg="."
  if [ "$dir" != "." ]; then
    pkg="./$dir"
  fi

  case " $seen " in
    *" $pkg "*) continue ;;
  esac

  seen="$seen $pkg"
  packages+=("$pkg")
done

if [ "${#packages[@]}" -eq 0 ]; then
  echo "lefthook: no affected Go packages, skipping go $mode."
  exit 0
fi

for pkg in "${packages[@]}"; do
  if [ "$mode" = "vet" ]; then
    echo "lefthook: go vet $pkg"
    go vet "$pkg"
  else
    echo "lefthook: go test $pkg"
    go test "$pkg"
  fi
done
```

## Existing task runner wiring

If the repo already has a `Makefile`, add:

```make
.PHONY: hooks-install hooks-run-pre-commit

hooks-install:
	@lefthook install

hooks-run-pre-commit:
	@lefthook run pre-commit
```

If the repo uses `Taskfile.yml` instead, add equivalent tasks there instead of creating a new `Makefile`.
