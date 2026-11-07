import test from "node:test";
import assert from "node:assert/strict";

import {
  GRANULARITIES,
  boundariesBetween,
  splitAtBoundaries,
  splitRange,
} from "../src/core.js";

/**
 * Build a UTC Date from parts. Using Date.UTC everywhere keeps the tests
 * independent of the machine's local time zone, which is the usual reason a
 * suite like this passes locally and fails in CI.
 */
function utc(year, month, day, hour = 0, minute = 0, second = 0, ms = 0) {
  return new Date(Date.UTC(year, month - 1, day, hour, minute, second, ms));
}

function iso(date) {
  return date.toISOString();
}

function asIso(range) {
  return { start: iso(range.start), end: iso(range.end) };
}

test("GRANULARITIES lists the three supported values in order", () => {
  assert.deepEqual(GRANULARITIES, ["day", "month", "year"]);
});

test("splitRange on a range fully inside one day returns a single piece", () => {
  const pieces = splitRange(utc(2024, 3, 10, 9), utc(2024, 3, 10, 17), "day");
  assert.deepEqual(pieces.map(asIso), [
    { start: "2024-03-10T09:00:00.000Z", end: "2024-03-10T17:00:00.000Z" },
  ]);
});

test("splitRange at midnight boundaries produces contiguous day pieces", () => {
  const pieces = splitRange(utc(2024, 3, 10, 22), utc(2024, 3, 12, 3), "day");
  assert.deepEqual(pieces.map(asIso), [
    { start: "2024-03-10T22:00:00.000Z", end: "2024-03-11T00:00:00.000Z" },
    { start: "2024-03-11T00:00:00.000Z", end: "2024-03-12T00:00:00.000Z" },
    { start: "2024-03-12T00:00:00.000Z", end: "2024-03-12T03:00:00.000Z" },
  ]);
});

test("a midnight-aligned start is not emitted as a zero-length piece", () => {
  const pieces = splitRange(utc(2024, 3, 11), utc(2024, 3, 13), "day");
  assert.deepEqual(pieces.map(asIso), [
    { start: "2024-03-11T00:00:00.000Z", end: "2024-03-12T00:00:00.000Z" },
    { start: "2024-03-12T00:00:00.000Z", end: "2024-03-13T00:00:00.000Z" },
  ]);
});

test("month granularity splits at the first of each month", () => {
  const pieces = splitRange(utc(2024, 1, 15, 12), utc(2024, 3, 2), "month");
  assert.deepEqual(pieces.map(asIso), [
    { start: "2024-01-15T12:00:00.000Z", end: "2024-02-01T00:00:00.000Z" },
    { start: "2024-02-01T00:00:00.000Z", end: "2024-03-01T00:00:00.000Z" },
    { start: "2024-03-01T00:00:00.000Z", end: "2024-03-02T00:00:00.000Z" },
  ]);
});

test("year granularity splits at January 1st", () => {
  const pieces = splitRange(utc(2022, 6, 1), utc(2024, 2, 1), "year");
  assert.deepEqual(pieces.map(asIso), [
    { start: "2022-06-01T00:00:00.000Z", end: "2023-01-01T00:00:00.000Z" },
    { start: "2023-01-01T00:00:00.000Z", end: "2024-01-01T00:00:00.000Z" },
    { start: "2024-01-01T00:00:00.000Z", end: "2024-02-01T00:00:00.000Z" },
  ]);
});

test("combining day and month deduplicates shared boundaries", () => {
  const pieces = splitRange(utc(2024, 1, 31, 12), utc(2024, 2, 2), ["day", "month"]);
  assert.deepEqual(pieces.map(asIso), [
    { start: "2024-01-31T12:00:00.000Z", end: "2024-02-01T00:00:00.000Z" },
    { start: "2024-02-01T00:00:00.000Z", end: "2024-02-02T00:00:00.000Z" },
  ]);
});

test("combining day, month and year keeps every distinct boundary once", () => {
  const pieces = splitRange(utc(2023, 12, 31, 6), utc(2024, 1, 2), [
    "year",
    "day",
    "month",
  ]);
  assert.deepEqual(pieces.map(asIso), [
    { start: "2023-12-31T06:00:00.000Z", end: "2024-01-01T00:00:00.000Z" },
    { start: "2024-01-01T00:00:00.000Z", end: "2024-01-02T00:00:00.000Z" },
  ]);
});

test("a leap day is a normal day boundary", () => {
  const pieces = splitRange(utc(2024, 2, 28, 12), utc(2024, 3, 1), "day");
  assert.deepEqual(pieces.map(asIso), [
    { start: "2024-02-28T12:00:00.000Z", end: "2024-02-29T00:00:00.000Z" },
    { start: "2024-02-29T00:00:00.000Z", end: "2024-03-01T00:00:00.000Z" },
  ]);
});

test("an empty range yields no pieces", () => {
  assert.deepEqual(splitRange(utc(2024, 5, 1), utc(2024, 5, 1), "day"), []);
});

test("an inverted range throws a RangeError", () => {
  assert.throws(
    () => splitRange(utc(2024, 5, 2), utc(2024, 5, 1), "day"),
    RangeError,
  );
});

test("sub-ranges are contiguous and reproduce the input", () => {
  const start = utc(2023, 11, 15, 8, 30);
  const end = utc(2024, 2, 3, 4, 15);
  const pieces = splitRange(start, end, ["day", "month", "year"]);
  assert.equal(pieces[0].start.getTime(), start.getTime());
  assert.equal(pieces[pieces.length - 1].end.getTime(), end.getTime());
  for (let i = 1; i < pieces.length; i += 1) {
    assert.equal(pieces[i - 1].end.getTime(), pieces[i].start.getTime());
  }
  for (const piece of pieces) {
    assert.ok(piece.start.getTime() < piece.end.getTime());
  }
});

test("boundariesBetween returns only strictly interior boundaries", () => {
  const start = utc(2024, 3, 11);
  const end = utc(2024, 3, 14);
  const points = boundariesBetween(start, end, ["day"]);
  assert.deepEqual(points.map(iso), [
    "2024-03-12T00:00:00.000Z",
    "2024-03-13T00:00:00.000Z",
  ]);
});

test("boundariesBetween returns an empty array for an empty range", () => {
  assert.deepEqual(boundariesBetween(utc(2024, 3, 11), utc(2024, 3, 11), ["day"]), []);
});

test("splitAtBoundaries is an alias of splitRange", () => {
  const a = splitRange(utc(2024, 1, 1, 6), utc(2024, 1, 2, 6), "day");
  const b = splitAtBoundaries(utc(2024, 1, 1, 6), utc(2024, 1, 2, 6), "day");
  assert.deepEqual(a.map(asIso), b.map(asIso));
});

test("non-Date arguments are rejected", () => {
  assert.throws(() => splitRange("2024-01-01", new Date(), "day"), TypeError);
  assert.throws(() => splitRange(new Date(), 42, "day"), TypeError);
});

test("an Invalid Date is rejected", () => {
  assert.throws(() => splitRange(new Date(NaN), utc(2024, 1, 2), "day"), RangeError);
});

test("unknown granularities are rejected", () => {
  assert.throws(() => splitRange(utc(2024, 1, 1), utc(2024, 1, 2), "week"), RangeError);
});

test("an empty granularity array is rejected", () => {
  assert.throws(() => splitRange(utc(2024, 1, 1), utc(2024, 1, 2), []), RangeError);
});

test("duplicate granularities do not duplicate boundaries", () => {
  const pieces = splitRange(utc(2024, 1, 1, 12), utc(2024, 1, 3), ["day", "day"]);
  assert.deepEqual(pieces.map(asIso), [
    { start: "2024-01-01T12:00:00.000Z", end: "2024-01-02T00:00:00.000Z" },
    { start: "2024-01-02T00:00:00.000Z", end: "2024-01-03T00:00:00.000Z" },
  ]);
});
