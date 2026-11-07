# time-range-partition-splitter

Splits a half-open date-time range `[start, end)` at UTC calendar boundaries
(midnight, first of month, January 1st) into contiguous sub-ranges.

```js
import { splitRange } from "time-range-partition-splitter";

const start = new Date("2024-03-10T22:00:00.000Z");
const end = new Date("2024-03-12T03:00:00.000Z");

splitRange(start, end, "day");
// [
//   { start: 2024-03-10T22:00:00.000Z, end: 2024-03-11T00:00:00.000Z },
//   { start: 2024-03-11T00:00:00.000Z, end: 2024-03-12T00:00:00.000Z },
//   { start: 2024-03-12T00:00:00.000Z, end: 2024-03-12T03:00:00.000Z },
// ]
```

## Why this exists

Given a range, you often want per-day, per-month or per-year buckets that
line up with the calendar rather than with the range's start. Doing that by
hand means stepping month by month, getting the leap years right, and
remembering not to emit a zero-length bucket when the range already starts on
a boundary. This library does that one job.

The trade-off: boundaries are computed in UTC. Local-time boundaries would
require a time-zone database, which is a dependency this library will not
take. If you need local midnight, shift your inputs before calling and shift
the results back.

## API

### `splitRange(start, end, granularity)`

Returns an array of `{ start, end }` objects covering `[start, end)` exactly.
`granularity` is `"day"`, `"month"`, `"year"`, or an array of those. Duplicates
in the array are ignored. An empty range returns `[]`; an inverted range
throws a `RangeError`.

### `splitAtBoundaries(start, end, granularity)`

Alias of `splitRange`.

### `boundariesBetween(start, end, granularities)`

Returns the boundary `Date`s strictly between `start` and `end`, sorted and
deduplicated. Useful when you only need the cut points.

### `GRANULARITIES`

`["day", "month", "year"]`.

## The edge to watch for

A boundary equal to `start` or to `end` is not a split point — it is an edge.
So `splitRange(midnight, midnightPlusTwoDays, "day")` returns two pieces, not
three, and never a zero-length one. The range is half-open throughout: `end`
is exclusive.

## Tests

```
node --test
```
