use dprint_core::configuration::{ConfigKeyMap, ConfigKeyValue, GlobalConfiguration};
use dprint_core::plugins::{FormatResult, SyncFormatRequest, SyncPluginHandler};
use dprint_plugin_shuck::{Configuration, PluginHandler};
use std::path::Path;

fn format(bytes: &[u8], path: &str, config: &Configuration) -> FormatResult {
    PluginHandler.format(
        SyncFormatRequest {
            file_path: Path::new(path),
            file_bytes: bytes.to_vec(),
            config,
            range: None,
            config_id: dprint_core::plugins::FormatConfigId::uninitialized(),
            token: &dprint_core::plugins::NullCancellationToken,
        },
        |_| panic!("Host formatting is unnecessary"),
    )
}

#[test]
fn fixture_and_idempotence() {
    let config = Configuration {
        use_tabs: false,
        indent_width: 2,
        ..Configuration::default()
    };
    let actual = format(
        include_bytes!("fixtures/input.bash"),
        "script.bash",
        &config,
    )
    .unwrap()
    .unwrap();
    assert_eq!(actual, include_bytes!("fixtures/expected.bash"));
    assert!(format(&actual, "script.bash", &config).unwrap().is_none());
}

#[test]
fn errors_preserve_input() {
    assert!(format(&[0xff], "script.sh", &Configuration::default()).is_err());
    let error = format(b"if then\n", "script.sh", &Configuration::default()).unwrap_err();
    assert!(error.to_string().contains("parse error"));
}

#[test]
fn diagnostics_and_global_precedence() {
    let global = GlobalConfiguration {
        use_tabs: Some(false),
        indent_width: Some(3),
        ..GlobalConfiguration::default()
    };
    let inherited = PluginHandler.resolve_config(ConfigKeyMap::new(), &global);
    assert_eq!(inherited.config.indent_width, 3);
    assert!(!inherited.config.use_tabs);
    let values = ConfigKeyMap::from([
        ("indentWidth".into(), ConfigKeyValue::Number(2)),
        ("useTabs".into(), ConfigKeyValue::Bool(true)),
        ("unknown".into(), ConfigKeyValue::Bool(true)),
    ]);
    let result = PluginHandler.resolve_config(values, &global);
    assert_eq!(result.config.indent_width, 2);
    assert!(result.config.use_tabs);
    assert_eq!(result.diagnostics.len(), 1);
    assert_eq!(result.diagnostics[0].property_name, "unknown");
}

#[test]
fn invalid_values_are_diagnostics() {
    for (key, value) in [
        ("indentWidth", ConfigKeyValue::Number(0)),
        ("indentWidth", ConfigKeyValue::Number(256)),
        ("dialect", ConfigKeyValue::String("fish".into())),
        ("useTabs", ConfigKeyValue::String("yes".into())),
    ] {
        let result = PluginHandler.resolve_config(
            ConfigKeyMap::from([(key.into(), value)]),
            &GlobalConfiguration::default(),
        );
        assert_eq!(result.diagnostics.len(), 1, "{key}");
        assert_eq!(result.diagnostics[0].property_name, key);
    }
}

#[test]
fn upstream_defaults_and_identity() {
    let result = PluginHandler.resolve_config(ConfigKeyMap::new(), &GlobalConfiguration::default());
    let upstream = shuck_formatter::ShellFormatOptions::default();
    assert_eq!(result.config.indent_width, upstream.indent_width());
    assert_eq!(
        result.config.use_tabs,
        matches!(upstream.indent_style(), shuck_formatter::IndentStyle::Tab)
    );
    let info = PluginHandler.plugin_info();
    assert_eq!(
        info.config_schema_url,
        format!(
            "https://plugins.dprint.dev/kjanat/shuck/{}/schema.json",
            env!("CARGO_PKG_VERSION")
        )
    );
    assert_eq!(
        info.update_url.as_deref(),
        Some("https://plugins.dprint.dev/kjanat/shuck/latest.json")
    );
}

#[test]
fn zsh_and_crlf_remain_idempotent() {
    for (source, path) in [
        ("print ${(m)name}\n", "script.zsh"),
        ("echo  hi\r\n", "script.bash"),
    ] {
        let config = Configuration::default();
        let first = format(source.as_bytes(), path, &config)
            .unwrap()
            .unwrap_or_else(|| source.as_bytes().to_vec());
        assert!(format(&first, path, &config).unwrap().is_none());
        if source.contains('\r') {
            assert!(first.windows(2).any(|pair| pair == b"\r\n"));
        }
    }
}

#[test]
fn crlf_function_parse_error_matches_upstream() {
    let source = "foo(){\r\necho hi\r\n}\r\n";
    let upstream = shuck_formatter::format_source(
        source,
        Some(Path::new("script.bash")),
        &shuck_formatter::ShellFormatOptions::default(),
    )
    .unwrap_err();
    let adapter = format(source.as_bytes(), "script.bash", &Configuration::default()).unwrap_err();
    assert_eq!(adapter.to_string(), upstream.to_string());
}

#[test]
fn range_formatting_leaves_the_document_untouched() {
    let config = Configuration::default();
    let result = PluginHandler
        .format(
            SyncFormatRequest {
                file_path: Path::new("script.bash"),
                file_bytes: include_bytes!("fixtures/input.bash").to_vec(),
                config_id: dprint_core::plugins::FormatConfigId::uninitialized(),
                config: &config,
                range: Some(0..3),
                token: &dprint_core::plugins::NullCancellationToken,
            },
            |_| panic!("Host formatting is unnecessary"),
        )
        .unwrap();
    assert!(result.is_none());
}

#[test]
fn function_layout_option_reaches_the_formatter() {
    let config = Configuration {
        function_next_line: true,
        use_tabs: false,
        indent_width: 2,
        ..Configuration::default()
    };
    let actual = format(
        include_bytes!("fixtures/input.bash"),
        "script.bash",
        &config,
    )
    .unwrap()
    .unwrap();
    assert_eq!(actual, b"foo()\n{\n  echo hi\n}\n");
    assert!(format(&actual, "script.bash", &config).unwrap().is_none());
}
