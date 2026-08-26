use serde::Deserialize;

const ACTION_GROUPS_JSON: &str = include_str!("../renderer/catalog/action-groups.json");

#[derive(Deserialize)]
struct ActionGroup<'a> {
    #[serde(borrow)]
    states: Vec<&'a str>,
}

pub(crate) fn names() -> Vec<&'static str> {
    serde_json::from_str::<Vec<ActionGroup<'static>>>(ACTION_GROUPS_JSON)
        .expect("内嵌动画预设必须是有效 JSON")
        .into_iter()
        .flat_map(|group| group.states)
        .collect()
}

pub(crate) fn contains(name: &str) -> bool {
    names().contains(&name)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn loads_unique_action_names_from_renderer_metadata() {
        let names = names();
        assert_eq!(names.len(), 45);
        assert!(names.contains(&"happy"));
        assert!(names.contains(&"thinking-alt"));
        assert!(names.contains(&"working"));

        let mut unique = names.clone();
        unique.sort_unstable();
        unique.dedup();
        assert_eq!(unique.len(), names.len());
    }
}
