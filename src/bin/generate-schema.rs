use dprint_core::plugins::SyncPluginHandler;
use dprint_plugin_shuck::{Configuration, PluginHandler};
fn main() -> anyhow::Result<()> {
    let mut schema = serde_json::to_value(schemars::schema_for!(Configuration))?;
    schema["$id"] = PluginHandler.plugin_info().config_schema_url.into();
    let schema = json_schema_sort::sorted_schema(schema);
    std::fs::write("schema.json", serde_json::to_string_pretty(&schema)? + "\n")?;
    Ok(())
}
