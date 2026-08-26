use std::ffi::OsString;

use crate::actions;

#[derive(Debug, Eq, PartialEq)]
pub(crate) enum Command {
    Run,
    ListActions,
    ShowAction(String),
    Help,
}

pub(crate) fn parse(args: impl IntoIterator<Item = OsString>) -> Result<Command, String> {
    let args = args
        .into_iter()
        .map(|value| {
            value
                .into_string()
                .map_err(|_| "命令行参数必须是有效 UTF-8".to_owned())
        })
        .collect::<Result<Vec<_>, _>>()?;

    match args.as_slice() {
        [] => Ok(Command::Run),
        [flag] if flag == "--list-actions" => Ok(Command::ListActions),
        [flag, name] if flag == "--show-action" => {
            if actions::contains(name) {
                Ok(Command::ShowAction(name.clone()))
            } else {
                Err(format!(
                    "未知动画预设 {name:?}\n可用预设: {}",
                    actions::names().join(", ")
                ))
            }
        }
        [flag] if flag == "--show-action" => Err("--show-action 需要一个动画预设名".into()),
        [flag] if flag == "--help" || flag == "-h" => Ok(Command::Help),
        _ => Err(format!("无效命令行参数\n{}", usage())),
    }
}

pub(crate) const fn usage() -> &'static str {
    "用法:\n  o-pet\n  o-pet --list-actions\n  o-pet --show-action <name>"
}

#[cfg(test)]
mod tests {
    use super::*;

    fn parse_strings(args: &[&str]) -> Result<Command, String> {
        parse(args.iter().map(OsString::from))
    }

    #[test]
    fn parses_supported_commands() {
        assert_eq!(parse_strings(&[]), Ok(Command::Run));
        assert_eq!(parse_strings(&["--list-actions"]), Ok(Command::ListActions));
        assert_eq!(
            parse_strings(&["--show-action", "happy"]),
            Ok(Command::ShowAction("happy".into()))
        );
        assert_eq!(parse_strings(&["--help"]), Ok(Command::Help));
    }

    #[test]
    fn rejects_missing_unknown_and_extra_arguments() {
        assert_eq!(
            parse_strings(&["--show-action"]),
            Err("--show-action 需要一个动画预设名".into())
        );
        assert!(parse_strings(&["--show-action", "missing"]).is_err());
        assert!(parse_strings(&["--list-actions", "extra"]).is_err());
    }
}
