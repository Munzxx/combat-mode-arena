// Single source of truth for the app version.
// Scheme: bugfix = minor bump (1.0 -> 1.1), new feature = major bump (1.x -> 2.0).
// package.json must carry the same number as "<APP_VERSION>.0" (checked by tests/version.test.ts).
export const APP_VERSION = '1.0';

// Describes the SHAPE of saved data, not the feature version.
// Only bump when a saved field changes type or meaning; always add a migration.
export const SAVE_SCHEMA_VERSION = 1;
