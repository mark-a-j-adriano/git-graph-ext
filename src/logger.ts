import * as vscode from "vscode";
import { Disposable } from "./utils/disposable";

const DOUBLE_QUOTE_REGEXP = /"/g;

export interface LoggerDiagnostics {
  readonly uptimeSeconds: number;
  readonly loggedLineCount: number;
  readonly errorCount: number;
  readonly spawnedGitCommandCount: number;
  readonly timedOperationCount: number;
  readonly slowOperationCount: number;
}

/**
 * Manages the Git Graph Logger, which writes log information to the Git Graph Output Channel.
 */
export class Logger extends Disposable {
  private readonly channel: vscode.OutputChannel;
  private readonly startedAt: number;
  private loggedLineCount: number = 0;
  private errorCount: number = 0;
  private spawnedGitCommandCount: number = 0;
  private timedOperationCount: number = 0;
  private slowOperationCount: number = 0;

  /**
   * Creates the Git Graph Logger.
   */
  constructor() {
    super();
    this.startedAt = Date.now();
    this.channel = vscode.window.createOutputChannel("Git Graph");
    this.registerDisposable(this.channel);
  }

  /**
   * Log a message to the Output Channel.
   * @param message The string to be logged.
   */
  public log(message: string) {
    this.loggedLineCount++;
    const date = new Date();
    const timestamp =
      date.getFullYear() +
      "-" +
      pad2(date.getMonth() + 1) +
      "-" +
      pad2(date.getDate()) +
      " " +
      pad2(date.getHours()) +
      ":" +
      pad2(date.getMinutes()) +
      ":" +
      pad2(date.getSeconds()) +
      "." +
      pad3(date.getMilliseconds());
    this.channel.appendLine("[" + timestamp + "] " + message);
  }

  /**
   * Log the execution of a spawned command to the Output Channel.
   * @param cmd The command being spawned.
   * @param args The arguments passed to the command.
   */
  public logCmd(cmd: string, args: string[]) {
    this.spawnedGitCommandCount++;
    this.log(
      "> " +
        cmd +
        " " +
        args
          .map((arg) =>
            arg === ""
              ? '""'
              : arg.startsWith("--format=")
                ? "--format=..."
                : arg.includes(" ")
                  ? '"' + arg.replace(DOUBLE_QUOTE_REGEXP, '\\"') + '"'
                  : arg,
          )
          .join(" "),
    );
  }

  /**
   * Log an error message to the Output Channel.
   * @param message The string to be logged.
   */
  public logError(message: string) {
    this.errorCount++;
    this.log("ERROR: " + message);
  }

  /**
   * Record the duration of an operation, only logging operations that exceed the provided threshold.
   * @param operation The operation being measured.
   * @param durationMs The duration in milliseconds.
   * @param slowThresholdMs The threshold above which the operation should be logged.
   * @param context Optional contextual information to include in the log entry.
   */
  public logDuration(
    operation: string,
    durationMs: number,
    slowThresholdMs: number = 250,
    context: string | null = null,
  ) {
    this.timedOperationCount++;
    if (durationMs >= slowThresholdMs) {
      this.slowOperationCount++;
      this.log(
        "SLOW: " +
          operation +
          " completed in " +
          durationMs +
          "ms" +
          (context === null ? "" : " (" + context + ")"),
      );
    }
  }

  /**
   * Show the Git Graph output channel.
   */
  public show() {
    this.channel.show(true);
  }

  /**
   * Get lightweight logger diagnostics for troubleshooting.
   */
  public getDiagnostics(): LoggerDiagnostics {
    return {
      uptimeSeconds: Math.max(
        0,
        Math.floor((Date.now() - this.startedAt) / 1000),
      ),
      loggedLineCount: this.loggedLineCount,
      errorCount: this.errorCount,
      spawnedGitCommandCount: this.spawnedGitCommandCount,
      timedOperationCount: this.timedOperationCount,
      slowOperationCount: this.slowOperationCount,
    };
  }
}

/**
 * Pad a number with a leading zero if it is less than two digits long.
 * @param n The number to be padded.
 * @returns The padded number.
 */
function pad2(n: number) {
  return (n > 9 ? "" : "0") + n;
}

/**
 * Pad a number with leading zeros if it is less than three digits long.
 * @param n The number to be padded.
 * @returns The padded number.
 */
function pad3(n: number) {
  return (n > 99 ? "" : n > 9 ? "0" : "00") + n;
}
