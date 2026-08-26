#![cfg_attr(target_os = "windows", windows_subsystem = "windows")]

mod actions;
mod cli;
mod config;
mod platform;
mod renderer;

fn command() -> Result<cli::Command, String> {
    cli::parse(std::env::args_os().skip(1))
}

fn print_actions() {
    for action in actions::names() {
        println!("{action}");
    }
}

fn print_help() {
    println!("{}", cli::usage());
}

#[cfg(target_os = "linux")]
fn main() -> gtk::glib::ExitCode {
    match command() {
        Ok(cli::Command::Run) => platform::linux::run(None),
        Ok(cli::Command::ShowAction(action)) => platform::linux::run(Some(action)),
        Ok(cli::Command::ListActions) => {
            print_actions();
            0.into()
        }
        Ok(cli::Command::Help) => {
            print_help();
            0.into()
        }
        Err(error) => {
            eprintln!("{error}");
            2.into()
        }
    }
}

#[cfg(target_os = "macos")]
fn main() {
    match command() {
        Ok(cli::Command::Run) => platform::macos::run(None),
        Ok(cli::Command::ShowAction(action)) => platform::macos::run(Some(action)),
        Ok(cli::Command::ListActions) => print_actions(),
        Ok(cli::Command::Help) => print_help(),
        Err(error) => {
            eprintln!("{error}");
            std::process::exit(2);
        }
    }
}

#[cfg(target_os = "windows")]
fn main() {
    match command() {
        Ok(cli::Command::Run) => platform::windows::run(None),
        Ok(cli::Command::ShowAction(action)) => platform::windows::run(Some(action)),
        Ok(cli::Command::ListActions) => print_actions(),
        Ok(cli::Command::Help) => print_help(),
        Err(error) => {
            eprintln!("{error}");
            std::process::exit(2);
        }
    }
}

#[cfg(not(any(target_os = "linux", target_os = "macos", target_os = "windows")))]
fn main() {
    match command() {
        Ok(cli::Command::ListActions) => print_actions(),
        Ok(cli::Command::Help) => print_help(),
        Ok(cli::Command::Run | cli::Command::ShowAction(_)) => {
            eprintln!("o-pet 不支持当前平台");
            std::process::exit(1);
        }
        Err(error) => {
            eprintln!("{error}");
            std::process::exit(2);
        }
    }
}
