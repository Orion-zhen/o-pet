pub(crate) const PAGE: &str = concat!(
    include_str!("../../renderer/page-start.html"),
    include_str!("../../renderer/view/geometry-data.js"),
    include_str!("../../renderer/engine/math.js"),
    include_str!("../../renderer/view/geometry.js"),
    "window.O_PET_ACTION_GROUPS = Object.freeze(",
    include_str!("../../renderer/catalog/action-groups.json"),
    ".map((group) => Object.freeze({ ...group, states: Object.freeze(group.states) })));\n",
    include_str!("../../renderer/catalog/tables.js"),
    include_str!("../../renderer/catalog/presets.js"),
    include_str!("../../renderer/catalog/sequences.js"),
    include_str!("../../renderer/engine/channels/motion.js"),
    include_str!("../../renderer/engine/channels/expression.js"),
    include_str!("../../renderer/engine/channels/gaze.js"),
    include_str!("../../renderer/engine/channels/choreography.js"),
    include_str!("../../renderer/engine/actions.js"),
    include_str!("../../renderer/view/particles.js"),
    include_str!("../../renderer/view/effects.js"),
    include_str!("../../renderer/view/eyes.js"),
    include_str!("../../renderer/view/svg.js"),
    include_str!("../../renderer/engine/visual-channels.js"),
    include_str!("../../renderer/engine/runtime.js"),
    include_str!("../../renderer/runtime/scheduler.js"),
    include_str!("../../renderer/runtime/timeline.js"),
    include_str!("../../renderer/runtime/presenter.js"),
    include_str!("../../renderer/behaviors/activities.js"),
    include_str!("../../renderer/behaviors/idle.js"),
    include_str!("../../renderer/behaviors/cues.js"),
    include_str!("../../renderer/behaviors/interaction.js"),
    include_str!("../../renderer/adapters/pointer.js"),
    include_str!("../../renderer/adapters/preferences.js"),
    include_str!("../../renderer/host.js"),
    include_str!("../../renderer/page-end.html"),
);

#[cfg(test)]
mod tests {
    use super::PAGE;

    #[test]
    fn embeds_the_complete_renderer_without_external_resources() {
        for component in [
            "window.GROK_GEO",
            "g.GROK_MATH",
            "g.GROK_GEOMETRY",
            "window.O_PET_ACTION_GROUPS",
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
            "g.O_PET_VISUAL_CHANNELS",
            "g.O_PET_RUNTIME",
            "g.O_PET_SCHEDULER",
            "g.O_PET_TIMELINE",
            "g.O_PET_PRESENTER",
            "g.O_PET_ACTIVITIES",
            "g.O_PET_IDLE",
            "g.O_PET_CUES",
            "g.O_PET_INTERACTION",
            "g.O_PET_POINTER",
            "g.O_PET_PREFERENCES",
            "g.OPetRenderer",
        ] {
            assert!(PAGE.contains(component), "缺少渲染器组件 {component}");
        }
        assert!(PAGE.contains("const window = Object.create(null)"));
        assert!(PAGE.contains("browser.oPet = Object.freeze"));
        assert!(!PAGE.contains("browser.GROK_"));
        assert!(!PAGE.contains("<script src="));
        assert!(!PAGE.contains("<link "));
        assert!(PAGE.contains("contextmenu"));
        assert!(PAGE.contains("event.preventDefault()"));
        assert_eq!(PAGE.lines().next_back(), Some("</html>"));
    }
}
