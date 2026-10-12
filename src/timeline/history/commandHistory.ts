/**
 * ReelForge Studio — Command History (Undo/Redo)
 *
 * Implements a linear command history with undo and redo stacks.
 * Works with Immer: each command takes a ProjectDraft and produces a new Project.
 *
 * Design:
 *   - History stores snapshots of the Project before/after each command.
 *   - Undo restores the "before" snapshot.
 *   - Redo re-applies the "after" snapshot.
 *   - New commands clear the redo stack.
 *   - History is bounded to MAX_HISTORY_SIZE to prevent unbounded memory.
 */

import { produce } from 'immer';
import type { Project } from '../../project/schema/types';
import type { ProjectDraft, CommandResult } from '../commands/timelineCommands';

const MAX_HISTORY_SIZE = 200;

export type CommandFn<T = unknown> = (draft: ProjectDraft) => CommandResult<T>;

export interface HistoryEntry {
  readonly commandName: string;
  readonly stateBefore: Project;
  readonly stateAfter: Project;
}

export class CommandHistory {
  private undoStack: HistoryEntry[] = [];
  private redoStack: HistoryEntry[] = [];

  /** Current project state */
  private _current: Project;

  constructor(initialProject: Project) {
    this._current = initialProject;
  }

  get current(): Project {
    return this._current;
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  get undoLabel(): string | undefined {
    return this.undoStack.at(-1)?.commandName;
  }

  get redoLabel(): string | undefined {
    return this.redoStack.at(-1)?.commandName;
  }

  /**
   * Execute a command against the current project state.
   * If the command fails, the project is unchanged and no history entry is added.
   */
  execute<T = unknown>(commandName: string, fn: CommandFn<T>): CommandResult<T> {
    const stateBefore = this._current;
    let result!: CommandResult<T>;

    let stateAfter: Project;
    try {
      stateAfter = produce(stateBefore, (draft: ProjectDraft) => {
        result = fn(draft);
        if (!result.ok) {
          // Throwing in an Immer producer discards changes
          throw new Error('COMMAND_FAILED');
        }
      });
    } catch (err) {
      if (err instanceof Error && err.message === 'COMMAND_FAILED') {
        return result;
      }
      throw err;
    }

    if (!result.ok) {
      return result;
    }

    this._current = stateAfter;
    this.redoStack = [];

    const entry: HistoryEntry = { commandName, stateBefore, stateAfter };
    this.undoStack.push(entry);
    if (this.undoStack.length > MAX_HISTORY_SIZE) {
      this.undoStack.shift();
    }

    return result;
  }

  undo(): boolean {
    const entry = this.undoStack.pop();
    if (!entry) return false;
    this.redoStack.push(entry);
    this._current = entry.stateBefore;
    return true;
  }

  redo(): boolean {
    const entry = this.redoStack.pop();
    if (!entry) return false;
    this.undoStack.push(entry);
    this._current = entry.stateAfter;
    return true;
  }

  /**
   * Replace the current project state without recording a history entry.
   * Use only for loading a project from disk or recovery.
   */
  replaceWithoutHistory(project: Project): void {
    this._current = project;
    this.undoStack = [];
    this.redoStack = [];
  }

  /**
   * Clear all history.
   */
  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
  }

  /** For debugging: return a log of command names in undo stack */
  debugUndoLog(): string[] {
    return this.undoStack.map(e => e.commandName);
  }
}
