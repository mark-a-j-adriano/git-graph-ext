import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { DataSource } from "./dataSource";
import { ExtensionState } from "./extensionState";
import { Logger } from "./logger";
import { RepoManager } from "./repoManager";
import { ErrorInfo } from "./types";
import {
  getPathFromUri,
  getRepoName,
  showErrorMessage,
  showInformationMessage,
} from "./utils";
import { Disposable } from "./utils/disposable";
import { EventEmitter } from "./utils/event";

const DISABLED_ENTRY_PREFIX = "# git-graph-disabled: ";
const LOCAL_EXCLUDE_LIST_VIEW_ID = "git-graph.localExcludeList";
const TREE_ITEM_CHECKBOX_STATE_UNCHECKED = 0;
const TREE_ITEM_CHECKBOX_STATE_CHECKED = 1;

interface LocalExcludeEntry {
  readonly pattern: string;
  readonly enabled: boolean;
}

class LocalExcludeEntryTreeItem extends vscode.TreeItem {
  public readonly repo: string;
  public readonly pattern: string;
  public readonly enabled: boolean;

  constructor(repo: string, entry: LocalExcludeEntry) {
    super(entry.pattern, vscode.TreeItemCollapsibleState.None);
    this.repo = repo;
    this.pattern = entry.pattern;
    this.enabled = entry.enabled;
    this.description = entry.enabled ? "enabled" : "disabled";
    this.tooltip = repo + "/.git/info/exclude\n" + entry.pattern;
    ((this as unknown) as { checkboxState: number }).checkboxState = entry.enabled
      ? TREE_ITEM_CHECKBOX_STATE_CHECKED
      : TREE_ITEM_CHECKBOX_STATE_UNCHECKED;
    this.contextValue = entry.enabled
      ? "git-graph.localExcludeEntry.enabled"
      : "git-graph.localExcludeEntry.disabled";
  }
}

class MessageTreeItem extends vscode.TreeItem {
  constructor(label: string, description?: string) {
    super(label, vscode.TreeItemCollapsibleState.None);
    this.description = description;
  }
}

type LocalExcludeTreeItem = LocalExcludeEntryTreeItem | MessageTreeItem;
type LocalExcludeCheckboxChangeEvent = {
  readonly items: ReadonlyArray<[LocalExcludeTreeItem, number]>;
};

/**
 * SCM side panel that exposes entries from `.git/info/exclude` for the current repository.
 */
export class LocalExcludeListView
  extends Disposable
  implements vscode.TreeDataProvider<LocalExcludeTreeItem>
{
  private readonly dataSource: DataSource;
  private readonly extensionState: ExtensionState;
  private readonly logger: Logger;
  private readonly repoManager: RepoManager;
  private readonly treeView: vscode.TreeView<LocalExcludeTreeItem>;
  private readonly treeDataChangeEmitter: EventEmitter<LocalExcludeTreeItem | null>;

  constructor(
    dataSource: DataSource,
    extensionState: ExtensionState,
    repoManager: RepoManager,
    logger: Logger,
  ) {
    super();
    this.dataSource = dataSource;
    this.extensionState = extensionState;
    this.repoManager = repoManager;
    this.logger = logger;
    this.treeDataChangeEmitter =
      new EventEmitter<LocalExcludeTreeItem | null>();
    this.treeView = (
      vscode.window as typeof vscode.window & {
        createTreeView: (
          viewId: string,
          options: {
            treeDataProvider: vscode.TreeDataProvider<LocalExcludeTreeItem>;
            manageCheckboxStateManually: boolean;
          },
        ) => vscode.TreeView<LocalExcludeTreeItem>;
      }
    ).createTreeView(LOCAL_EXCLUDE_LIST_VIEW_ID, {
      treeDataProvider: this,
      manageCheckboxStateManually: true,
    });

    this.registerDisposables(
      this.treeDataChangeEmitter,
      this.treeView,
      (
        this.treeView as vscode.TreeView<LocalExcludeTreeItem> & {
          onDidChangeCheckboxState: (
            listener: (event: LocalExcludeCheckboxChangeEvent) => void,
          ) => vscode.Disposable;
        }
      ).onDidChangeCheckboxState((event: LocalExcludeCheckboxChangeEvent) =>
        this.handleCheckboxStateChange(event.items),
      ),
      vscode.window.onDidChangeActiveTextEditor(() => this.refresh()),
      this.repoManager.onDidChangeRepos(() => this.refresh()),
    );

    this.registerCommand("git-graph.refreshLocalExcludeList", () =>
      this.refresh(),
    );
    this.registerCommand(
      "git-graph.addToLocalExcludeList",
      (resource?: vscode.Uri, resources?: vscode.Uri[]) =>
        this.addToLocalExcludeList(resource, resources),
    );
    this.registerCommand(
      "git-graph.toggleLocalExcludeEntry",
      (item: LocalExcludeEntryTreeItem) => this.toggleLocalExcludeEntry(item),
    );
  }

  get onDidChangeTreeData() {
    return this.treeDataChangeEmitter.subscribe;
  }

  public getTreeItem(element: LocalExcludeTreeItem) {
    return element;
  }

  public async getChildren(element?: LocalExcludeTreeItem) {
    if (typeof element !== "undefined") return [];

    const repo = this.getCurrentRepo();
    if (repo === null) {
      return [
        new MessageTreeItem(
          "No repository selected",
          "Open a file in a repository, or refresh after using Git Graph.",
        ),
      ];
    }

    const excludeFilePath = await this.dataSource.getExcludeFilePath(repo);
    if (excludeFilePath === null) {
      return [
        new MessageTreeItem(
          "Unable to resolve local exclude file",
          getRepoName(repo),
        ),
      ];
    }

    const contents = await readTextFile(excludeFilePath);
    if (contents.error !== null) {
      return [
        new MessageTreeItem(
          "Unable to read local exclude file",
          getRepoName(repo),
        ),
      ];
    }

    const entries = parseLocalExcludeEntries(contents.contents);
    if (entries.length === 0) {
      return [
        new MessageTreeItem("No local exclude entries", getRepoName(repo)),
      ];
    }

    return entries.map((entry) => new LocalExcludeEntryTreeItem(repo, entry));
  }

  private registerCommand(command: string, callback: (...args: any[]) => void) {
    this.registerDisposable(
      vscode.commands.registerCommand(command, (...args: any[]) => {
        this.logger.log("Command Invoked: " + command);
        return callback(...args);
      }),
    );
  }

  private refresh() {
    this.treeDataChangeEmitter.emit(null);
  }

  private getCurrentRepo() {
    if (vscode.window.activeTextEditor) {
      const repo = this.repoManager.getRepoContainingFile(
        getPathFromUri(vscode.window.activeTextEditor.document.uri),
      );
      if (repo !== null) return repo;
    }

    const lastActiveRepo = this.extensionState.getLastActiveRepo();
    const repos = this.repoManager.getRepos();
    if (
      lastActiveRepo !== null &&
      typeof repos[lastActiveRepo] !== "undefined"
    ) {
      return lastActiveRepo;
    }

    const repoPaths = Object.keys(repos);
    return repoPaths.length === 1 ? repoPaths[0] : null;
  }

  private async addToLocalExcludeList(
    resource?: vscode.Uri,
    resources?: vscode.Uri[],
  ) {
    const targets =
      resources && resources.length > 0
        ? resources
        : typeof resource !== "undefined"
          ? [resource]
          : [];

    if (targets.length === 0) {
      showErrorMessage(
        "No file or folder was provided to add to the local exclude list.",
      );
      return;
    }

    const groupedTargets: { [repo: string]: string[] } = {};
    for (let i = 0; i < targets.length; i++) {
      const repo = await this.dataSource.repoRoot(getPathFromUri(targets[i]));
      if (repo === null) {
        showErrorMessage(
          "The selected file or folder is not contained within a Git repository.",
        );
        return;
      }

      const pattern = await this.getPatternForUri(repo, targets[i]);
      if (pattern === null) {
        showErrorMessage(
          "Unable to add the selected file or folder to the local exclude list.",
        );
        return;
      }

      if (typeof groupedTargets[repo] === "undefined")
        groupedTargets[repo] = [];
      if (!groupedTargets[repo].includes(pattern))
        groupedTargets[repo].push(pattern);
    }

    let addedCount = 0,
      skippedCount = 0;
    const repos = Object.keys(groupedTargets);
    for (let i = 0; i < repos.length; i++) {
      const excludeFilePath = await this.dataSource.getExcludeFilePath(
        repos[i],
      );
      if (excludeFilePath === null) {
        showErrorMessage(
          'Unable to resolve the local exclude file for repository "' +
            getRepoName(repos[i]) +
            '".',
        );
        return;
      }

      const result = await appendPatternsToExcludeFile(
        excludeFilePath,
        groupedTargets[repos[i]],
      );
      if (result.error !== null) {
        showErrorMessage(result.error);
        return;
      }

      addedCount += result.addedCount;
      skippedCount += result.skippedCount;
    }

    if (addedCount > 0) {
      showInformationMessage(
        "Added " +
          addedCount +
          " path" +
          (addedCount === 1 ? "" : "s") +
          " to the local exclude list." +
          (skippedCount > 0
            ? " Skipped " +
              skippedCount +
              " existing entr" +
              (skippedCount === 1 ? "y." : "ies.")
            : ""),
      );
    } else {
      showInformationMessage(
        "The selected path" +
          (targets.length === 1 ? " is" : "s are") +
          " already in the local exclude list.",
      );
    }

    this.refresh();
  }

  private async toggleLocalExcludeEntry(item: LocalExcludeEntryTreeItem) {
    await this.setLocalExcludeEntryState(
      item.repo,
      item.pattern,
      !item.enabled,
    );
  }

  private async handleCheckboxStateChange(
    items: ReadonlyArray<[LocalExcludeTreeItem, number]>,
  ) {
    for (let i = 0; i < items.length; i++) {
      const item = items[i][0];
      if (!(item instanceof LocalExcludeEntryTreeItem)) continue;

      const enabled = items[i][1] === TREE_ITEM_CHECKBOX_STATE_CHECKED;
      await this.setLocalExcludeEntryState(item.repo, item.pattern, enabled);
    }
  }

  private async setLocalExcludeEntryState(
    repo: string,
    pattern: string,
    enabled: boolean,
  ) {
    const excludeFilePath = await this.dataSource.getExcludeFilePath(repo);
    if (excludeFilePath === null) {
      showErrorMessage(
        'Unable to resolve the local exclude file for repository "' +
          getRepoName(repo) +
          '".',
      );
      return;
    }

    const error = await setPatternEnabledInExcludeFile(
      excludeFilePath,
      pattern,
      enabled,
    );
    if (error !== null) {
      showErrorMessage(error);
      return;
    }

    this.refresh();
  }

  private async getPatternForUri(repo: string, uri: vscode.Uri) {
    const uriPath = getPathFromUri(uri);
    const relativePath = path.relative(repo, uriPath).replace(/\\/g, "/");
    if (relativePath === "" || relativePath.startsWith("../")) return null;

    const stat = await statPath(uriPath);
    if (stat === null) return null;

    let pattern = escapeExcludePattern(relativePath);
    if (stat.isDirectory() && !pattern.endsWith("/")) pattern += "/";
    return pattern;
  }
}

function parseLocalExcludeEntries(contents: string) {
  const lines = contents.split(/\r\n|\r|\n/);
  const entries: LocalExcludeEntry[] = [];

  for (let i = 0; i < lines.length; i++) {
    const trimmedLine = lines[i].trim();
    if (trimmedLine === "") continue;

    if (trimmedLine.startsWith(DISABLED_ENTRY_PREFIX)) {
      entries.push({
        pattern: trimmedLine.substring(DISABLED_ENTRY_PREFIX.length),
        enabled: false,
      });
      continue;
    }

    if (!trimmedLine.startsWith("#")) {
      entries.push({ pattern: trimmedLine, enabled: true });
    }
  }

  return entries;
}

function detectEol(contents: string) {
  return contents.indexOf("\r\n") > -1 ? "\r\n" : "\n";
}

function escapeExcludePattern(pattern: string) {
  let escapedPattern = pattern;
  if (escapedPattern.startsWith("!") || escapedPattern.startsWith("#")) {
    escapedPattern = "\\" + escapedPattern;
  }

  const trailingWhitespace = escapedPattern.match(/ +$/);
  if (trailingWhitespace !== null) {
    escapedPattern =
      escapedPattern.substring(
        0,
        escapedPattern.length - trailingWhitespace[0].length,
      ) + "\\ ".repeat(trailingWhitespace[0].length);
  }

  return escapedPattern;
}

function statPath(filePath: string) {
  return new Promise<fs.Stats | null>((resolve) => {
    fs.stat(filePath, (err, stats) => resolve(err ? null : stats));
  });
}

function readTextFile(filePath: string) {
  return new Promise<{ contents: string; error: ErrorInfo }>((resolve) => {
    fs.readFile(filePath, "utf8", (err, contents) => {
      if (err !== null) {
        if (err.code === "ENOENT") {
          resolve({ contents: "", error: null });
        } else {
          resolve({
            contents: "",
            error: "Unable to read the local exclude file.",
          });
        }
      } else {
        resolve({ contents: contents, error: null });
      }
    });
  });
}

function writeTextFile(filePath: string, contents: string) {
  return new Promise<ErrorInfo>((resolve) => {
    fs.writeFile(filePath, contents, "utf8", (err) => {
      resolve(err === null ? null : "Unable to write the local exclude file.");
    });
  });
}

async function appendPatternsToExcludeFile(
  excludeFilePath: string,
  patterns: string[],
) {
  const contents = await readTextFile(excludeFilePath);
  if (contents.error !== null) {
    return { addedCount: 0, skippedCount: 0, error: contents.error };
  }

  const knownPatterns = new Set(
    parseLocalExcludeEntries(contents.contents).map((entry) => entry.pattern),
  );
  const newPatterns = patterns.filter((pattern) => !knownPatterns.has(pattern));
  if (newPatterns.length === 0) {
    return { addedCount: 0, skippedCount: patterns.length, error: null };
  }

  const eol = detectEol(contents.contents);
  const prefix =
    contents.contents === "" ||
    contents.contents.endsWith("\n") ||
    contents.contents.endsWith("\r")
      ? ""
      : eol;
  const nextContents = contents.contents + prefix + newPatterns.join(eol) + eol;
  const error = await writeTextFile(excludeFilePath, nextContents);
  return {
    addedCount: error === null ? newPatterns.length : 0,
    skippedCount: patterns.length - newPatterns.length,
    error: error,
  };
}

async function setPatternEnabledInExcludeFile(
  excludeFilePath: string,
  pattern: string,
  enabled: boolean,
) {
  const contents = await readTextFile(excludeFilePath);
  if (contents.error !== null) return contents.error;

  const eol = detectEol(contents.contents);
  const lines = contents.contents.split(/\r\n|\r|\n/);
  const lineToReplace = enabled ? DISABLED_ENTRY_PREFIX + pattern : pattern;
  const replacementLine = enabled ? pattern : DISABLED_ENTRY_PREFIX + pattern;
  const lineIndex = lines.findIndex((line) => line.trim() === lineToReplace);
  if (lineIndex === -1) {
    return "Unable to find the selected local exclude entry.";
  }

  lines[lineIndex] = replacementLine;
  return writeTextFile(excludeFilePath, lines.join(eol));
}
