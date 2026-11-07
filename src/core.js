/**
 * Splitting a date-time range at calendar boundaries.
 *
 * Design decisions worth stating up front, because they are the parts a
 * reader will otherwise have to reverse-engineer:
 *
 * 1. Boundaries are computed in UTC. Calendar boundaries (midnight, month
 *    start, year start) only mean something relative to a time zone, and
 *    UTC is the only time zone that is stable across machines without
 *    pulling in a database (or a dependency). Callers who need local time
 *    can shift their inputs; the library refuses to guess.
 *
 * 2. A boundary exactly equal to the start of the range is not emitted as
 *    the start of a sub-range, and a boundary exactly equal to the end is
 *    not emitted as the end. Otherwise a midnight-aligned range would come
 *    back as [start, start] followed by the real pieces. The range itself
 *    is always half-open: [start, end).
 *
 * 3. Sub-ranges are contiguous and cover [start, end) exactly. Concatenating
 *    them reproduces the input with no gaps and no overlaps.
 */

/**
 * The three granularities this library understands, ordered from finest to
 * coarsest. "day" means midnight UTC, "month" means the first of the month
 * at midnight UTC, "year" means January 1st at midnight UTC.
 */
export const GRANULARITIES = ["day", "month", "year"];

/**
 * @param {unknown} value
 * @returns {value is Date}
 */
function isDate(value) {
  return value instanceof Date;
}

/**
 * Validate a Date and reject the Invalid Date sentinel. A Date that has been
 * constructed from garbage is `instanceof Date` but has NaN time, which would
 * silently poison every comparison downstream.
 *
 * @param {unknown} value
 * @param {string} label
 * @returns {Date}
 */
function requireValidDate(value, label) {
  if (!isDate(value)) {
    throw new TypeError(`${label} must be a Date`);
  }
  if (Number.isNaN(value.getTime())) {
    throw new RangeError(`${label} must be a valid Date`);
  }
  return value;
}

/**
 * Normalise the granularity argument. Accepts a single string or an array of
 * strings; duplicates are removed while preserving first-seen order so that
 * the output ordering is predictable.
 *
 * @param {string | string[]} granularity
 * @returns {string[]}
 */
function normaliseGranularity(granularity) {
  const raw = Array.isArray(granularity) ? granularity : [granularity];
  if (raw.length === 0) {
    throw new RangeError("granularity must not be empty");
  }
  const seen = new Set();
  const out = [];
  for (const item of raw) {
    if (typeof item !== "string") {
      throw new TypeError("granularity entries must be strings");
    }
    if (!GRANULARITIES.includes(item)) {
      throw new RangeError(
        `unknown granularity ${JSON.stringify(item)}; expected one of ${GRANULARITIES.join(
          ", ",
        )}`,
      );
    }
    if (!seen.has(item)) {
      seen.add(item);
      out.push(item);
    }
  }
  return out;
}

/**
 * The next calendar boundary strictly after `date` for a single granularity.
 *
 * We use Date.UTC with explicit year/month/day rather than adding
 * milliseconds, because millisecond arithmetic does not cross month and year
 * boundaries correctly (months have different lengths).
 *
 * @param {Date} date
 * @param {string} granularity
 * @returns {Date}
 */
function nextBoundary(date, granularity) {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const day = date.getUTCDate();
  switch (granularity) {
    case "day":
      return new Date(Date.UTC(year, month, day + 1));
    case "month":
      return new Date(Date.UTC(year, month + 1, 1));
    case "year":
      return new Date(Date.UTC(year + 1, 0, 1));
    default:
      throw new RangeError(`unknown granularity ${JSON.stringify(granularity)}`);
  }
}

/**
 * All boundaries strictly inside (start, end) for the requested granularities.
 *
 * Strictly inside matters: a boundary equal to start or end is not a split
 * point, it is the edge of the range. Including it would produce zero-length
 * sub-ranges.
 *
 * @param {Date} start
 * @param {Date} end
 * @param {string[]} granularities
 * @returns {Date[]} sorted ascending, deduplicated
 */
export function boundariesBetween(start, end, granularities) {
  requireValidDate(start, "start");
  requireValidDate(end, "end");
  const startMs = start.getTime();
  const endMs = end.getTime();
  if (startMs >= endMs) {
    return [];
  }

  const seen = new Set();
  const points = [];
  for (const granularity of granularities) {
    // Walk forward from the first boundary strictly after start. Starting
    // from start itself and stepping would emit start when start happens to
    // be aligned, which we do not want.
    let cursor = nextBoundary(start, granularity);
    // The loop is bounded by the range length: every step advances by at
    // least one day, so the number of iterations is finite.
    while (cursor.getTime() < endMs) {
      const ms = cursor.getTime();
      if (!seen.has(ms)) {
        seen.add(ms);
        points.push(cursor);
      }
      cursor = nextBoundary(cursor, granularity);
    }
  }

  points.sort((a, b) => a.getTime() - b.getTime());
  return points;
}

/**
 * Split [start, end) at every calendar boundary of the given granularities.
 *
 * @param {Date} start inclusive
 * @param {Date} end exclusive
 * @param {string | string[]} granularity one or more of "day", "month", "year"
 * @returns {Array<{start: Date, end: Date}>}
 */
export function splitRange(start, end, granularity) {
  requireValidDate(start, "start");
  requireValidDate(end, "end");
  const granularities = normaliseGranularity(granularity);
  const startMs = start.getTime();
  const endMs = end.getTime();
  if (startMs > endMs) {
    throw new RangeError("start must not be after end");
  }
  if (startMs === endMs) {
    return [];
  }

  const boundaries = boundariesBetween(start, end, granularities);
  const pieces = [];
  let cursor = startMs;
  for (const boundary of boundaries) {
    const ms = boundary.getTime();
    pieces.push({ start: new Date(cursor), end: new Date(ms) });
    cursor = ms;
  }
  pieces.push({ start: new Date(cursor), end: new Date(endMs) });
  return pieces;
}

/**
 * Convenience alias kept for callers who prefer the verb-first spelling.
 *
 * @param {Date} start
 * @param {Date} end
 * @param {string | string[]} granularity
 * @returns {Array<{start: Date, end: Date}>}
 */
export function splitAtBoundaries(start, end, granularity) {
  return splitRange(start, end, granularity);
}
