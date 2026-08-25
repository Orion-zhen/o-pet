pub(crate) const PAGE: &str = concat!(
    include_str!("../../renderer/page-start.html"),
    include_str!("../../renderer/grok/geometry-data.js"),
    include_str!("../../renderer/grok/math.js"),
    include_str!("../../renderer/grok/geometry.js"),
    include_str!("../../renderer/grok/tables.js"),
    include_str!("../../renderer/grok/presets.js"),
    include_str!("../../renderer/grok/sequences.js"),
    include_str!("../../renderer/grok/motion.js"),
    include_str!("../../renderer/grok/expression.js"),
    include_str!("../../renderer/grok/gaze.js"),
    include_str!("../../renderer/grok/choreography.js"),
    include_str!("../../renderer/grok/actions.js"),
    include_str!("../../renderer/grok/particles.js"),
    include_str!("../../renderer/grok/effects.js"),
    include_str!("../../renderer/grok/eyes.js"),
    include_str!("../../renderer/grok/render.js"),
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
            "g.GROK_GEOMETRY",
            "g.GROK_TABLES",
            "g.GROK_PRESETS",
            "g.GROK_SEQUENCES",
            "g.GROK_MOTION",
            "g.GROK_EXPRESSION",
            "g.GROK_GAZE",
            "g.GROK_CHOREOGRAPHY",
            "g.GROK_ACTIONS",
            "global.GROK_PARTICLES",
            "global.GROK_EFFECTS",
            "g.GROK_EYES",
            "g.GROK_RENDER",
            "g.GrokCharacter",
            "g.OPetRenderer",
        ] {
            assert!(PAGE.contains(global), "缺少渲染器组件 {global}");
        }
        assert!(!PAGE.contains("<script src="));
        assert!(!PAGE.contains("<link "));
        assert!(PAGE.contains("contextmenu"));
        assert!(PAGE.contains("event.preventDefault()"));
        assert_eq!(PAGE.lines().next_back(), Some("</html>"));
    }
}
