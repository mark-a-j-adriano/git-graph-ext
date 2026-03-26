import * as vscode from "vscode";

declare module "vscode" {
  export const enum TreeItemCheckboxState {
    Unchecked = 0,
    Checked = 1,
  }

  export interface TreeCheckboxChangeEvent<T> {
    readonly items: ReadonlyArray<[T, TreeItemCheckboxState]>;
  }

  export interface TreeItem {
    checkboxState?: TreeItemCheckboxState;
  }

  export interface TreeView<T> {
    readonly onDidChangeCheckboxState: Event<TreeCheckboxChangeEvent<T>>;
  }

  export interface TreeViewOptions<T> {
    manageCheckboxStateManually?: boolean;
  }

  export namespace window {
    function createTreeView<T>(
      viewId: string,
      options: TreeViewOptions<T>,
    ): TreeView<T>;
  }
}
