# dprint-plugin-shuck

A [dprint](https://dprint.dev) plugin for formatting shell scripts with
[Shuck](https://github.com/ewhauser/shuck). The formatter runs inside dprint's
WebAssembly sandbox; no separate Shuck executable is needed.

## Installation

Add the plugin to your dprint configuration:

```sh
dprint add kjanat/shuck
```

Format your files, or check their formatting without modifying them:

```sh
dprint fmt
dprint check
```

To update the plugin, run `dprint config update`. Each release's notes include
its bundled Shuck version and a URL for pinning that plugin version.

## Configuration

Add a `shuck` section to your existing dprint configuration, keeping the
`plugins` entry installed by `dprint add`:

```jsonc
{
  "shuck": {
    "useTabs": false,
    "indentWidth": 2,
    "dialect": "auto"
  }
}
```

All options are optional. `useTabs` and `indentWidth` inherit dprint's global
settings unless overridden in `shuck`; otherwise, Shuck's defaults apply.
See [schema.json](schema.json) for the full option descriptions and defaults.

| Option             | Purpose                                                                                       |
| ------------------ | --------------------------------------------------------------------------------------------- |
| `dialect`          | Infer from the shebang and filename with `auto`, or select `bash`, `posix`, `mksh`, or `zsh`. |
| `useTabs`          | Use tabs for indentation.                                                                     |
| `indentWidth`      | Set the number of spaces per indent, from 1 to 255.                                           |
| `binaryNextLine`   | Place binary operators at the start of continuation lines.                                    |
| `switchCaseIndent` | Indent case branch bodies.                                                                    |
| `spaceRedirects`   | Insert spaces around redirection operators.                                                   |
| `keepPadding`      | Preserve safe horizontal padding.                                                             |
| `functionNextLine` | Place function opening braces on a new line.                                                  |
| `neverSplit`       | Prefer compact layouts.                                                                       |
| `simplify`         | Apply Shuck's shell syntax simplifications.                                                   |
| `minify`           | Minify output and enable simplifications.                                                     |

Simplification and minification are opt-in. The plugin reads its settings from
dprint; it does not load Shuck project or user configuration files.

### File matching

The plugin matches `.sh`, `.bash`, `.zsh`, `.dash`, `.mksh`, and `.bats` files
by default. Use dprint's `associations` setting to include extensionless scripts
and dotfiles, or negated associations to exclude default matches. Per-file
`overrides` can select a dialect or other formatting options for specific files.

Generic `.ksh` files are not matched because Shuck does not support generic Korn
shell syntax. Select `mksh` explicitly for compatible scripts when needed.

### Limitations

The plugin formats standalone shell scripts. It does not run Shuck's linter or
format shell embedded in YAML. Range formatting leaves the file unchanged.

Shuck preserves source line endings; the plugin does not map dprint's
`newLineKind` or `lineWidth` settings. Some CRLF constructs produce upstream
parse errors, which are reported without rewriting the input.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development, testing, and release instructions.

## License

[MIT](LICENSE).
