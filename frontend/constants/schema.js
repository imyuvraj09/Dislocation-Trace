/**
 * Bump this whenever the shape of a persisted Project (see models/project.js)
 * changes in a way old save files won't already match -- then add a branch
 * in services/serializer.js's migrateProject() to upgrade old files on open.
 *
 * v1 -> v2 (Phase 2): `project.images` gained a real Image Workspace
 * registry (`byId` / `categories` / `activeImageId`) and dropped the old
 * flat `detected` array. See migrateProject() in services/serializer.js.
 *
 * v2 -> v3 (Image Workspace stabilization): the Image model gained `path`
 * / `calibration` / `statistics` / `cache`, and the Layer model renamed
 * `kind` -> `type` and `order` -> `zIndex` while adding `opacity` /
 * `blendMode`. See migrateV2ToV3() in services/serializer.js.
 *
 * v3 -> v4 (stale-result tracking): `project.pipeline` gained
 * `staleStages` (stage ids whose results were computed from since-changed
 * upstream input -- see constants/pipeline.js's STAGE_DEPENDENCIES). See
 * migrateV3ToV4() in services/serializer.js.
 *
 * v4 -> v5 (experimental g.b workflow): the Project gained a top-level
 * `material` bucket (`{ id }` -- see models/project.js), and Stage 7's
 * data shape replaced manually-entered `burgers`/`classifications` with
 * `gbObservations` (experimental g.b records + solver-derived candidate
 * and resolved Burgers vectors per pair -- see models/stage.js). See
 * migrateV4ToV5() in services/serializer.js.
 *
 * v5 -> v6 (non-cubic geometry): `project.material` gained `cOverA`,
 * entered by the user for tetragonal and HCP coordinate conversion.
 */
export const SCHEMA_VERSION = 6;
