pub(crate) const PAGE: &str = concat!(
    include_str!("../../renderer/page-start.html"),
    include_str!("../../renderer/grok/geometry-data.js"),
    include_str!("../../renderer/grok/math.js"),
    include_str!("../../renderer/grok/tables.js"),
    include_str!("../../renderer/grok/pose.js"),
    include_str!("../../renderer/grok/tricks.js"),
    include_str!("../../renderer/grok/fx.js"),
    include_str!("../../renderer/grok/eyes.js"),
    include_str!("../../renderer/grok/character.js"),
    include_str!("../../renderer/host.js"),
    include_str!("../../renderer/page-end.html"),
);

#[cfg(test)]
mod tests {
    use super::PAGE;

    #[test]
    fn embeds_the_complete_renderer_without_external_resources() {
        for global in [
            "window.GROK_GEO",
            "g.GROK_MATH",
            "g.GROK_TABLES",
            "g.GROK_POSE",
            "g.GROK_TRICKS",
            "global.GROK_FX",
            "g.GROK_EYES",
            "g.GrokCharacter",
            "g.OPetRenderer",
        ] {
            assert!(PAGE.contains(global), "缺少渲染器组件 {global}");
        }
        assert!(!PAGE.contains("<script src="));
        assert!(!PAGE.contains("<link "));
        assert!(PAGE.contains("contextmenu"));
        assert!(PAGE.contains("event.preventDefault()"));
        assert!(PAGE.ends_with("</html>\n"));
    }
}
