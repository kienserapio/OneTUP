/**
 * @onetup/core — the deterministic heart of OneTUP.
 *
 * Everything here is a pure function over plain data: no network, no database,
 * no React, no model. That is deliberate. ADR-007 says any number a student
 * acts on is computed rather than generated, and keeping the computation in one
 * dependency-free package is what makes that claim testable — and what lets the
 * same parser run in the browser (paste import) and in the worker (ERS import).
 */

export * from './db'
export * from './time'
export * from './schedule/parse'
export * from './schedule/queries'
export * from './sections/parse'
export * from './classroom/tracker'
export * from './attendance/arithmetic'
export * from './grades/gwa'
export * from './grades/parse-grades'
export * from './deadlines/urgency'
export * from './commute/fares'
export * from './commute/departure'
export * from './commute/answer'
export * from './study/sm2'
export * from './suspensions/advisory'
export * from './text/simhash'
export * from './text/grounding'
