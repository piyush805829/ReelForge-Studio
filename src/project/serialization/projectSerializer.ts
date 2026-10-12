/**
 * ReelForge Studio — Project Serialization & Validation
 *
 * Implements deterministic JSON serialization, runtime validation, and
 * deserialization for ReelForge Studio project files (.rfproj / .json).
 *
 * Guarantees:
 *   - Deterministic key ordering for stable Git/file diffs.
 *   - Strips non-authoritative transient state (drag previews, selections, etc.).
 *   - Preserves integer tick precision without conversion drift.
 *   - Returns clear, actionable validation error paths.
 */

import type { Project } from '../schema/types';
import { projectSchema } from './projectSchema';

export interface ValidationSuccess {
  readonly success: true;
  readonly project: Project;
}

export interface ValidationFailure {
  readonly success: false;
  readonly errors: ReadonlyArray<string>;
}

export type ValidationResult = ValidationSuccess | ValidationFailure;

/**
 * Recursively sort object keys alphabetically to ensure deterministic serialization.
 * Arrays preserve their order. Primitives remain unchanged.
 */
export function sortKeysDeterministically(value: unknown): unknown {
  if (value === null || typeof value !== 'object') {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(sortKeysDeterministically);
  }

  const sortedObj: Record<string, unknown> = {};
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();

  for (const key of keys) {
    const val = record[key];
    if (val !== undefined) {
      sortedObj[key] = sortKeysDeterministically(val);
    }
  }

  return sortedObj;
}

/**
 * Deterministically stringify a JavaScript object with sorted keys and 2-space indentation.
 */
export function deterministicStringify(value: unknown, indent = 2): string {
  const sorted = sortKeysDeterministically(value);
  return JSON.stringify(sorted, null, indent);
}

/**
 * Extract authoritative project data only, omitting transient UI state.
 */
export function extractAuthoritativeProject(project: Project): Project {
  return {
    schemaVersion: project.schemaVersion,
    id: project.id,
    name: project.name,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    projectFilePath: project.projectFilePath,
    compositionRegistry: project.compositionRegistry,
    mainCompositionId: project.mainCompositionId,
    assetRegistry: project.assetRegistry,
    defaultFrameRate: project.defaultFrameRate,
    defaultCanvas: project.defaultCanvas,
    exportDefaults: project.exportDefaults,
    metadata: project.metadata || {},
  };
}

/**
 * Serialize a Project into a deterministic JSON string.
 */
export function serializeProject(project: Project): string {
  const cleanProject = extractAuthoritativeProject(project);
  return deterministicStringify(cleanProject, 2);
}

/**
 * Validate an unknown data object against the ReelForge Project schema.
 * Returns detailed, user-friendly error messages if invalid.
 */
export function validateProject(data: unknown): ValidationResult {
  const parseResult = projectSchema.safeParse(data);

  if (!parseResult.success) {
    const formattedErrors = parseResult.error.issues.map(issue => {
      const pathStr = issue.path.length > 0 ? issue.path.join('.') : 'root';
      return `[${pathStr}]: ${issue.message}`;
    });
    return {
      success: false,
      errors: formattedErrors,
    };
  }

  return {
    success: true,
    project: parseResult.data as unknown as Project,
  };
}

/**
 * Deserialize and validate a JSON string into a Project instance.
 * Handles malformed JSON strings gracefully without throwing unhandled exceptions.
 */
export function deserializeProject(jsonString: string): ValidationResult {
  if (typeof jsonString !== 'string' || jsonString.trim().length === 0) {
    return {
      success: false,
      errors: ['Project data is empty or not a string.'],
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonString);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      errors: [`Malformed JSON syntax: ${msg}`],
    };
  }

  return validateProject(parsed);
}
