use serde_json::Value;

use crate::coordinator::AgentEvent;

pub const MAX_LINE_BYTES: usize = 64 * 1024;

#[derive(Debug, Eq, PartialEq)]
pub enum ClientMessage {
    Hello {
        client_id: String,
        session_id: String,
    },
    Event(AgentEvent),
    Goodbye,
    Ignore,
}

pub fn parse_message(line: &[u8]) -> ClientMessage {
    let Ok(Value::Object(object)) = serde_json::from_slice::<Value>(line) else {
        return ClientMessage::Ignore;
    };
    let Some(message_type) = object.get("type").and_then(Value::as_str) else {
        return ClientMessage::Ignore;
    };

    match message_type {
        "hello" => {
            let Some(client_id) = object.get("clientId").and_then(Value::as_str) else {
                return ClientMessage::Ignore;
            };
            let Some(session_id) = object.get("sessionId").and_then(Value::as_str) else {
                return ClientMessage::Ignore;
            };
            ClientMessage::Hello {
                client_id: client_id.to_owned(),
                session_id: session_id.to_owned(),
            }
        }
        "event" => object
            .get("event")
            .and_then(|value| serde_json::from_value::<AgentEvent>(value.clone()).ok())
            .map_or(ClientMessage::Ignore, ClientMessage::Event),
        "goodbye" => ClientMessage::Goodbye,
        _ => ClientMessage::Ignore,
    }
}

#[derive(Debug, Default)]
pub struct LineDecoder {
    line: Vec<u8>,
}

#[derive(Debug, Default, Eq, PartialEq)]
pub struct DecodeBatch {
    pub lines: Vec<Vec<u8>>,
    pub oversized: bool,
}

impl LineDecoder {
    pub fn push(&mut self, bytes: &[u8]) -> DecodeBatch {
        let mut batch = DecodeBatch::default();
        for byte in bytes {
            if *byte == b'\n' {
                batch.lines.push(std::mem::take(&mut self.line));
                continue;
            }
            self.line.push(*byte);
            if self.line.len() > MAX_LINE_BYTES {
                self.line.clear();
                batch.oversized = true;
                break;
            }
        }
        batch
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn decodes_fragmented_and_batched_lines() {
        let mut decoder = LineDecoder::default();
        assert_eq!(decoder.push(b"{\"type\":"), DecodeBatch::default());
        assert_eq!(
            decoder.push(b"\"goodbye\"}\n{}\npart"),
            DecodeBatch {
                lines: vec![br#"{"type":"goodbye"}"#.to_vec(), b"{}".to_vec()],
                oversized: false,
            }
        );
        assert_eq!(
            decoder.push(b"ial\n"),
            DecodeBatch {
                lines: vec![b"partial".to_vec()],
                oversized: false,
            }
        );
    }

    #[test]
    fn returns_complete_lines_before_an_oversized_line() {
        let mut decoder = LineDecoder::default();
        let mut input = b"{\"type\":\"goodbye\"}\n".to_vec();
        let oversized = include_bytes!("../../protocol/fixtures/oversized.jsonl");
        assert_eq!(oversized.len(), MAX_LINE_BYTES + 1);
        input.extend_from_slice(oversized);
        let batch = decoder.push(&input);
        assert_eq!(batch.lines, vec![br#"{"type":"goodbye"}"#.to_vec()]);
        assert!(batch.oversized);
    }

    #[test]
    fn invalid_utf8_is_ignored() {
        assert_eq!(parse_message(&[0xff, 0xfe]), ClientMessage::Ignore);
    }

    #[test]
    fn parses_shared_protocol_fixtures_tolerantly() {
        let cases = [
            (
                include_bytes!("../../protocol/fixtures/valid.jsonl").as_slice(),
                vec![
                    ClientMessage::Hello {
                        client_id: "client-1".into(),
                        session_id: "session-1".into(),
                    },
                    ClientMessage::Event(AgentEvent::ThinkingStarted),
                    ClientMessage::Event(AgentEvent::ReplyStarted),
                    ClientMessage::Event(AgentEvent::ToolObserved {
                        tool_name: "skill".into(),
                    }),
                    ClientMessage::Event(AgentEvent::ToolStarted {
                        tool_call_id: "tool-1".into(),
                        tool_name: "skill".into(),
                    }),
                    ClientMessage::Event(AgentEvent::ToolProgressed {
                        tool_call_id: "tool-1".into(),
                    }),
                    ClientMessage::Event(AgentEvent::ApprovalRequested {
                        tool_call_id: "tool-1".into(),
                        tool_name: "skill".into(),
                    }),
                    ClientMessage::Event(AgentEvent::ApprovalResolved {
                        tool_call_id: "tool-1".into(),
                        outcome: crate::coordinator::ApprovalOutcome::Approved,
                    }),
                    ClientMessage::Event(AgentEvent::ReplyFinished),
                    ClientMessage::Event(AgentEvent::AgentSettled {
                        outcome: crate::coordinator::AgentOutcome::Success,
                        duration_ms: 1200,
                    }),
                    ClientMessage::Goodbye,
                ],
            ),
            (
                include_bytes!("../../protocol/fixtures/unknown-fields.jsonl").as_slice(),
                vec![
                    ClientMessage::Hello {
                        client_id: "client-1".into(),
                        session_id: "session-1".into(),
                    },
                    ClientMessage::Event(AgentEvent::TurnStarted),
                ],
            ),
        ];

        for (fixture, expected) in cases {
            let parsed = fixture
                .split(|byte| *byte == b'\n')
                .filter(|line| !line.is_empty())
                .map(parse_message)
                .collect::<Vec<_>>();
            assert_eq!(parsed, expected);
        }

        for fixture in [
            include_bytes!("../../protocol/fixtures/unknown-type.jsonl").as_slice(),
            include_bytes!("../../protocol/fixtures/unknown-event.jsonl").as_slice(),
            include_bytes!("../../protocol/fixtures/missing-fields.jsonl").as_slice(),
            include_bytes!("../../protocol/fixtures/malformed.jsonl").as_slice(),
        ] {
            for line in fixture
                .split(|byte| *byte == b'\n')
                .filter(|line| !line.is_empty())
            {
                assert_eq!(parse_message(line), ClientMessage::Ignore);
            }
        }
    }
}
