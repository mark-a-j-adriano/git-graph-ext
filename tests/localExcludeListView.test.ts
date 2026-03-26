import * as vscode from "./mocks/vscode";
jest.mock("vscode", () => vscode, { virtual: true });
jest.mock("fs");

import * as fs from "fs";
import { Uri } from "vscode";
import { LocalExcludeListView } from "../src/localExcludeListView";
import { waitForExpect } from "./helpers/expectations";

describe("LocalExcludeListView", () => {
  let dataSource: { getExcludeFilePath: jest.Mock; repoRoot: jest.Mock };
  let extensionState: { getLastActiveRepo: jest.Mock };
  let repoManager: {
    getRepos: jest.Mock;
    getRepoContainingFile: jest.Mock;
    onDidChangeRepos: jest.Mock;
  };
  let logger: { log: jest.Mock };
  let localExcludeListView: LocalExcludeListView;
  let spyOnReadFile: jest.SpyInstance;
  let spyOnStat: jest.SpyInstance;
  let spyOnWriteFile: jest.SpyInstance;

  beforeEach(() => {
    dataSource = {
      getExcludeFilePath: jest
        .fn()
        .mockResolvedValue("/path/to/repo/.git/info/exclude"),
      repoRoot: jest.fn().mockResolvedValue("/path/to/repo"),
    };
    extensionState = {
      getLastActiveRepo: jest.fn().mockReturnValue(null),
    };
    repoManager = {
      getRepos: jest.fn().mockReturnValue({ "/path/to/repo": {} }),
      getRepoContainingFile: jest.fn().mockReturnValue("/path/to/repo"),
      onDidChangeRepos: jest.fn(() => ({ dispose: jest.fn() })),
    };
    logger = {
      log: jest.fn(),
    };

    spyOnReadFile = jest.spyOn(fs, "readFile");
    spyOnStat = jest.spyOn(fs, "stat");
    spyOnWriteFile = jest.spyOn(fs, "writeFile");

    vscode.window.activeTextEditor = {
      document: {
        uri: Uri.file("/path/to/repo/src/file.ts"),
      },
    };

    localExcludeListView = new LocalExcludeListView(
      dataSource as any,
      extensionState as any,
      repoManager as any,
      logger as any,
    );
  });

  afterEach(() => {
    localExcludeListView.dispose();
  });

  it("Should register the tree data provider and commands", () => {
    expect(vscode.window.createTreeView).toHaveBeenCalledWith(
      "git-graph.localExcludeList",
      expect.objectContaining({ treeDataProvider: localExcludeListView }),
    );
    expect(
      vscode.getRegisteredTreeDataProvider("git-graph.localExcludeList"),
    ).toBe(localExcludeListView);
  });

  it("Should show enabled and disabled local exclude entries", async () => {
    spyOnReadFile.mockImplementation(
      (
        _: string,
        __: string,
        callback: (err: NodeJS.ErrnoException | null, data: string) => void,
      ) => {
        callback(
          null,
          "node_modules\n# git-graph-disabled: dist/\n# comment\n",
        );
      },
    );

    const children = await localExcludeListView.getChildren();

    expect(children.map((child) => (child as any).label)).toStrictEqual([
      "node_modules",
      "dist/",
    ]);
    expect((children[0] as any).checkboxState).toBe(
      vscode.TreeItemCheckboxState.Checked,
    );
    expect((children[1] as any).checkboxState).toBe(
      vscode.TreeItemCheckboxState.Unchecked,
    );
  });

  it("Should add a path to the local exclude list", async () => {
    spyOnReadFile.mockImplementation(
      (
        _: string,
        __: string,
        callback: (err: NodeJS.ErrnoException | null, data: string) => void,
      ) => {
        callback(null, "node_modules\n");
      },
    );
    spyOnStat.mockImplementation(
      (
        _: string,
        callback: (err: NodeJS.ErrnoException | null, stats: fs.Stats) => void,
      ) => {
        callback(null, { isDirectory: () => false } as fs.Stats);
      },
    );
    spyOnWriteFile.mockImplementation(
      (
        _: string,
        contents: string,
        __: string,
        callback: (err: NodeJS.ErrnoException | null) => void,
      ) => {
        expect(contents).toBe("node_modules\nsrc/new-file.ts\n");
        callback(null);
      },
    );
    vscode.window.showInformationMessage.mockResolvedValueOnce(null);

    await vscode.commands.executeCommand(
      "git-graph.addToLocalExcludeList",
      Uri.file("/path/to/repo/src/new-file.ts"),
    );

    expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
      "Added 1 path to the local exclude list.",
    );
  });

  it("Should toggle a local exclude entry", async () => {
    spyOnReadFile.mockImplementation(
      (
        _: string,
        __: string,
        callback: (err: NodeJS.ErrnoException | null, data: string) => void,
      ) => {
        callback(null, "node_modules\n");
      },
    );
    spyOnWriteFile.mockImplementation(
      (
        _: string,
        contents: string,
        __: string,
        callback: (err: NodeJS.ErrnoException | null) => void,
      ) => {
        expect(contents).toBe("# git-graph-disabled: node_modules\n");
        callback(null);
      },
    );

    const children = await localExcludeListView.getChildren();
    await vscode.commands.executeCommand(
      "git-graph.toggleLocalExcludeEntry",
      children[0],
    );

    expect(spyOnWriteFile).toHaveBeenCalled();
  });

  it("Should update a local exclude entry from checkbox changes", async () => {
    spyOnReadFile.mockImplementation(
      (
        _: string,
        __: string,
        callback: (err: NodeJS.ErrnoException | null, data: string) => void,
      ) => {
        callback(null, "# git-graph-disabled: node_modules\n");
      },
    );
    spyOnWriteFile.mockImplementation(
      (
        _: string,
        contents: string,
        __: string,
        callback: (err: NodeJS.ErrnoException | null) => void,
      ) => {
        expect(contents).toBe("node_modules\n");
        callback(null);
      },
    );

    const children = await localExcludeListView.getChildren();
    vscode.emitOnDidChangeCheckboxState("git-graph.localExcludeList", [
      [children[0], vscode.TreeItemCheckboxState.Checked],
    ]);

    await waitForExpect(() => {
      expect(spyOnWriteFile).toHaveBeenCalled();
    });
  });
});
