/**
 * Runtime loader for sql.js (SQLite compiled to WASM).
 * The WASM binary is inlined by esbuild's `binary` loader so the plugin works
 * on Desktop and iPad without shipping extra files.
 */
import initSqlJs, { type SqlJsStatic } from 'sql.js';
// eslint-disable-next-line import/no-unresolved -- resolved by esbuild binary loader (see wasm.d.ts)
import wasmBinary from 'sql.js/dist/sql-wasm.wasm';

let cached: Promise<SqlJsStatic> | null = null;

/** Lazily initialize sql.js with the inlined WASM binary (cached singleton). */
export function loadSqlJs(): Promise<SqlJsStatic> {
  if (!cached) {
    cached = initSqlJs({ wasmBinary: wasmBinary.buffer });
  }
  return cached;
}
