import * as vscode from "vscode";
import { RequestMessage, ResponseMessage, Writeable } from "../../src/types";

/* Mocks */

const mockedExtensionSettingValues: { [section: string]: any } = {};
const mockedCommands: { [command: string]: (...args: any[]) => any } = {};
const mockedTreeDataProviders: { [viewId: string]: any } = {};
const mockedTreeViews: { [viewId: string]: any } = {};

let onDidChangeActiveTextEditorListener: ((e: any) => void) | null = null;
let onDidChangeCheckboxStateListeners: {
  [viewId: string]: ((e: any) => void) | null;
} = {};

interface WebviewPanelMocks {
  messages: ResponseMessage[];
  panel: {
    onDidChangeViewState: (
      e: vscode.WebviewPanelOnDidChangeViewStateEvent,
    ) => any;
    onDidDispose: (e: void) => any;
    setVisibility: (visible: boolean) => void;
    webview: {
      onDidReceiveMessage: (msg: RequestMessage) => void;
    };
  };
}

let mockedWebviews: { panel: vscode.WebviewPanel; mocks: WebviewPanelMocks }[] =
  [];

export const mocks = {
  extensionContext: {
    asAbsolutePath: jest.fn(),
    extensionPath: "/path/to/extension",
    globalState: {
      get: jest.fn(),
      update: jest.fn(),
    },
    globalStoragePath: "/path/to/globalStorage",
    logPath: "/path/to/logs",
    storagePath: "/path/to/storage",
    subscriptions: [],
    workspaceState: {
      get: jest.fn(),
      update: jest.fn(),
    },
  } as unknown as vscode.ExtensionContext,
  outputChannel: {
    appendLine: jest.fn(),
    dispose: jest.fn(),
  },
  statusBarItem: {
    text: "",
    tooltip: "",
    command: "",
    show: jest.fn(),
    hide: jest.fn(),
    dispose: jest.fn(),
  },
  terminal: {
    sendText: jest.fn(),
    show: jest.fn(),
  },
  workspaceConfiguration: {
    get: jest.fn((section: string, defaultValue?: any) => {
      return typeof mockedExtensionSettingValues[section] !== "undefined"
        ? mockedExtensionSettingValues[section]
        : defaultValue;
    }),
    inspect: jest.fn((section: string) => ({
      workspaceValue: mockedExtensionSettingValues[section],
      globalValue: mockedExtensionSettingValues[section],
    })),
  },
};

/* Visual Studio Code API Mocks */

export const commands = {
  executeCommand: jest.fn((command: string, ...rest: any[]) =>
    mockedCommands[command](...rest),
  ),
  registerCommand: jest.fn(
    (command: string, callback: (...args: any[]) => any) => {
      mockedCommands[command] = callback;
      return {
        dispose: () => {
          delete mockedCommands[command];
        },
      };
    },
  ),
};

export const env = {
  clipboard: {
    writeText: jest.fn(),
  },
  openExternal: jest.fn(),
};

export const EventEmitter = jest.fn(() => ({
  dispose: jest.fn(),
  event: jest.fn(),
}));

export class Uri implements vscode.Uri {
  public readonly scheme: string;
  public readonly authority: string;
  public readonly path: string;
  public readonly query: string;
  public readonly fragment: string;

  protected constructor(
    scheme: string,
    authority?: string,
    path?: string,
    query?: string,
    fragment?: string,
  ) {
    this.scheme = scheme;
    this.authority = authority || "";
    this.path = path || "";
    this.query = query || "";
    this.fragment = fragment || "";
  }

  get fsPath() {
    return this.path;
  }

  public with(change: {
    scheme?: string | undefined;
    authority?: string | undefined;
    path?: string | undefined;
    query?: string | undefined;
    fragment?: string | undefined;
  }): vscode.Uri {
    return new Uri(
      change.scheme || this.scheme,
      change.authority || this.authority,
      change.path || this.path,
      change.query || this.query,
      change.fragment || this.fragment,
    );
  }

  public toString() {
    return (
      this.scheme +
      "://" +
      this.path +
      (this.query ? "?" + this.query : "") +
      (this.fragment ? "#" + this.fragment : "")
    );
  }

  public toJSON() {
    return this;
  }

  public static file(path: string) {
    return new Uri("file", "", path);
  }

  public static parse(path: string) {
    const comps = path.match(/([a-z]+):\/\/([^?#]+)(\?([^#]+)|())(#(.+)|())/)!;
    return new Uri(comps[1], "", comps[2], comps[4], comps[6]);
  }
}

export enum StatusBarAlignment {
  Left = 1,
  Right = 2,
}

export let version = "1.51.0";

export enum ViewColumn {
  Active = -1,
  Beside = -2,
  One = 1,
  Two = 2,
  Three = 3,
  Four = 4,
  Five = 5,
  Six = 6,
  Seven = 7,
  Eight = 8,
  Nine = 9,
}

export enum TreeItemCollapsibleState {
  None = 0,
  Collapsed = 1,
  Expanded = 2,
}

export enum TreeItemCheckboxState {
  Unchecked = 0,
  Checked = 1,
}

export class TreeItem {
  public label: string;
  public collapsibleState: TreeItemCollapsibleState;
  public checkboxState?: TreeItemCheckboxState;
  public description?: string;
  public tooltip?: string;
  public contextValue?: string;
  public command?: vscode.Command;

  constructor(
    label: string,
    collapsibleState: TreeItemCollapsibleState = TreeItemCollapsibleState.None,
  ) {
    this.label = label;
    this.collapsibleState = collapsibleState;
  }
}

export const window = {
  activeTextEditor: undefined as any,
  createOutputChannel: jest.fn(() => mocks.outputChannel),
  createStatusBarItem: jest.fn(() => mocks.statusBarItem),
  onDidChangeActiveTextEditor: jest.fn((listener: (e: any) => void) => {
    onDidChangeActiveTextEditorListener = listener;
    return { dispose: jest.fn() };
  }),
  registerTreeDataProvider: jest.fn((viewId: string, provider: any) => {
    mockedTreeDataProviders[viewId] = provider;
    return {
      dispose: () => {
        delete mockedTreeDataProviders[viewId];
      },
    };
  }),
  createTreeView: jest.fn(
    (viewId: string, options: { treeDataProvider: any }) => {
      mockedTreeDataProviders[viewId] = options.treeDataProvider;
      const treeView = {
        onDidChangeCheckboxState: jest.fn((listener: (e: any) => void) => {
          onDidChangeCheckboxStateListeners[viewId] = listener;
          return { dispose: jest.fn() };
        }),
        dispose: jest.fn(() => {
          delete mockedTreeViews[viewId];
          delete mockedTreeDataProviders[viewId];
          delete onDidChangeCheckboxStateListeners[viewId];
        }),
      };
      mockedTreeViews[viewId] = treeView;
      return treeView;
    },
  ),
  createWebviewPanel: jest.fn(createWebviewPanel),
  createTerminal: jest.fn(() => mocks.terminal),
  showErrorMessage: jest.fn(),
  showInformationMessage: jest.fn(),
  showOpenDialog: jest.fn(),
  showQuickPick: jest.fn(),
  showSaveDialog: jest.fn(),
};

export const workspace = {
  createFileSystemWatcher: jest.fn(() => ({
    onDidCreate: jest.fn(),
    onDidChange: jest.fn(),
    onDidDelete: jest.fn(),
    dispose: jest.fn(),
  })),
  getConfiguration: jest.fn(() => mocks.workspaceConfiguration),
  onDidChangeWorkspaceFolders: jest.fn((_: () => Promise<void>) => ({
    dispose: jest.fn(),
  })),
  onDidCloseTextDocument: jest.fn((_: () => void) => ({ dispose: jest.fn() })),
  workspaceFolders: <{ uri: Uri; index: number }[] | undefined>undefined,
};

function createWebviewPanel(
  viewType: string,
  title: string,
  _showOptions:
    | ViewColumn
    | { viewColumn: ViewColumn; preserveFocus?: boolean },
  _options?: vscode.WebviewPanelOptions & vscode.WebviewOptions,
) {
  const mocks: WebviewPanelMocks = {
    messages: [],
    panel: {
      onDidChangeViewState: () => {},
      onDidDispose: () => {},
      setVisibility: (visible) => {
        webviewPanel.visible = visible;
        mocks.panel.onDidChangeViewState({ webviewPanel: webviewPanel });
      },
      webview: {
        onDidReceiveMessage: () => {},
      },
    },
  };

  const webviewPanel: Writeable<vscode.WebviewPanel> = {
    active: true,
    dispose: jest.fn(),
    iconPath: undefined,
    onDidChangeViewState: jest.fn((onDidChangeViewState) => {
      mocks.panel.onDidChangeViewState = onDidChangeViewState;
      return { dispose: jest.fn() };
    }),
    onDidDispose: jest.fn((onDidDispose) => {
      mocks.panel.onDidDispose = onDidDispose;
      return { dispose: jest.fn() };
    }),
    options: {},
    reveal: jest.fn((_viewColumn?: ViewColumn, _preserveFocus?: boolean) => {}),
    title: title,
    visible: true,
    viewColumn: ViewColumn.One,
    viewType: viewType,
    webview: {
      asWebviewUri: jest.fn((uri: Uri) =>
        uri.with({
          scheme: "vscode-webview-resource",
          path: "file//" + uri.path.replace(/\\/g, "/"),
        }),
      ),
      cspSource: "vscode-webview-resource:",
      html: "",
      onDidReceiveMessage: jest.fn((onDidReceiveMessage) => {
        mocks.panel.webview.onDidReceiveMessage = onDidReceiveMessage;
        return { dispose: jest.fn() };
      }),
      options: {},
      postMessage: jest.fn((msg) => {
        mocks.messages.push(msg);
        return Promise.resolve(true);
      }),
    },
  };

  mockedWebviews.push({ panel: webviewPanel, mocks: mocks });
  return webviewPanel;
}

/* Utilities */

beforeEach(() => {
  jest.clearAllMocks();

  window.activeTextEditor = {
    document: {
      uri: Uri.file("/path/to/workspace-folder/active-file.txt"),
    },
    viewColumn: ViewColumn.One,
  };

  // Clear any mocked extension setting values before each test
  Object.keys(mockedExtensionSettingValues).forEach((section) => {
    delete mockedExtensionSettingValues[section];
  });
  Object.keys(mockedTreeDataProviders).forEach((viewId) => {
    delete mockedTreeDataProviders[viewId];
  });
  Object.keys(mockedTreeViews).forEach((viewId) => {
    delete mockedTreeViews[viewId];
  });
  onDidChangeCheckboxStateListeners = {};

  mockedWebviews = [];
  onDidChangeActiveTextEditorListener = null;

  version = "1.51.0";
});

export function mockExtensionSettingReturnValue(section: string, value: any) {
  mockedExtensionSettingValues[section] = value;
}

export function mockVscodeVersion(newVersion: string) {
  version = newVersion;
}

export function getMockedWebviewPanel(i: number) {
  return mockedWebviews[i];
}

export function getRegisteredTreeDataProvider(viewId: string) {
  return mockedTreeDataProviders[viewId];
}

export function getCreatedTreeView(viewId: string) {
  return mockedTreeViews[viewId];
}

export function emitOnDidChangeCheckboxState(
  viewId: string,
  items: Array<[any, TreeItemCheckboxState]>,
) {
  if (
    typeof onDidChangeCheckboxStateListeners[viewId] !== "undefined" &&
    onDidChangeCheckboxStateListeners[viewId] !== null
  ) {
    onDidChangeCheckboxStateListeners[viewId]!({ items: items });
  }
}

export function emitOnDidChangeActiveTextEditor(editor: any) {
  window.activeTextEditor = editor;
  if (onDidChangeActiveTextEditorListener !== null)
    onDidChangeActiveTextEditorListener(editor);
}
