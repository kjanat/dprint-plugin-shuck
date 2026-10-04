# Contributing

## Development

Install Rust through rustup, Deno, and dprint. The repository's
[rust-toolchain.toml](rust-toolchain.toml) selects the Rust toolchain and Wasm
target.

```sh
cargo test --locked
cargo fmt --all --check
cargo lint
cargo lint-wasm
cargo schema
deno task wasm
deno task e2e plugin.wasm
```

`deno task wasm` builds with fat LTO and runs Binaryen's `wasm-opt -Oz`, producing
`plugin.wasm` in the repository root. Binaryen runs through Deno at the pinned
version; no separate native installation is required. `cargo wasm` produces the
compiler output without running Binaryen.

To use a local build, add `./plugin.wasm` to your dprint configuration's `plugins`
array in place of the published plugin URL.

`cargo schema` regenerates `schema.json` from the configuration type. CI checks
that the generated schema matches the checked-in file.

The Deno tests load the Wasm through `@dprint/formatter` and exercise the dprint
CLI. They cover formatting, idempotence, configuration, errors, file matching,
per-file overrides, checksum installation, and config updates. To test a
downloaded artifact, run `deno task e2e artifact/plugin.wasm`; paths are relative
to the repository root.

## Releases

Release tags use the plugin's Cargo version without a `v` prefix. The release
workflow is configured to run CI and publish `plugin.wasm` and `schema.json`.

Release notes are generated from the built plugin, schema, and `Cargo.lock`.
They include installation instructions, a versioned plugin URL, the bundled
Shuck version, supported extensions, and artifact size. GitHub adds the changelog.

To preview the notes, place `plugin.wasm` and `schema.json` in a directory and run:

```sh
deno task release-notes path/to/directory
```

This writes `release-notes.md` into that directory. Changes to published artifacts
require a new release version.
