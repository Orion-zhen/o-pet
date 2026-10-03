use std::sync::{Arc, Mutex};

use super::{
    AnimationSink,
    protocol::{ClientMessage, LineDecoder, parse_message},
    publish_change,
};
use crate::coordinator::Coordinator;

pub(super) struct Connection {
    id: u64,
    coordinator: Arc<Mutex<Coordinator>>,
    sink: AnimationSink,
    hello_received: bool,
    decoder: LineDecoder,
}

impl Connection {
    pub(super) fn new(id: u64, coordinator: Arc<Mutex<Coordinator>>, sink: AnimationSink) -> Self {
        coordinator
            .lock()
            .expect("coordinator mutex poisoned")
            .connect(id);
        Self {
            id,
            coordinator,
            sink,
            hello_received: false,
            decoder: LineDecoder::default(),
        }
    }

    pub(super) fn receive(&mut self, bytes: &[u8]) -> bool {
        let batch = self.decoder.push(bytes);
        for line in batch.lines {
            match parse_message(&line) {
                ClientMessage::Hello { .. } if !self.hello_received => {
                    self.hello_received = true;
                }
                ClientMessage::Event(event) if self.hello_received => {
                    publish_change(
                        self.coordinator
                            .lock()
                            .expect("coordinator mutex poisoned")
                            .event(self.id, event),
                        &self.sink,
                    );
                }
                ClientMessage::Goodbye => return false,
                ClientMessage::Hello { .. } | ClientMessage::Event(_) | ClientMessage::Ignore => {}
            }
        }
        !batch.oversized
    }
}

impl Drop for Connection {
    fn drop(&mut self) {
        publish_change(
            self.coordinator
                .lock()
                .expect("coordinator mutex poisoned")
                .disconnect(self.id),
            &self.sink,
        );
    }
}
