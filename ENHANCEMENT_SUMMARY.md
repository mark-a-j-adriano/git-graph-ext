# GitGraph V2 Enhancement Summary

## Problem Statement

Git Graph provided strong repository visualization and actions, but its activation and startup model could still do too much work too early. In larger workspaces, that meant the extension might perform repository discovery, watcher setup, repository config checks, and submodule scans before the user had even opened the graph.

That pattern increases startup cost in the exact environments that most need restraint: monorepos, multi-root workspaces, and repositories with many nested folders.

## What We Solve

GitGraph V2 shifts repository work away from eager startup and toward explicit, user-driven refresh paths.

This enhancement reduces unnecessary startup I/O and CPU work by:

- restoring known repositories first
- skipping broad workspace discovery when known repositories already exist
- deferring workspace-wide folder watchers when startup can remain lazy
- skipping startup config-file scans for known repositories in lazy mode
- skipping startup submodule sweeps for known repositories in lazy mode
- refreshing known repositories on demand from UI and git executable change flows
- narrowing extension activation so VS Code does not load the extension for every session by default

## New Features

### 1. Lazy Startup Discovery

Startup now avoids broad workspace repository discovery when the workspace already has known repository state available.

### 2. On-Demand Repository Refresh APIs

Two explicit refresh paths now exist:

- `discoverWorkspaceRepos` for broad workspace discovery
- `refreshKnownRepos` for refreshing already-known repositories and submodules without a full workspace scan

### 3. Deferred Startup Watchers

Workspace-wide folder watchers are no longer started eagerly when lazy startup is sufficient.

### 4. Deferred Startup Config And Submodule Checks

Known-repository config checks and submodule scans are now skipped during lazy startup and are instead handled by explicit runtime refresh paths.

### 5. UI-Driven Refresh Behavior

The Git Graph webview now triggers explicit refresh behavior during repository load and manual rescan flows instead of depending on eager activation-time discovery.

### 6. Narrower Activation Model

The extension no longer uses wildcard activation, reducing startup overhead for VS Code sessions that never open GitGraph V2.

## User Impact

For users, the graph still loads and refreshes when needed, but the extension does less speculative work in the background. The result is a more predictable cost model:

- less startup work
- more intentional repository scanning
- fewer broad watchers created up front
- better behavior in large workspaces

## Packaging Notes

This summary is also surfaced from the README so it appears in extension details for packaged builds.
