# dprint-plugin-shuck

A sandboxed Wasm [dprint](https://dprint.dev) plugin wrapping
[Shuck](https://github.com/ewhauser/shuck)'s Rust shell formatter (0.2.2).

## Installation

After the first release is published:

```sh
dprint add kjanat/shuck
```

For local development, run `cargo wasm` and add
`./target/wasm32-unknown-unknown/wasm-release/dprint_plugin_shuck.wasm`
to your dprint configuration's `plugins` array.

```json
{
	"shuck": {
		"useTabs": false,
		"indentWidth": 2,
		"dialect": "auto"
	},
	"plugins": ["./target/wasm32-unknown-unknown/wasm-release/dprint_plugin_shuck.wasm"]
}
```

## Configuration

See [schema.json](schema.json) for all options, descriptions, and upstream-derived
defaults. Plugin `useTabs` and `indentWidth` override dprint globals. Remaining
options mirror Shuck: `dialect`, `binaryNextLine`, `switchCaseIndent`,
`spaceRedirects`, `keepPadding`, `functionNextLine`, `neverSplit`, `simplify`,
and `minify`. Simplification and minification are opt-in upstream transformations.

Shuck infers the dialect from shebangs and file extensions, or accepts `bash`,
`posix`, `mksh`, and `zsh` explicitly. Default extensions are `sh`, `bash`, `zsh`,
`dash`, `mksh`, and `bats`. Generic `ksh` is excluded because the formatter does
not support generic Korn shell. Use dprint's additive `associations` for extensionless
scripts and dotfiles, with an explicit dialect where needed. Negated associations
remove default matches. dprint per-file `overrides` are supported.

Shuck preserves source line endings. Its public formatter options do not expose
line-ending or wrapping-width overrides, so `newLineKind` and `lineWidth` are not
mapped. No project or user Shuck configuration is read. This plugin formats
standalone shell scripts; it does not run linting or rewrite embedded shell in YAML.
Shuck 0.2.2 rejects some CRLF shell constructs, including the function fixture
covered in the tests; these upstream parse errors are propagated unchanged.
Range formatting is unsupported and returns no change. Parse errors are reported
without rewriting the input. Upstream describes its formatter CLI as experimental.

## Development

```sh
cargo test --locked
cargo fmt --all --check
cargo lint
cargo lint-wasm
cargo schema
cargo wasm
deno task e2e
```

The schema is generated from the configuration type; CI checks for drift.
The TypeScript tests run on Deno and load the compiled Wasm through
`@dprint/formatter` to check formatting, idempotence, configuration, and errors.
They also exercise the dprint CLI for associations, per-file overrides, checksum
installation, and a local config-update dry run. Deno and dprint must be installed.
To test a release artifact directly, run `deno task e2e artifact/plugin.wasm`.
The optional Wasm path is relative to the repository root.

## Releases

Push an authorized bare semver tag matching Cargo's version (for example `0.1.0`)
to run the release workflow. It tests the plugin and publishes `plugin.wasm` and
`schema.json`. Published artifacts are immutable: fixes require a new version.
The repository and first release must exist before proxy installation and public
update checks can succeed. No npm package is advertised.

## License

MIT. Shuck and bundled dependencies retain their respective licenses.
