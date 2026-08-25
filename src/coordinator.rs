use std::collections::{HashMap, HashSet};

use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, Default, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Activity {
    #[default]
    Idle,
    Thinking,
    Searching,
    Coding,
    Terminal,
    Receiving,
    Consulting,
    Tooling,
    Replying,
    AwaitingApproval,
}

impl Activity {
    const fn foreground_priority(self) -> u8 {
        match self {
            Self::Idle => 0,
            Self::AwaitingApproval => 2,
            Self::Thinking
            | Self::Searching
            | Self::Coding
            | Self::Terminal
            | Self::Receiving
            | Self::Consulting
            | Self::Tooling
            | Self::Replying => 1,
        }
    }
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Cue {
    Engage,
    Progress,
    ReplySent,
    ApprovalGranted,
    ApprovalDenied,
    ErrorFirst,
    ErrorRepeated,
    ErrorStubborn,
    CompletedQuick,
    CompletedNormal,
    CompletedHard,
    RunFailed,
    RunAborted,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
pub struct AnimationUpdate {
    pub activity: Activity,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cue: Option<Cue>,
}

impl AnimationUpdate {
    pub const fn steady(activity: Activity) -> Self {
        Self {
            activity,
            cue: None,
        }
    }
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum ToolOutcome {
    Success,
    Error,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum AgentOutcome {
    Success,
    Error,
    Aborted,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum ApprovalOutcome {
    Approved,
    Denied,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum AgentEvent {
    AgentStarted,
    TurnStarted,
    ThinkingStarted,
    ReplyStarted,
    ReplyFinished,
    ToolObserved {
        #[serde(rename = "toolName")]
        tool_name: String,
    },
    ToolStarted {
        #[serde(rename = "toolCallId")]
        tool_call_id: String,
        #[serde(rename = "toolName")]
        tool_name: String,
    },
    ToolProgressed {
        #[serde(rename = "toolCallId")]
        tool_call_id: String,
    },
    ToolFinished {
        #[serde(rename = "toolCallId")]
        tool_call_id: String,
        outcome: ToolOutcome,
    },
    ApprovalRequested {
        #[serde(rename = "toolCallId")]
        tool_call_id: String,
        #[serde(rename = "toolName")]
        tool_name: String,
    },
    ApprovalResolved {
        #[serde(rename = "toolCallId")]
        tool_call_id: String,
        outcome: ApprovalOutcome,
    },
    AgentSettled {
        outcome: AgentOutcome,
        #[serde(rename = "durationMs")]
        duration_ms: u64,
    },
}

#[derive(Debug, Default)]
pub struct Coordinator {
    clients: HashMap<u64, ClientState>,
    receive_order: u64,
}

#[derive(Debug, Default)]
struct ClientState {
    run_active: bool,
    active_tools: Vec<ActiveTool>,
    pending_approvals: HashSet<String>,
    denied_tools: HashSet<String>,
    activity: Activity,
    base_activity: Activity,
    error_streak: u32,
    tool_errors: u32,
    tool_count: u32,
    last_active: Option<u64>,
}

#[derive(Debug)]
struct ActiveTool {
    id: String,
    activity: Activity,
}

impl ClientState {
    fn apply(&mut self, event: AgentEvent) -> Option<Cue> {
        match event {
            AgentEvent::AgentStarted => {
                self.run_active = true;
                self.active_tools.clear();
                self.pending_approvals.clear();
                self.denied_tools.clear();
                self.error_streak = 0;
                self.tool_errors = 0;
                self.tool_count = 0;
                self.base_activity = Activity::Thinking;
                self.activity = Activity::Thinking;
                Some(Cue::Engage)
            }
            AgentEvent::TurnStarted | AgentEvent::ThinkingStarted => {
                self.run_active = true;
                self.base_activity = Activity::Thinking;
                self.activity = self.current_work();
                None
            }
            AgentEvent::ReplyStarted => {
                self.run_active = true;
                self.base_activity = Activity::Replying;
                self.activity = self.current_work();
                None
            }
            AgentEvent::ReplyFinished => {
                self.base_activity = Activity::Replying;
                self.activity = self.current_work();
                Some(Cue::ReplySent)
            }
            AgentEvent::ToolObserved { tool_name } => {
                self.run_active = true;
                self.activity = classify_tool(&tool_name);
                None
            }
            AgentEvent::ToolStarted {
                tool_call_id,
                tool_name,
            } => {
                self.run_active = true;
                self.denied_tools.remove(&tool_call_id);
                let is_new = self.active_tools.iter().all(|tool| tool.id != tool_call_id);
                self.active_tools.retain(|tool| tool.id != tool_call_id);
                let activity = classify_tool(&tool_name);
                self.active_tools.push(ActiveTool {
                    id: tool_call_id,
                    activity,
                });
                if is_new {
                    self.tool_count = self.tool_count.saturating_add(1);
                }
                self.activity = self.current_work();
                None
            }
            AgentEvent::ToolProgressed { tool_call_id } => {
                if self.active_tools.iter().any(|tool| tool.id == tool_call_id) {
                    self.activity = self.current_work();
                    Some(Cue::Progress)
                } else {
                    None
                }
            }
            AgentEvent::ToolFinished {
                tool_call_id,
                outcome,
            } => {
                self.active_tools.retain(|tool| tool.id != tool_call_id);
                self.activity = self.current_work();
                if self.denied_tools.remove(&tool_call_id) {
                    None
                } else if outcome == ToolOutcome::Error {
                    self.tool_errors = self.tool_errors.saturating_add(1);
                    self.error_streak = self.error_streak.saturating_add(1);
                    Some(error_cue(self.error_streak))
                } else {
                    self.error_streak = 0;
                    None
                }
            }
            AgentEvent::ApprovalRequested {
                tool_call_id,
                tool_name: _,
            } => {
                self.pending_approvals.insert(tool_call_id);
                self.activity = Activity::AwaitingApproval;
                None
            }
            AgentEvent::ApprovalResolved {
                tool_call_id,
                outcome,
            } => {
                self.pending_approvals.remove(&tool_call_id);
                let cue = match outcome {
                    ApprovalOutcome::Approved => Cue::ApprovalGranted,
                    ApprovalOutcome::Denied => {
                        self.active_tools.retain(|tool| tool.id != tool_call_id);
                        self.denied_tools.insert(tool_call_id);
                        Cue::ApprovalDenied
                    }
                };
                self.activity = self.current_work();
                Some(cue)
            }
            AgentEvent::AgentSettled {
                outcome,
                duration_ms,
            } => {
                let cue = completion_cue(outcome, duration_ms, self.tool_count, self.tool_errors);
                self.run_active = false;
                self.active_tools.clear();
                self.pending_approvals.clear();
                self.denied_tools.clear();
                self.base_activity = Activity::Idle;
                self.activity = Activity::Idle;
                Some(cue)
            }
        }
    }

    fn current_work(&self) -> Activity {
        if !self.pending_approvals.is_empty() {
            return Activity::AwaitingApproval;
        }
        self.active_tools.last().map_or_else(
            || {
                if self.run_active {
                    self.base_activity
                } else {
                    Activity::Idle
                }
            },
            |tool| tool.activity,
        )
    }
}

impl Coordinator {
    pub fn connect(&mut self, connection_id: u64) {
        self.clients.insert(connection_id, ClientState::default());
    }

    pub fn event(&mut self, connection_id: u64, event: AgentEvent) -> Option<AnimationUpdate> {
        let previous = self.current_selection();
        let client = self.clients.get_mut(&connection_id)?;
        let cue = client.apply(event);
        self.receive_order = self.receive_order.saturating_add(1);
        client.last_active = Some(self.receive_order);
        let current = self.current_selection();
        let activity = current.map_or(Activity::Idle, |(_, activity)| activity);
        let visible_cue = (current.map(|(id, _)| id) == Some(connection_id))
            .then_some(cue)
            .flatten();
        let previous_activity = previous.map_or(Activity::Idle, |(_, activity)| activity);
        (activity != previous_activity || visible_cue.is_some()).then_some(AnimationUpdate {
            activity,
            cue: visible_cue,
        })
    }

    pub fn disconnect(&mut self, connection_id: u64) -> Option<AnimationUpdate> {
        let previous = self.current_activity();
        self.clients.remove(&connection_id)?;
        let current = self.current_activity();
        (current != previous).then_some(AnimationUpdate::steady(current))
    }

    pub fn current_activity(&self) -> Activity {
        self.current_selection()
            .map_or(Activity::Idle, |(_, activity)| activity)
    }

    fn current_selection(&self) -> Option<(u64, Activity)> {
        self.clients
            .iter()
            .filter_map(|(id, client)| {
                client.last_active.map(|order| {
                    (
                        *id,
                        client.activity,
                        client.activity.foreground_priority(),
                        order,
                    )
                })
            })
            .max_by_key(|(_, _, priority, order)| (*priority, *order))
            .map(|(id, activity, _, _)| (id, activity))
    }
}

fn classify_tool(tool_name: &str) -> Activity {
    match tool_name.to_ascii_lowercase().as_str() {
        "read" | "grep" | "find" | "websearch" => Activity::Searching,
        "edit" | "write" => Activity::Coding,
        "bash" => Activity::Terminal,
        "webfetch" => Activity::Receiving,
        "skill" => Activity::Consulting,
        _ => Activity::Tooling,
    }
}

fn error_cue(error_streak: u32) -> Cue {
    match error_streak {
        1 => Cue::ErrorFirst,
        2..=3 => Cue::ErrorRepeated,
        _ => Cue::ErrorStubborn,
    }
}

fn completion_cue(
    outcome: AgentOutcome,
    duration_ms: u64,
    tool_count: u32,
    tool_errors: u32,
) -> Cue {
    match outcome {
        AgentOutcome::Error => Cue::RunFailed,
        AgentOutcome::Aborted => Cue::RunAborted,
        AgentOutcome::Success if duration_ms >= 45_000 || tool_count >= 5 || tool_errors >= 2 => {
            Cue::CompletedHard
        }
        AgentOutcome::Success if duration_ms <= 8_000 && tool_count == 0 => Cue::CompletedQuick,
        AgentOutcome::Success => Cue::CompletedNormal,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn started(id: &str, name: &str) -> AgentEvent {
        AgentEvent::ToolStarted {
            tool_call_id: id.into(),
            tool_name: name.into(),
        }
    }

    fn finished(id: &str, outcome: ToolOutcome) -> AgentEvent {
        AgentEvent::ToolFinished {
            tool_call_id: id.into(),
            outcome,
        }
    }

    fn settled(outcome: AgentOutcome, duration_ms: u64) -> AgentEvent {
        AgentEvent::AgentSettled {
            outcome,
            duration_ms,
        }
    }

    fn update(activity: Activity, cue: Option<Cue>) -> Option<AnimationUpdate> {
        Some(AnimationUpdate { activity, cue })
    }

    #[test]
    fn maps_programming_phases_and_approval_chains() {
        let mut coordinator = Coordinator::default();
        coordinator.connect(1);
        assert_eq!(
            coordinator.event(1, AgentEvent::AgentStarted),
            update(Activity::Thinking, Some(Cue::Engage))
        );
        assert_eq!(coordinator.event(1, AgentEvent::ThinkingStarted), None);
        assert_eq!(
            coordinator.event(1, started("read", "read")),
            update(Activity::Searching, None)
        );
        assert_eq!(
            coordinator.event(1, started("write", "write")),
            update(Activity::Coding, None)
        );
        assert_eq!(
            coordinator.event(
                1,
                AgentEvent::ApprovalRequested {
                    tool_call_id: "write".into(),
                    tool_name: "write".into(),
                }
            ),
            update(Activity::AwaitingApproval, None)
        );
        assert_eq!(
            coordinator.event(
                1,
                AgentEvent::ApprovalResolved {
                    tool_call_id: "write".into(),
                    outcome: ApprovalOutcome::Approved,
                }
            ),
            update(Activity::Coding, Some(Cue::ApprovalGranted))
        );
        assert_eq!(
            coordinator.event(1, finished("write", ToolOutcome::Success)),
            update(Activity::Searching, None)
        );
        assert_eq!(
            coordinator.event(1, finished("read", ToolOutcome::Success)),
            update(Activity::Thinking, None)
        );
        assert_eq!(
            coordinator.event(1, AgentEvent::ReplyStarted),
            update(Activity::Replying, None)
        );
        assert_eq!(
            coordinator.event(1, AgentEvent::ReplyFinished),
            update(Activity::Replying, Some(Cue::ReplySent))
        );
    }

    #[test]
    fn uses_consecutive_failures_and_recovers_after_success() {
        let mut coordinator = Coordinator::default();
        coordinator.connect(1);
        coordinator.event(1, AgentEvent::AgentStarted);

        for (index, cue) in [
            Cue::ErrorFirst,
            Cue::ErrorRepeated,
            Cue::ErrorRepeated,
            Cue::ErrorStubborn,
        ]
        .into_iter()
        .enumerate()
        {
            let id = format!("tool-{index}");
            coordinator.event(1, started(&id, "bash"));
            assert_eq!(
                coordinator.event(1, finished(&id, ToolOutcome::Error)),
                update(Activity::Thinking, Some(cue))
            );
        }

        coordinator.event(1, started("recovery", "bash"));
        coordinator.event(1, finished("recovery", ToolOutcome::Success));
        coordinator.event(1, started("fresh", "bash"));
        assert_eq!(
            coordinator.event(1, finished("fresh", ToolOutcome::Error)),
            update(Activity::Thinking, Some(Cue::ErrorFirst))
        );
    }

    #[test]
    fn classifies_tools_and_reports_live_progress() {
        let cases = [
            ("read", Activity::Searching),
            ("grep", Activity::Searching),
            ("find", Activity::Searching),
            ("websearch", Activity::Searching),
            ("edit", Activity::Coding),
            ("write", Activity::Coding),
            ("bash", Activity::Terminal),
            ("webfetch", Activity::Receiving),
            ("skill", Activity::Consulting),
            ("custom", Activity::Tooling),
        ];
        for (index, (name, expected)) in cases.into_iter().enumerate() {
            let mut coordinator = Coordinator::default();
            coordinator.connect(1);
            let id = format!("tool-{index}");
            assert_eq!(
                coordinator.event(1, started(&id, name)),
                update(expected, None)
            );
            assert_eq!(
                coordinator.event(1, AgentEvent::ToolProgressed { tool_call_id: id }),
                update(expected, Some(Cue::Progress))
            );
        }
    }

    #[test]
    fn classifies_completion_effort_without_using_laughing() {
        let cases = [
            (settled(AgentOutcome::Success, 2_000), Cue::CompletedQuick),
            (settled(AgentOutcome::Success, 20_000), Cue::CompletedNormal),
            (settled(AgentOutcome::Success, 45_000), Cue::CompletedHard),
            (settled(AgentOutcome::Error, 1_000), Cue::RunFailed),
            (settled(AgentOutcome::Aborted, 1_000), Cue::RunAborted),
        ];
        for (event, expected) in cases {
            let mut coordinator = Coordinator::default();
            coordinator.connect(1);
            coordinator.event(1, AgentEvent::AgentStarted);
            assert_eq!(
                coordinator.event(1, event),
                update(Activity::Idle, Some(expected))
            );
        }

        let mut coordinator = Coordinator::default();
        coordinator.connect(1);
        coordinator.event(1, AgentEvent::AgentStarted);
        for index in 0..5 {
            let id = format!("tool-{index}");
            coordinator.event(1, started(&id, "read"));
            coordinator.event(1, finished(&id, ToolOutcome::Success));
        }
        assert_eq!(
            coordinator.event(1, settled(AgentOutcome::Success, 20_000)),
            update(Activity::Idle, Some(Cue::CompletedHard))
        );
    }

    #[test]
    fn denial_is_neutral_and_ignores_the_cancelled_tool_error() {
        let mut coordinator = Coordinator::default();
        coordinator.connect(1);
        coordinator.event(1, AgentEvent::AgentStarted);
        coordinator.event(1, started("bash", "bash"));
        coordinator.event(
            1,
            AgentEvent::ApprovalRequested {
                tool_call_id: "bash".into(),
                tool_name: "bash".into(),
            },
        );
        assert_eq!(
            coordinator.event(
                1,
                AgentEvent::ApprovalResolved {
                    tool_call_id: "bash".into(),
                    outcome: ApprovalOutcome::Denied,
                }
            ),
            update(Activity::Thinking, Some(Cue::ApprovalDenied))
        );
        assert_eq!(
            coordinator.event(1, finished("bash", ToolOutcome::Error)),
            None
        );
    }

    #[test]
    fn keeps_active_and_approval_clients_ahead_of_recent_idle_clients() {
        let mut coordinator = Coordinator::default();
        coordinator.connect(1);
        coordinator.connect(2);
        coordinator.event(1, AgentEvent::AgentStarted);
        coordinator.event(1, started("one", "read"));
        coordinator.event(2, AgentEvent::AgentStarted);
        assert_eq!(coordinator.current_activity(), Activity::Thinking);

        assert_eq!(
            coordinator.event(2, settled(AgentOutcome::Success, 2_000)),
            update(Activity::Searching, None)
        );
        assert_eq!(coordinator.current_activity(), Activity::Searching);

        assert_eq!(
            coordinator.event(
                1,
                AgentEvent::ApprovalRequested {
                    tool_call_id: "one".into(),
                    tool_name: "read".into(),
                }
            ),
            update(Activity::AwaitingApproval, None)
        );
        coordinator.event(2, AgentEvent::AgentStarted);
        assert_eq!(coordinator.current_activity(), Activity::AwaitingApproval);
        assert_eq!(coordinator.disconnect(1), update(Activity::Thinking, None));
    }
}
