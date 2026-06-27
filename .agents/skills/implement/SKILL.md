---
name: implement
description: "Implement a piece of work based on a PRD or set of issues."
disable-model-invocation: true
---

Implement the work described by the user in the PRD or issues.

Use /tdd where possible, at pre-agreed seams.Regression tests must be written before the implementation. Do not retrofit tests after the code is already implemented.

Run typechecking regularly, single test files regularly, and the full test suite once at the end.

Once done, use /review to review the work.

Commit your work to the current branch.
