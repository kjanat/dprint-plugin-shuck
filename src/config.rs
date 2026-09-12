use dprint_core::configuration::{
    ConfigKeyMap, ConfigurationDiagnostic, GlobalConfiguration, get_unknown_property_diagnostics,
    get_value,
};
use dprint_core::plugins::{FileMatchingInfo, PluginResolveConfigurationResult};
use serde::{Deserialize, Serialize};
use shuck_formatter::{IndentStyle, ShellDialect, ShellFormatOptions};

/// Shell dialect selection. Auto delegates filename and shebang inference to Shuck.
#[derive(Clone, Copy, Debug, Deserialize, Serialize)]
#[cfg_attr(feature = "schema", derive(schemars::JsonSchema))]
#[serde(rename_all = "camelCase")]
pub enum Dialect {
    /// Infer from the shebang and file extension.
    Auto,
    /// Bash shell syntax.
    Bash,
    /// POSIX shell syntax.
    Posix,
    /// `MirBSD` Korn shell syntax.
    Mksh,
    /// Z shell syntax.
    Zsh,
}
impl Dialect {
    const fn map(self) -> ShellDialect {
        match self {
            Self::Auto => ShellDialect::Auto,
            Self::Bash => ShellDialect::Bash,
            Self::Posix => ShellDialect::Posix,
            Self::Mksh => ShellDialect::Mksh,
            Self::Zsh => ShellDialect::Zsh,
        }
    }
    const fn unmap(value: ShellDialect) -> Self {
        match value {
            ShellDialect::Auto => Self::Auto,
            ShellDialect::Bash => Self::Bash,
            ShellDialect::Posix => Self::Posix,
            ShellDialect::Mksh => Self::Mksh,
            ShellDialect::Zsh => Self::Zsh,
        }
    }
}
impl std::str::FromStr for Dialect {
    type Err = String;
    fn from_str(value: &str) -> Result<Self, Self::Err> {
        match value {
            "auto" => Ok(Self::Auto),
            "bash" => Ok(Self::Bash),
            "posix" => Ok(Self::Posix),
            "mksh" => Ok(Self::Mksh),
            "zsh" => Ok(Self::Zsh),
            _ => Err("Expected auto, bash, posix, mksh, or zsh.".into()),
        }
    }
}

/// Shuck formatting options. Plugin values override inherited global indentation.
#[allow(
    clippy::struct_excessive_bools,
    reason = "Mirrors independent upstream formatter switches"
)]
#[derive(Clone, Debug, Deserialize, Serialize)]
#[cfg_attr(feature = "schema", derive(schemars::JsonSchema))]
#[serde(rename_all = "camelCase", default, deny_unknown_fields)]
pub struct Configuration {
    /// Shell dialect; auto uses Shuck's shebang and extension inference.
    pub dialect: Dialect,
    /// Use tabs for indentation; inherits the global useTabs setting.
    pub use_tabs: bool,
    /// Spaces per indent, from 1 to 255; inherits global indentWidth.
    #[cfg_attr(feature = "schema", schemars(range(min = 1, max = 255)))]
    pub indent_width: u8,
    /// Place binary operators at the start of continuation lines.
    pub binary_next_line: bool,
    /// Indent case branch bodies.
    pub switch_case_indent: bool,
    /// Insert spaces around redirection operators.
    pub space_redirects: bool,
    /// Preserve safe horizontal padding.
    pub keep_padding: bool,
    /// Place function opening braces on a new line.
    pub function_next_line: bool,
    /// Prefer compact layouts.
    pub never_split: bool,
    /// Apply upstream shell syntax simplifications.
    pub simplify: bool,
    /// Minify output; also enables upstream simplifications.
    pub minify: bool,
}
impl Default for Configuration {
    fn default() -> Self {
        let defaults = ShellFormatOptions::default();
        Self {
            dialect: Dialect::unmap(defaults.dialect()),
            use_tabs: matches!(defaults.indent_style(), IndentStyle::Tab),
            indent_width: defaults.indent_width(),
            binary_next_line: defaults.binary_next_line(),
            switch_case_indent: defaults.switch_case_indent(),
            space_redirects: defaults.space_redirects(),
            keep_padding: defaults.keep_padding(),
            function_next_line: defaults.function_next_line(),
            never_split: defaults.never_split(),
            simplify: defaults.simplify(),
            minify: defaults.minify(),
        }
    }
}
impl Configuration {
    pub(crate) fn options(&self) -> ShellFormatOptions {
        ShellFormatOptions::default()
            .with_dialect(self.dialect.map())
            .with_indent_style(if self.use_tabs {
                IndentStyle::Tab
            } else {
                IndentStyle::Space
            })
            .with_indent_width(self.indent_width)
            .with_binary_next_line(self.binary_next_line)
            .with_switch_case_indent(self.switch_case_indent)
            .with_space_redirects(self.space_redirects)
            .with_keep_padding(self.keep_padding)
            .with_function_next_line(self.function_next_line)
            .with_never_split(self.never_split)
            .with_simplify(self.simplify)
            .with_minify(self.minify)
    }
}

pub(crate) fn resolve_config(
    mut config: ConfigKeyMap,
    global: &GlobalConfiguration,
) -> PluginResolveConfigurationResult<Configuration> {
    let defaults = Configuration::default();
    let mut diagnostics = Vec::new();
    let mut resolved = Configuration {
        dialect: get_value(&mut config, "dialect", defaults.dialect, &mut diagnostics),
        use_tabs: get_value(
            &mut config,
            "useTabs",
            global.use_tabs.unwrap_or(defaults.use_tabs),
            &mut diagnostics,
        ),
        indent_width: get_value(
            &mut config,
            "indentWidth",
            global.indent_width.unwrap_or(defaults.indent_width),
            &mut diagnostics,
        ),
        binary_next_line: get_value(
            &mut config,
            "binaryNextLine",
            defaults.binary_next_line,
            &mut diagnostics,
        ),
        switch_case_indent: get_value(
            &mut config,
            "switchCaseIndent",
            defaults.switch_case_indent,
            &mut diagnostics,
        ),
        space_redirects: get_value(
            &mut config,
            "spaceRedirects",
            defaults.space_redirects,
            &mut diagnostics,
        ),
        keep_padding: get_value(
            &mut config,
            "keepPadding",
            defaults.keep_padding,
            &mut diagnostics,
        ),
        function_next_line: get_value(
            &mut config,
            "functionNextLine",
            defaults.function_next_line,
            &mut diagnostics,
        ),
        never_split: get_value(
            &mut config,
            "neverSplit",
            defaults.never_split,
            &mut diagnostics,
        ),
        simplify: get_value(&mut config, "simplify", defaults.simplify, &mut diagnostics),
        minify: get_value(&mut config, "minify", defaults.minify, &mut diagnostics),
    };
    if resolved.indent_width == 0 {
        diagnostics.push(ConfigurationDiagnostic {
            property_name: "indentWidth".into(),
            message: "Expected a value between 1 and 255.".into(),
        });
        resolved.indent_width = defaults.indent_width;
    }
    diagnostics.extend(get_unknown_property_diagnostics(config));
    PluginResolveConfigurationResult {
        config: resolved,
        diagnostics,
        file_matching: FileMatchingInfo {
            file_extensions: ["sh", "bash", "zsh", "dash", "mksh", "bats"]
                .into_iter()
                .map(str::to_owned)
                .collect(),
            file_names: Vec::new(),
        },
    }
}
