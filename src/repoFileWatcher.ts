import * as vscode from "vscode";
import { Logger } from "./logger";
import { getPathFromUri } from "./utils";
import { Disposable, toDisposable } from "./utils/disposable";

const FILE_CHANGE_REGEX =
  /(^\.git\/(config|index|HEAD|refs\/stash|refs\/heads\/.*|refs\/remotes\/.*|refs\/tags\/.*)$)|(^(?!\.git).*$)|(^\.git[^\/]+$)/;

export interface RepoFileWatcherDiagnostics {
  readonly active: boolean;
  readonly repo: string | null;
  readonly muted: boolean;
  readonly hasPendingRefresh: boolean;
  readonly resumeAfterMs: number;
}

/**
 * Watches a Git repository for file events.
 */
export class RepoFileWatcher extends Disposable {
  private readonly logger: Logger;
  private readonly repoChangeCallback: () => void;
  private repo: string | null = null;
  private fsWatcher: vscode.FileSystemWatcher | null = null;
  private refreshTimeout: NodeJS.Timer | null = null;
  private muted: boolean = false;
  private resumeAt: number = 0;

  /**
   * Creates a RepoFileWatcher.
   * @param logger The Git Graph Logger instance.
   * @param repoChangeCallback A callback to be invoked when a file event occurs in the repository.
   */
  constructor(logger: Logger, repoChangeCallback: () => void) {
    super();
    this.logger = logger;
    this.repoChangeCallback = repoChangeCallback;
    this.registerDisposable(toDisposable(() => this.stop()));
  }

  /**
   * Start watching a repository for file events.
   * @param repo The path of the repository to watch.
   */
  public start(repo: string) {
    if (this.fsWatcher !== null && this.repo === repo) return;

    if (this.fsWatcher !== null) {
      // If there is an existing File System Watcher, stop it
      this.stop();
    }

    this.repo = repo;
    // Create a File System Watcher for all events within the specified repository
    this.fsWatcher = vscode.workspace.createFileSystemWatcher(repo + "/**");
    this.fsWatcher.onDidCreate((uri) => this.refresh(uri));
    this.fsWatcher.onDidChange((uri) => this.refresh(uri));
    this.fsWatcher.onDidDelete((uri) => this.refresh(uri));
    this.logger.log("Started watching repo: " + repo);
  }

  /**
   * Stop watching the repository for file events.
   */
  public stop() {
    if (this.fsWatcher !== null) {
      // If there is an existing File System Watcher, stop it
      this.fsWatcher.dispose();
      this.fsWatcher = null;
      this.logger.log("Stopped watching repo: " + this.repo);
    }
    if (this.refreshTimeout !== null) {
      // If a timeout is active, clear it
      clearTimeout(this.refreshTimeout);
      this.refreshTimeout = null;
    }
    this.repo = null;
    this.resumeAt = 0;
  }

  /**
   * Mute file events - Used to prevent many file events from being triggered when a Git action is executed by the Git Graph View.
   */
  public mute() {
    this.muted = true;
  }

  /**
   * Unmute file events - Used to resume normal watching after a Git action executed by the Git Graph View has completed.
   */
  public unmute() {
    this.muted = false;
    this.resumeAt = new Date().getTime() + 1500;
  }

  /**
   * Get watcher diagnostics for troubleshooting.
   */
  public getDiagnostics(): RepoFileWatcherDiagnostics {
    return {
      active: this.fsWatcher !== null,
      repo: this.repo,
      muted: this.muted,
      hasPendingRefresh: this.refreshTimeout !== null,
      resumeAfterMs: Math.max(0, this.resumeAt - new Date().getTime()),
    };
  }

  /**
   * Handle a file event triggered by the File System Watcher.
   * @param uri The URI of the file that the event occurred on.
   */
  private refresh(uri: vscode.Uri) {
    if (this.muted) return;
    if (
      !getPathFromUri(uri)
        .replace(this.repo + "/", "")
        .match(FILE_CHANGE_REGEX)
    )
      return;
    if (new Date().getTime() < this.resumeAt) return;

    if (this.refreshTimeout !== null) {
      clearTimeout(this.refreshTimeout);
    }
    this.refreshTimeout = setTimeout(() => {
      this.refreshTimeout = null;
      this.repoChangeCallback();
    }, 750);
  }
}
