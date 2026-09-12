//! Sandboxed dprint adapter for Shuck's shell formatter.
pub mod config;
pub use config::Configuration;
use dprint_core::configuration::{ConfigKeyMap, GlobalConfiguration};
use dprint_core::plugins::{
    CheckConfigUpdatesMessage, ConfigChange, FormatResult, PluginInfo,
    PluginResolveConfigurationResult, SyncFormatRequest, SyncHostFormatRequest, SyncPluginHandler,
};
use shuck_formatter::FormattedSource;

/// dprint protocol handler.
pub struct PluginHandler;

/// Version-independent plugin proxy base, derived from Cargo package metadata.
#[must_use]
pub fn proxy_url() -> String {
    let repository = env!("CARGO_PKG_REPOSITORY").trim_start_matches("https://github.com/");
    format!(
        "https://plugins.dprint.dev/{}",
        repository.replace("/dprint-plugin-", "/")
    )
}

impl SyncPluginHandler<Configuration> for PluginHandler {
    fn plugin_info(&mut self) -> PluginInfo {
        PluginInfo {
            name: env!("CARGO_PKG_NAME").into(),
            version: env!("CARGO_PKG_VERSION").into(),
            config_key: "shuck".into(),
            help_url: env!("CARGO_PKG_REPOSITORY").into(),
            config_schema_url: format!("{}/{}/schema.json", proxy_url(), env!("CARGO_PKG_VERSION")),
            update_url: Some(format!("{}/latest.json", proxy_url())),
        }
    }
    fn license_text(&mut self) -> String {
        concat!(
            include_str!("../LICENSE"),
            "\n",
            include_str!("../LICENSE-SHUCK")
        )
        .into()
    }
    fn resolve_config(
        &mut self,
        config: ConfigKeyMap,
        global_config: &GlobalConfiguration,
    ) -> PluginResolveConfigurationResult<Configuration> {
        config::resolve_config(config, global_config)
    }
    fn check_config_updates(
        &self,
        _message: CheckConfigUpdatesMessage,
    ) -> Result<Vec<ConfigChange>, dprint_core::plugins::FormatError> {
        Ok(Vec::new())
    }
    fn format(
        &mut self,
        request: SyncFormatRequest<Configuration>,
        _format_with_host: impl FnMut(SyncHostFormatRequest) -> FormatResult,
    ) -> FormatResult {
        if request.range.is_some() {
            return Ok(None);
        }
        let source = std::str::from_utf8(&request.file_bytes)?;
        match shuck_formatter::format_source(
            source,
            Some(request.file_path),
            &request.config.options(),
        )
        .map_err(dprint_core::plugins::FormatError::new)?
        {
            FormattedSource::Unchanged => Ok(None),
            FormattedSource::Formatted(formatted) if formatted == source => Ok(None),
            FormattedSource::Formatted(formatted) => Ok(Some(formatted.into_bytes())),
        }
    }
}
#[cfg(all(target_arch = "wasm32", target_os = "unknown"))]
use dprint_core::generate_plugin_code;
#[cfg(all(target_arch = "wasm32", target_os = "unknown"))]
generate_plugin_code!(PluginHandler, PluginHandler);
