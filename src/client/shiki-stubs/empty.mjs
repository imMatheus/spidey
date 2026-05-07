// Empty stub for `shiki/wasm` and the oniguruma wasm-inlined entry. Spidey-grab
// uses the JS regex engine (`preferredHighlighter: "shiki-js"`) so the WASM
// loader is reachable only behind a dead-code branch — but esbuild still
// resolves the import to find a file. This empty module satisfies the resolver
// and contributes nothing to the bundle.
export default {};
