# Contributing

## Development

Install Rust through rustup and mise, then run `mise install` for the development
tools. The repository's
[rust-toolchain.toml](rust-toolchain.toml) selects the Rust toolchain and Wasm
target.

```sh
cargo test --locked
cargo fmt --all --check
cargo lint
cargo lint-wasm
cargo schema
mise run wasm
mise run e2e
deno task test-cli
```

`cargo wasm` selects the Wasm target and release profile through its Cargo alias.
The Cargo configuration also enables path trimming for that profile.
`mise run build-wasm` invokes the `wasm-json` alias and stages the compiler-reported
artifact at `target/artifacts/plugin.wasm`. `mise run wasm` then runs Binaryen's
`wasm-opt -O3`, producing `plugin.wasm` in the repository root and regenerating
the schema. `mise run e2e` builds and tests that optimized plugin. `cargo wasm`
remains available to build the compiler output without staging or optimizing it.

The Wasm alias selects only the `cdylib` output to preserve fat LTO. Cargo's
`rustc` command does not copy artifacts to `build.artifact-dir`, so the staging
helper copies the path reported by Cargo instead.

The helper provides `--help`, `--json`, and `--quiet`. Pass additional Cargo
options after `--`:

```sh
./scripts/build-wasm.ts target/artifacts/plugin.wasm -- --offline
```

To use a local build, add `./plugin.wasm` to your dprint configuration's `plugins`
array in place of the published plugin URL.

`mise run schema:gen` regenerates `schema.json` from the configuration type using
the host target. CI checks
that the generated schema matches the checked-in file.

The Deno tests load the Wasm through `@dprint/formatter` and exercise the dprint
CLI. They cover formatting, idempotence, configuration, errors, file matching,
per-file overrides, checksum installation, and config updates. To test a
downloaded artifact, run `deno task e2e --wasm-path artifact/plugin.wasm`; paths
are relative to the repository root. `--wasm-path` takes precedence over
`WASM_PATH`, which takes precedence over the default `plugin.wasm`.

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
