import * as vscode from "./mocks/vscode";
jest.mock("vscode", () => vscode, { virtual: true });
jest.mock("fs");

import * as fs from "fs";
import { Uri } from "vscode";
import { FavoritesView } from "../src/favoritesView";

describe("FavoritesView", () => {
  let logger: { log: jest.Mock };
  let workspaceStateStore: { [key: string]: any };
  let workspaceState: { get: jest.Mock; update: jest.Mock };
  let favoritesView: FavoritesView;
  let spyOnReaddir: jest.SpyInstance;
  let spyOnStat: jest.SpyInstance;

  beforeEach(() => {
    logger = {
      log: jest.fn(),
    };
    workspaceStateStore = {};
    workspaceState = {
      get: jest.fn((key: string, defaultValue?: any) =>
        typeof workspaceStateStore[key] !== "undefined"
          ? workspaceStateStore[key]
          : defaultValue,
      ),
      update: jest.fn((key: string, value: any) => {
        workspaceStateStore[key] = value;
        return Promise.resolve();
      }),
    };

    spyOnReaddir = jest.spyOn(fs, "readdir");
    spyOnStat = jest.spyOn(fs, "stat");

    favoritesView = new FavoritesView(workspaceState as any, logger as any);
  });

  afterEach(() => {
    favoritesView.dispose();
  });

  it("Should register the Favorites tree data provider and commands", () => {
    expect(vscode.window.registerTreeDataProvider).toHaveBeenCalledWith(
      "git-graph.favoriteFolders",
      favoritesView,
    );
    expect(
      vscode.getRegisteredTreeDataProvider("git-graph.favoriteFolders"),
    ).toBe(favoritesView);
  });

  it("Should show favorite folders and their contents", async () => {
    workspaceStateStore.favoriteFolders = ["/path/to/workspace/apps/app-one"];
    spyOnReaddir.mockImplementation(
      (
        _: string,
        callback: (err: NodeJS.ErrnoException | null, files: string[]) => void,
      ) => {
        callback(null, ["src", "package.json"]);
      },
    );
    spyOnStat.mockImplementation(
      (
        targetPath: string,
        callback: (err: NodeJS.ErrnoException | null, stats: fs.Stats) => void,
      ) => {
        callback(null, {
          isDirectory: () => targetPath.endsWith("src"),
        } as fs.Stats);
      },
    );

    const roots = await favoritesView.getChildren();
    const children = await favoritesView.getChildren(roots[0]);

    expect((roots[0] as any).label).toBe("app-one");
    expect((roots[0] as any).contextValue).toBe("git-graph.favoriteRoot");
    expect((children[0] as any).label).toBe("src");
    expect((children[1] as any).label).toBe("package.json");
  });

  it("Should add folders to Favorites from the Explorer context", async () => {
    spyOnStat.mockImplementation(
      (
        _: string,
        callback: (err: NodeJS.ErrnoException | null, stats: fs.Stats) => void,
      ) => {
        callback(null, { isDirectory: () => true } as fs.Stats);
      },
    );
    vscode.window.showInformationMessage.mockResolvedValueOnce(null);

    await vscode.commands.executeCommand(
      "git-graph.addFavoriteFolder",
      Uri.file("/path/to/workspace/apps/app-one"),
    );

    expect(workspaceState.update).toHaveBeenCalledWith("favoriteFolders", [
      "/path/to/workspace/apps/app-one",
    ]);
    expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
      "Added 1 folder to Favorites.",
    );
  });

  it("Should remove a favorite folder from the Favorites view", async () => {
    workspaceStateStore.favoriteFolders = ["/path/to/workspace/apps/app-one"];
    vscode.window.showInformationMessage.mockResolvedValueOnce(null);

    const roots = await favoritesView.getChildren();
    await vscode.commands.executeCommand(
      "git-graph.removeFavoriteFolder",
      roots[0],
    );

    expect(workspaceState.update).toHaveBeenCalledWith("favoriteFolders", []);
    expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
      "Removed 1 folder from Favorites.",
    );
  });
});
