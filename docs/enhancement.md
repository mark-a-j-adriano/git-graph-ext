# Tiny Internal VS Code Extension for Git Worktrees

## Goal

Build a small, auditable internal VS Code extension that helps manage Git worktrees without adding unnecessary trust surface.

The extension should do only a few things well:

- list worktrees
- create a new worktree from an existing branch
- create a new worktree with a new branch
- remove a worktree
- open a worktree in a new VS Code window
- prune stale worktree metadata

Everything else is optional and should be treated as later work.

---

## Principles

- Keep the codebase small enough to audit quickly.
- No network access, telemetry, analytics, or external services.
- No AI features.
- No automatic destructive actions.
- No hidden background processes.
- Use plain Git CLI commands underneath.
- Prefer explicit prompts before any write/delete action.
- Favor predictable UX over cleverness.

---

## Scope for MVP

### Include

- Command Palette commands
- Minimal Git wrapper
- Worktree listing
- Worktree creation
- Worktree removal
- Open selected worktree in new window
- Simple error messages
- Basic validation
- Sidebar tree view only if it stays small and clean

### Exclude

- GitHub/GitLab integration
- Branch issue-name generation
- Auto-detection of ticket IDs
- Fancy dashboards
- Bulk operations
- Automatic cleanup
- Remote branch orchestration
- Workspace templating
- Status decorations for ahead/behind/dirty unless trivial

---

## Recommended Tech Stack

- TypeScript
- VS Code Extension API
- Node `child_process.execFile`
- Git CLI using `git worktree ...`
- Use `git worktree list --porcelain` for parsing
- Use `git branch --format=...` where branch enumeration is needed

Do not rely on shell string concatenation when arguments can be passed directly.

---

## Proposed File Structure

```text
worktree-helper/
  package.json
  tsconfig.json
  src/
    extension.ts
    commands.ts
    git.ts
    worktree.ts
    validation.ts
    ui.ts
    treeDataProvider.ts
```

### File responsibilities

- `extension.ts`
  Activation and command registration.

- `commands.ts`
  Command handlers for list/create/remove/open/prune.

- `git.ts`
  Safe wrapper around Git execution.

- `worktree.ts`
  Types and parsing logic for worktree data.

- `validation.ts`
  Input validation for branch names and target paths.

- `ui.ts`
  Shared QuickPick/InputBox helpers.

- `treeDataProvider.ts`
  Optional sidebar tree provider.

---

## Plan of Attack

## Phase 1: Bootstrap the extension

### To-do

- [ ] Scaffold VS Code extension in TypeScript
- [ ] Set up `package.json` contribution points
- [ ] Add commands:
  - [ ] `worktree.list`
  - [ ] `worktree.create`
  - [ ] `worktree.createNewBranch`
  - [ ] `worktree.remove`
  - [ ] `worktree.open`
  - [ ] `worktree.prune`
- [ ] Confirm extension activates only when needed
- [ ] Verify it runs in Extension Development Host

### Notes

Start with Command Palette only. Do not build sidebar UI first.

---

## Phase 2: Build safe Git execution layer

### To-do

- [ ] Implement `execFile`-based Git wrapper
- [ ] Require explicit repo root for every operation
- [ ] Capture stdout/stderr cleanly
- [ ] Normalize errors into user-friendly messages
- [ ] Handle missing Git executable
- [ ] Handle non-repo folders
- [ ] Add timeout handling for Git commands if needed

### Rules

- Never use `exec` with interpolated shell strings
- Never pass unchecked user input into shell commands
- Always pass arguments as an array

---

## Phase 3: Detect repository context

### To-do

- [ ] Determine active workspace folder
- [ ] Resolve repo root with `git rev-parse --show-toplevel`
- [ ] Handle multi-root workspaces explicitly
- [ ] If multiple repos are open, let user choose target repo
- [ ] Fail clearly when no Git repo is found

### Decision

Do not guess repo context if ambiguous.

---

## Phase 4: Worktree listing

### To-do

- [ ] Run `git worktree list --porcelain`
- [ ] Parse output into typed objects
- [ ] Include:
  - [ ] path
  - [ ] HEAD commit
  - [ ] branch, if present
  - [ ] detached state
  - [ ] bare state if relevant
  - [ ] locked/prunable info if present
- [ ] Show list in QuickPick
- [ ] Display current worktree clearly

### Example Git command

```bash
git worktree list --porcelain
```

### Success criteria

The user can inspect all known worktrees without touching the terminal.

---

## Phase 5: Create worktree

### To-do for existing branch flow

- [ ] Ask user to choose base repo
- [ ] Ask user to choose branch
- [ ] Ask user for target folder
- [ ] Validate target folder does not already exist in unsafe way
- [ ] Run `git worktree add <path> <branch>`
- [ ] Refresh UI after success
- [ ] Offer to open in new VS Code window

### To-do for new branch flow

- [ ] Ask user for new branch name
- [ ] Ask user for start point, default `main`
- [ ] Ask user for target folder
- [ ] Validate branch name
- [ ] Run `git worktree add -b <branch> <path> <start-point>`
- [ ] Refresh UI after success
- [ ] Offer to open in new VS Code window

### Validation rules

- Branch name must be non-empty
- Reject obviously invalid Git branch names
- Path must be explicit and visible to user
- Destructive overwrite must never be automatic

---

## Phase 6: Remove worktree

### To-do

- [ ] Let user pick a worktree from list
- [ ] Prevent removing the currently open worktree unless explicitly supported
- [ ] Confirm removal with a strong confirmation prompt
- [ ] Run `git worktree remove <path>`
- [ ] Show stderr clearly if Git refuses due to dirty state
- [ ] Refresh list after success
- [ ] Optionally ask whether user also wants to delete the branch later, but keep that separate from MVP

### Important

Do not manually delete folders. Let Git own the removal flow.

---

## Phase 7: Open worktree in new window

### To-do

- [ ] Add command to choose worktree
- [ ] Open selected folder in new VS Code window
- [ ] Verify cross-platform behavior
- [ ] Consider optional “add to workspace” later, not in MVP

### Goal

Fast context switching without terminal or file explorer.

---

## Phase 8: Prune stale metadata

### To-do

- [ ] Add `git worktree prune`
- [ ] Confirm action if needed
- [ ] Show summary message after prune
- [ ] Refresh worktree list

### Note

This is useful cleanup, but it should remain simple.

---

## Optional Phase 9: Sidebar tree view

Only do this after the command flow is solid.

### To-do

- [ ] Implement `TreeDataProvider`
- [ ] Show repo as parent node
- [ ] Show worktrees as child nodes
- [ ] Add context actions:
  - [ ] open
  - [ ] remove
  - [ ] refresh
- [ ] Keep labels minimal and readable

### Warning

Do not let sidebar work delay the MVP.

---

## Error Cases to Handle

- [ ] Git not installed
- [ ] Folder is not a Git repo
- [ ] No workspace open
- [ ] Multiple workspace folders and no clear repo target
- [ ] Branch already checked out in another worktree
- [ ] Invalid branch name
- [ ] Target path already exists
- [ ] Worktree has uncommitted changes and cannot be removed
- [ ] Detached HEAD worktree
- [ ] Git command exits non-zero with useful stderr
- [ ] Permissions issues on filesystem
- [ ] Windows path quirks

---

## Security Constraints

These are non-negotiable.

- [ ] No telemetry
- [ ] No HTTP requests
- [ ] No external API calls
- [ ] No dynamic code execution
- [ ] No bundling of unnecessary dependencies
- [ ] No shell interpolation with raw user input
- [ ] No silent deletion
- [ ] No auto-run behavior on startup beyond registration
- [ ] Keep dependency count minimal

---

## UX Rules

- [ ] Every write/delete action should be explicit
- [ ] Messages should be direct and specific
- [ ] Avoid vague “something went wrong” errors
- [ ] Show exact Git failure reason when safe
- [ ] Keep prompts short
- [ ] Default to sane values where possible
- [ ] Do not hide actual target paths from the user

---

## Suggested MVP Command Flow

### Create new worktree with new branch

1. User runs `Worktree: Create New Branch`
2. Extension selects repo or asks user to choose
3. User enters branch name
4. User enters target folder path
5. Extension runs:
   ```bash
   git worktree add -b <branch> <path> main
   ```
6. Extension shows success
7. Extension offers to open folder in new window

### Remove worktree

1. User runs `Worktree: Remove`
2. Extension lists worktrees
3. User selects one
4. Extension asks for confirmation
5. Extension runs:
   ```bash
   git worktree remove <path>
   ```
6. Extension refreshes state

---

## Testing Checklist

### Functional

- [ ] Create worktree from existing branch
- [ ] Create worktree from new branch
- [ ] List worktrees correctly
- [ ] Remove clean worktree
- [ ] Prune stale entries
- [ ] Open worktree in new VS Code window

### Edge cases

- [ ] Branch already in another worktree
- [ ] Remove dirty worktree
- [ ] Invalid repo root
- [ ] Multi-root workspace
- [ ] Detached worktree parsing
- [ ] Spaces in paths
- [ ] Windows path handling

### Manual audit

- [ ] Review all process execution points
- [ ] Review all path handling
- [ ] Review all confirmation prompts
- [ ] Review dependency tree
- [ ] Confirm no network-capable code slipped in

---

## Milestones

## Milestone 1

Command Palette MVP works for:

- list
- create
- remove
- open
- prune

## Milestone 2

Validation and error handling are clean enough for internal use.

## Milestone 3

Optional sidebar tree view.

## Milestone 4

Packaging, internal documentation, and team rollout.

---

## Nice-to-have Later

Only after MVP is stable.

- [ ] Show dirty/clean status per worktree
- [ ] Reveal worktree in Finder/Explorer
- [ ] Copy path to clipboard
- [ ] Delete branch after worktree removal
- [ ] Configurable default base branch
- [ ] Workspace trust integration review
- [ ] Minimal settings page

---

## Things to Avoid

- Overbuilt UI before core commands work
- Large dependency chains
- Fancy branch naming logic
- Git hosting platform integrations
- Automatic branch cleanup
- Background syncing
- Anything that makes auditing harder

---

## Definition of Done for MVP

The extension is done when:

- it can list, create, remove, open, and prune worktrees reliably
- it works on the team’s main OS targets
- destructive actions require confirmation
- the codebase is small enough to audit quickly
- it has no unnecessary dependencies or network behavior
- it is easier to trust than a random marketplace extension
