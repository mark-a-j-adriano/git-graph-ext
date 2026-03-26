import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { Logger } from "./logger";
import {
  getPathFromUri,
  showErrorMessage,
  showInformationMessage,
} from "./utils";
import { Disposable } from "./utils/disposable";
import { EventEmitter } from "./utils/event";

const FAVORITE_FOLDERS_STATE_KEY = "favoriteFolders";
const FAVORITES_VIEW_ID = "git-graph.favoriteFolders";

class FavoriteRootTreeItem extends vscode.TreeItem {
  public readonly folderPath: string;

  constructor(folderPath: string) {
    const resourceUri = vscode.Uri.file(folderPath);
    super(path.basename(folderPath), vscode.TreeItemCollapsibleState.Collapsed);
    this.folderPath = folderPath;
    this.resourceUri = resourceUri;
    this.tooltip = folderPath;
    this.contextValue = "git-graph.favoriteRoot";
  }
}

class FavoriteFolderTreeItem extends vscode.TreeItem {
  public readonly folderPath: string;

  constructor(folderPath: string) {
    const resourceUri = vscode.Uri.file(folderPath);
    super(path.basename(folderPath), vscode.TreeItemCollapsibleState.Collapsed);
    this.folderPath = folderPath;
    this.resourceUri = resourceUri;
    this.tooltip = folderPath;
    this.contextValue = "git-graph.favoriteFolder";
  }
}

class FavoriteFileTreeItem extends vscode.TreeItem {
  public readonly filePath: string;

  constructor(filePath: string) {
    const resourceUri = vscode.Uri.file(filePath);
    super(path.basename(filePath), vscode.TreeItemCollapsibleState.None);
    this.filePath = filePath;
    this.resourceUri = resourceUri;
    this.tooltip = filePath;
    this.contextValue = "git-graph.favoriteFile";
    this.command = {
      command: "vscode.open",
      title: "Open File",
      arguments: [resourceUri],
    };
  }
}

class MessageTreeItem extends vscode.TreeItem {
  constructor(label: string, description?: string) {
    super(label, vscode.TreeItemCollapsibleState.None);
    this.description = description;
  }
}

type FavoritesTreeItem =
  | FavoriteRootTreeItem
  | FavoriteFolderTreeItem
  | FavoriteFileTreeItem
  | MessageTreeItem;

export class FavoritesView
  extends Disposable
  implements vscode.TreeDataProvider<FavoritesTreeItem>
{
  private readonly logger: Logger;
  private readonly workspaceState: vscode.Memento;
  private readonly treeDataChangeEmitter: EventEmitter<FavoritesTreeItem | null>;

  constructor(workspaceState: vscode.Memento, logger: Logger) {
    super();
    this.logger = logger;
    this.workspaceState = workspaceState;
    this.treeDataChangeEmitter = new EventEmitter<FavoritesTreeItem | null>();

    this.registerDisposables(
      this.treeDataChangeEmitter,
      vscode.window.registerTreeDataProvider(FAVORITES_VIEW_ID, this),
      vscode.workspace.onDidChangeWorkspaceFolders(() => this.refresh()),
    );

    this.registerCommand("git-graph.refreshFavoriteFolders", () =>
      this.refresh(),
    );
    this.registerCommand(
      "git-graph.addFavoriteFolder",
      (resource?: vscode.Uri, resources?: vscode.Uri[]) =>
        this.addFavoriteFolder(resource, resources),
    );
    this.registerCommand(
      "git-graph.removeFavoriteFolder",
      (target?: FavoriteRootTreeItem | vscode.Uri, resources?: vscode.Uri[]) =>
        this.removeFavoriteFolder(target, resources),
    );
  }

  get onDidChangeTreeData() {
    return this.treeDataChangeEmitter.subscribe;
  }

  public getTreeItem(element: FavoritesTreeItem) {
    return element;
  }

  public async getChildren(element?: FavoritesTreeItem) {
    if (typeof element === "undefined") {
      const favoriteFolders = this.getFavoriteFolders();
      if (favoriteFolders.length === 0) {
        return [
          new MessageTreeItem(
            "No favorite folders",
            "Use the Explorer context menu to add folders.",
          ),
        ];
      }

      return favoriteFolders.map(
        (favoriteFolder) => new FavoriteRootTreeItem(favoriteFolder),
      );
    }

    if (
      element instanceof FavoriteRootTreeItem ||
      element instanceof FavoriteFolderTreeItem
    ) {
      return await getDirectoryTreeItems(element.folderPath);
    }

    return [];
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

  private getFavoriteFolders() {
    const favoriteFolders = this.workspaceState.get<string[]>(
      FAVORITE_FOLDERS_STATE_KEY,
      [],
    );
    return deduplicateAndSortPaths(favoriteFolders.map(normalizePath));
  }

  private async setFavoriteFolders(favoriteFolders: string[]) {
    try {
      await this.workspaceState.update(
        FAVORITE_FOLDERS_STATE_KEY,
        deduplicateAndSortPaths(favoriteFolders.map(normalizePath)),
      );
      return null;
    } catch (_) {
      return "Visual Studio Code was unable to save the favorite folders.";
    }
  }

  private async addFavoriteFolder(
    resource?: vscode.Uri,
    resources?: vscode.Uri[],
  ) {
    const targets = resolveTargetUris(resource, resources);
    if (targets.length === 0) {
      showErrorMessage("No folder was provided to add to Favorites.");
      return;
    }

    const favoriteFolders = this.getFavoriteFolders();
    const foldersToAdd: string[] = [];
    for (let i = 0; i < targets.length; i++) {
      const folderPath = normalizePath(getPathFromUri(targets[i]));
      const stats = await statPath(folderPath);
      if (stats === null || !stats.isDirectory()) {
        showErrorMessage("Only folders can be added to Favorites.");
        return;
      }

      if (
        !favoriteFolders.includes(folderPath) &&
        !foldersToAdd.includes(folderPath)
      ) {
        foldersToAdd.push(folderPath);
      }
    }

    if (foldersToAdd.length === 0) {
      showInformationMessage("The selected folder is already in Favorites.");
      return;
    }

    const error = await this.setFavoriteFolders(
      favoriteFolders.concat(foldersToAdd),
    );
    if (error !== null) {
      showErrorMessage(error);
      return;
    }

    showInformationMessage(
      "Added " +
        foldersToAdd.length +
        " folder" +
        (foldersToAdd.length === 1 ? "" : "s") +
        " to Favorites.",
    );
    this.refresh();
  }

  private async removeFavoriteFolder(
    target?: FavoriteRootTreeItem | vscode.Uri,
    resources?: vscode.Uri[],
  ) {
    const folderPaths = await this.resolveFolderPathsForRemoval(
      target,
      resources,
    );
    if (folderPaths.length === 0) {
      showErrorMessage("No folder was provided to remove from Favorites.");
      return;
    }

    const favoriteFolders = this.getFavoriteFolders();
    const nextFavoriteFolders = favoriteFolders.filter(
      (favoriteFolder) => !folderPaths.includes(favoriteFolder),
    );
    const removedCount = favoriteFolders.length - nextFavoriteFolders.length;
    if (removedCount === 0) {
      showInformationMessage("The selected folder is not in Favorites.");
      return;
    }

    const error = await this.setFavoriteFolders(nextFavoriteFolders);
    if (error !== null) {
      showErrorMessage(error);
      return;
    }

    showInformationMessage(
      "Removed " +
        removedCount +
        " folder" +
        (removedCount === 1 ? "" : "s") +
        " from Favorites.",
    );
    this.refresh();
  }

  private async resolveFolderPathsForRemoval(
    target?: FavoriteRootTreeItem | vscode.Uri,
    resources?: vscode.Uri[],
  ) {
    if (target instanceof FavoriteRootTreeItem) {
      return [normalizePath(target.folderPath)];
    }

    const targets = resolveTargetUris(
      target instanceof vscode.Uri ? target : undefined,
      resources,
    );
    if (targets.length === 0) return [];

    const folderPaths: string[] = [];
    for (let i = 0; i < targets.length; i++) {
      const folderPath = normalizePath(getPathFromUri(targets[i]));
      const stats = await statPath(folderPath);
      if (stats === null || !stats.isDirectory()) {
        showErrorMessage("Only folders can be removed from Favorites.");
        return [];
      }

      if (!folderPaths.includes(folderPath)) folderPaths.push(folderPath);
    }

    return folderPaths;
  }
}

function resolveTargetUris(resource?: vscode.Uri, resources?: vscode.Uri[]) {
  return resources && resources.length > 0
    ? resources
    : typeof resource !== "undefined"
      ? [resource]
      : [];
}

function normalizePath(folderPath: string) {
  return path.resolve(folderPath);
}

function deduplicateAndSortPaths(paths: string[]) {
  return Array.from(new Set(paths)).sort((a, b) => a.localeCompare(b));
}

function statPath(filePath: string) {
  return new Promise<fs.Stats | null>((resolve) => {
    fs.stat(filePath, (err, stats) => resolve(err ? null : stats));
  });
}

function readDirectory(filePath: string) {
  return new Promise<string[] | null>((resolve) => {
    fs.readdir(filePath, (err, entries) => resolve(err ? null : entries));
  });
}

async function getDirectoryTreeItems(folderPath: string) {
  const entries = await readDirectory(folderPath);
  if (entries === null) {
    return [
      new MessageTreeItem("Unable to read folder", path.basename(folderPath)),
    ];
  }

  const directoryItems: FavoriteFolderTreeItem[] = [];
  const fileItems: FavoriteFileTreeItem[] = [];
  const sortedEntries = entries.slice().sort((a, b) => a.localeCompare(b));
  for (let i = 0; i < sortedEntries.length; i++) {
    const childPath = path.join(folderPath, sortedEntries[i]);
    const stats = await statPath(childPath);
    if (stats === null) continue;

    if (stats.isDirectory()) {
      directoryItems.push(new FavoriteFolderTreeItem(childPath));
    } else {
      fileItems.push(new FavoriteFileTreeItem(childPath));
    }
  }

  return [...directoryItems, ...fileItems];
}
