/**
 * Public entry point for time-range-partition-splitter.
 *
 * The core implementation lives in core.js so that the public surface stays
 * trivial to audit: everything exported here is exactly what the README
 * documents.
 */
export { splitRange, splitAtBoundaries, boundariesBetween } from "./core.js";
