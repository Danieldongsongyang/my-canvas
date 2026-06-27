// Parallel Planner with Review — four-phase orchestration loop
//
// This template drives a multi-phase workflow:
//   Phase 1 (Plan):             An opus agent analyzes open issues, builds a
//                               dependency graph, and outputs a <plan> JSON
//                               listing unblocked issues with branch names.
//   Phase 2 (Execute + Review): For each issue, a sandbox is created via
//                               createSandbox(). The implementer runs first
//                               (100 iterations). If it produces commits, a
//                               reviewer runs in the same sandbox on the same
//                               branch (1 iteration). All issue pipelines run
//                               concurrently via Promise.allSettled().
//   Phase 3 (Merge):            A single agent merges all completed branches
//                               into the current branch.
//
// The outer loop repeats up to MAX_ITERATIONS times so that newly unblocked
// issues are picked up after each round of merges.
//
// Usage:
//   npx tsx .sandcastle/main.ts
// Or add to package.json:
//   "scripts": { "sandcastle": "npx tsx .sandcastle/main.ts" }

import * as sandcastle from "@ai-hero/sandcastle";
import { docker } from "@ai-hero/sandcastle/sandboxes/docker";
import { execFile } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

// The planner emits its plan as JSON inside <plan> tags; Output.object extracts
// and validates it against this schema. We use Zod here, but any Standard
// Schema validator works just as well — Valibot, ArkType, etc. See
// https://standardschema.dev.
const planSchema = z.object({
    issues: z.array(
        z.object({
            id: z.union([z.string(), z.number()]).transform((value) => String(value)),
            title: z.string(),
            branch: z.string(),
        }),
    ),
});

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

// Maximum number of plan→execute→merge cycles before stopping.
// Raise this if your backlog is large; lower it for a quick smoke-test run.
const MAX_ITERATIONS = 10;
const DEFAULT_CODEX_MODEL = process.env.SANDCASTLE_CODEX_MODEL ?? "gpt-5.4";
const IMPLEMENT_CODEX_MODEL = process.env.SANDCASTLE_IMPLEMENT_MODEL ?? DEFAULT_CODEX_MODEL;
const REVIEW_CODEX_MODEL = process.env.SANDCASTLE_REVIEW_MODEL ?? "gpt-5.5";
const REVIEW_CODEX_EFFORT = "xhigh";
const REPO_ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const WORKTREES_DIR = path.join(REPO_ROOT, ".sandcastle", "worktrees");
const CODEX_HOST_SESSIONS_DIR = path.join(REPO_ROOT, ".sandcastle", "codex-home", "sessions");
const CODEX_SANDBOX_SESSIONS_DIR = "/home/agent/workspace/.sandcastle/codex-home/sessions";

type WorktreeEntry = {
    path: string;
    branch?: string;
};

const git = (args: string[], cwd = REPO_ROOT): Promise<string> =>
    new Promise((resolve, reject) => {
        execFile("git", args, { cwd, maxBuffer: 1024 * 1024 * 10 }, (error, stdout, stderr) => {
            if (error) {
                reject(new Error(stderr.trim() || error.message));
                return;
            }

            resolve(stdout.trim());
        });
    });

const gitSucceeds = async (args: string[], cwd = REPO_ROOT) => {
    try {
        await git(args, cwd);
        return true;
    } catch {
        return false;
    }
};

const listWorktrees = async (): Promise<WorktreeEntry[]> => {
    const output = await git(["worktree", "list", "--porcelain"]);
    const entries: WorktreeEntry[] = [];
    let current: WorktreeEntry | undefined;

    for (const line of output.split("\n")) {
        if (line.startsWith("worktree ")) {
            if (current) {
                entries.push(current);
            }
            current = { path: line.slice("worktree ".length).trim() };
        } else if (current && line.startsWith("branch refs/heads/")) {
            current.branch = line.slice("branch refs/heads/".length).trim();
        }
    }

    if (current) {
        entries.push(current);
    }

    return entries;
};

const isManagedWorktreePath = (worktreePath: string) => {
    const relative = path.relative(WORKTREES_DIR, worktreePath);
    return relative.length > 0 && !relative.startsWith("..") && !path.isAbsolute(relative);
};

const ensureIssueBranchStartsFromCurrentHead = async (branch: string) => {
    const branchExists = await gitSucceeds(["show-ref", "--verify", "--quiet", `refs/heads/${branch}`]);
    if (!branchExists) {
        return;
    }

    const branchContainsCurrentHead = await gitSucceeds(["merge-base", "--is-ancestor", "HEAD", branch]);
    if (branchContainsCurrentHead) {
        return;
    }

    const branchIsAncestorOfCurrentHead = await gitSucceeds(["merge-base", "--is-ancestor", branch, "HEAD"]);
    if (!branchIsAncestorOfCurrentHead) {
        throw new Error(
            `Branch '${branch}' does not contain the current HEAD and has commits not merged here. ` +
                "Preserving it; merge/rebase it or choose a fresh branch before rerunning Sandcastle.",
        );
    }

    const worktree = (await listWorktrees()).find((entry) => entry.branch === branch);
    if (worktree) {
        if (!isManagedWorktreePath(worktree.path)) {
            throw new Error(`Branch '${branch}' is checked out outside .sandcastle/worktrees at ${worktree.path}.`);
        }

        const status = await git(["status", "--porcelain=v1", "--untracked-files=all"], worktree.path);
        if (status.length > 0) {
            throw new Error(`Branch '${branch}' has uncommitted changes in ${worktree.path}; preserving it.`);
        }

        console.log(`[preflight] Removing stale clean worktree for ${branch}: ${worktree.path}`);
        await git(["worktree", "remove", worktree.path]);
    }

    console.log(`[preflight] Removing stale local branch ${branch}; it is behind the current HEAD.`);
    await git(["branch", "-d", branch]);
};

type CodexEffort = "low" | "medium" | "high" | "xhigh";

const codexAgent = (model = DEFAULT_CODEX_MODEL, effort?: CodexEffort) =>
    sandcastle.codex(model, {
        effort,
        sessionStorage: {
            hostSessionsDir: CODEX_HOST_SESSIONS_DIR,
            sandboxSessionsDir: CODEX_SANDBOX_SESSIONS_DIR,
        },
    });

// Hooks run inside the sandbox before the agent starts each iteration.
// The frontend package lives in web/, so install dependencies there.
const hooks = {
    sandbox: { onSandboxReady: [{ command: "cd web && npm install --legacy-peer-deps --no-package-lock" }] },
};

// Copy node_modules from the host into the worktree before each sandbox
// starts. Avoids a full npm install from scratch; the hook above handles
// platform-specific binaries and any packages added since the last copy.
const copyToWorktree = ["web/node_modules"];

// ---------------------------------------------------------------------------
// Main loop
// ---------------------------------------------------------------------------

for (let iteration = 1; iteration <= MAX_ITERATIONS; iteration++) {
    console.log(`\n=== Iteration ${iteration}/${MAX_ITERATIONS} ===\n`);

    // -------------------------------------------------------------------------
    // Phase 1: Plan
    //
    // The planning agent (opus, for deeper reasoning) reads the open issue list,
    // builds a dependency graph, and selects the issues that can be worked in
    // parallel right now (i.e., no blocking dependencies on other open issues).
    //
    // It outputs a <plan> JSON block — Output.object parses and validates it.
    // -------------------------------------------------------------------------
    const plan = await sandcastle.run({
        hooks,
        sandbox: docker(),
        name: "planner",
        // One iteration is enough: the planner just needs to read and reason,
        // not write code. (Structured output requires maxIterations: 1.)
        maxIterations: 1,
        // Opus for planning: dependency analysis benefits from deeper reasoning.
        agent: codexAgent(),
        promptFile: "./.sandcastle/plan-prompt.md",
        // Extract and validate the <plan> JSON into a typed object. Throws
        // StructuredOutputError if the tag is missing, the JSON is malformed, or
        // validation fails — which aborts the loop.
        output: sandcastle.Output.object({ tag: "plan", schema: planSchema }),
    });

    const issues = plan.output.issues;

    if (issues.length === 0) {
        // No unblocked work — either everything is done or everything is blocked.
        console.log("No unblocked issues to work on. Exiting.");
        break;
    }

    console.log(`Planning complete. ${issues.length} issue(s) to work in parallel:`);
    for (const issue of issues) {
        console.log(`  ${issue.id}: ${issue.title} → ${issue.branch}`);
    }

    // -------------------------------------------------------------------------
    // Phase 2: Execute + Review
    //
    // For each issue, create a sandbox via createSandbox() so the implementer
    // and reviewer share the same sandbox instance per branch. The implementer
    // runs first; if it produces commits, the reviewer runs in the same sandbox.
    //
    // Promise.allSettled means one failing pipeline doesn't cancel the others.
    // -------------------------------------------------------------------------

    const settled = await Promise.allSettled(
        issues.map(async (issue) => {
            await ensureIssueBranchStartsFromCurrentHead(issue.branch);

            const sandbox = await sandcastle.createSandbox({
                branch: issue.branch,
                baseBranch: "HEAD",
                sandbox: docker(),
                hooks,
                copyToWorktree,
            });

            try {
                // Run the implementer
                const implement = await sandbox.run({
                    name: "implementer",
                    maxIterations: 100,
                    agent: codexAgent(IMPLEMENT_CODEX_MODEL),
                    promptFile: "./.sandcastle/implement-prompt.md",
                    promptArgs: {
                        TASK_ID: issue.id,
                        ISSUE_TITLE: issue.title,
                        BRANCH: issue.branch,
                    },
                });

                // Only review if the implementer produced commits
                if (implement.commits.length > 0) {
                    const review = await sandbox.run({
                        name: "reviewer",
                        maxIterations: 1,
                        agent: codexAgent(REVIEW_CODEX_MODEL, REVIEW_CODEX_EFFORT),
                        promptFile: "./.sandcastle/review-prompt.md",
                        promptArgs: {
                            BRANCH: issue.branch,
                        },
                    });

                    // Merge commits from both runs so the merge phase sees all of them.
                    // Each sandbox.run() only returns commits from its own run.
                    return {
                        ...review,
                        commits: [...implement.commits, ...review.commits],
                    };
                }

                return implement;
            } finally {
                await sandbox.close();
            }
        }),
    );

    // Log any agents that threw (network error, sandbox crash, etc.).
    for (const [i, outcome] of settled.entries()) {
        if (outcome.status === "rejected") {
            console.error(`  ✗ ${issues[i]!.id} (${issues[i]!.branch}) failed: ${outcome.reason}`);
        }
    }

    // Only pass branches that actually produced commits to the merge phase.
    // An agent that ran successfully but made no commits has nothing to merge.
    const completedIssues = settled
        .map((outcome, i) => ({ outcome, issue: issues[i]! }))
        .filter((entry) => entry.outcome.status === "fulfilled" && entry.outcome.value.commits.length > 0)
        .map((entry) => entry.issue);

    const completedBranches = completedIssues.map((i) => i.branch);

    console.log(`\nExecution complete. ${completedBranches.length} branch(es) with commits:`);
    for (const branch of completedBranches) {
        console.log(`  ${branch}`);
    }

    if (completedBranches.length === 0) {
        // All agents ran but none made commits — nothing to merge this cycle.
        console.log("No commits produced. Nothing to merge.");
        continue;
    }

    // -------------------------------------------------------------------------
    // Phase 3: Merge
    //
    // One agent merges all completed branches into the current branch,
    // resolving any conflicts and running tests to confirm everything works.
    //
    // The {{BRANCHES}} and {{ISSUES}} prompt arguments are lists that the agent
    // uses to know which branches to merge and which issues to close.
    // -------------------------------------------------------------------------
    await sandcastle.run({
        hooks,
        sandbox: docker(),
        name: "merger",
        maxIterations: 1,
        agent: codexAgent(),
        promptFile: "./.sandcastle/merge-prompt.md",
        promptArgs: {
            // A markdown list of branch names, one per line.
            BRANCHES: completedBranches.map((b) => `- ${b}`).join("\n"),
            // A markdown list of issue IDs and titles, one per line.
            ISSUES: completedIssues.map((i) => `- ${i.id}: ${i.title}`).join("\n"),
        },
    });

    console.log("\nBranches merged.");
}

console.log("\nAll done.");
