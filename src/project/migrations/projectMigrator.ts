/**
 * ReelForge Studio — Project Migrator
 *
 * Handles schema version migrations across project revisions.
 *
 * Guarantees:
 *   - Never silently discards unknown properties or fields.
 *   - Rejects unsupported future versions with explicit, actionable error messages.
 *   - Validates data post-migration to ensure integrity before returning.
 */

import { CURRENT_SCHEMA_VERSION, type Project, FRAME_RATES, DEFAULT_EXPORT_SETTINGS } from '../schema/types';
import { validateProject } from '../serialization/projectSerializer';

export class MigrationError extends Error {
  constructor(message: string, public readonly details?: unknown) {
    super(message);
    this.name = 'MigrationError';
  }
}

/**
 * Migrate project data from sourceVersion to targetVersion.
 */
export function migrateProject(
  data: unknown,
  sourceVersion: number,
  targetVersion: number = CURRENT_SCHEMA_VERSION,
): Project {
  if (typeof data !== 'object' || data === null) {
    throw new MigrationError('Cannot migrate null or non-object project data');
  }

  if (sourceVersion > CURRENT_SCHEMA_VERSION) {
    throw new MigrationError(
      `Cannot open project with schema version ${sourceVersion}. ` +
      `This version of ReelForge Studio only supports schema versions up to ${CURRENT_SCHEMA_VERSION}. ` +
      `Please update ReelForge Studio to open this project.`
    );
  }

  if (targetVersion > CURRENT_SCHEMA_VERSION) {
    throw new MigrationError(`Target schema version ${targetVersion} is not supported by this engine.`);
  }

  if (sourceVersion > targetVersion) {
    throw new MigrationError(
      `Downgrading project schema from version ${sourceVersion} to ${targetVersion} is not supported.`
    );
  }

  let currentData: Record<string, unknown> = { ...(data as Record<string, unknown>) };
  let currentVer = sourceVersion;

  // Migration step: 0 (prototype/unversioned) -> 1
  if (currentVer === 0 && targetVersion >= 1) {
    currentData = migrateV0ToV1(currentData);
    currentVer = 1;
  }

  // If in the future we add v1 -> v2, it would be plugged in here:
  // if (currentVer === 1 && targetVersion >= 2) { currentData = migrateV1ToV2(currentData); currentVer = 2; }

  // Validate the resulting project against target schema
  const validation = validateProject(currentData);
  if (!validation.success) {
    throw new MigrationError(
      `Project migration failed validation against schema version ${targetVersion}:\n${validation.errors.join('\n')}`,
      validation.errors
    );
  }

  return validation.project;
}

/**
 * Migration helper from early prototype / v0 format to standard v1 schema.
 */
function migrateV0ToV1(raw: Record<string, unknown>): Record<string, unknown> {
  const migrated: Record<string, unknown> = { ...raw };

  migrated.schemaVersion = 1;

  if (!migrated.exportDefaults) {
    migrated.exportDefaults = DEFAULT_EXPORT_SETTINGS;
  }

  if (!migrated.defaultFrameRate) {
    migrated.defaultFrameRate = FRAME_RATES.FPS_30;
  }

  if (!migrated.defaultCanvas) {
    migrated.defaultCanvas = { width: 1920, height: 1080 };
  }

  if (!migrated.assetRegistry) {
    migrated.assetRegistry = {};
  }

  if (!migrated.metadata) {
    migrated.metadata = {};
  }

  return migrated;
}
