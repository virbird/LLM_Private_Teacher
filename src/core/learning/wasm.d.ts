declare module '*.wasm' {
  const content: Uint8Array<ArrayBuffer>;
  export default content;
}

declare module 'sql.js/dist/sql-wasm.wasm' {
  const content: Uint8Array<ArrayBuffer>;
  export default content;
}
