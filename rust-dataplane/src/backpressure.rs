use tokio::sync::mpsc;
use tracing::{debug, warn};

/// Bounded queue for backpressure between gRPC receiver and S3 uploader.
/// When the queue is full, senders will block, propagating backpressure
/// through the gRPC streaming interface.
pub struct BoundedQueue<T> {
    tx: mpsc::Sender<T>,
    rx: mpsc::Receiver<T>,
    capacity: usize,
}

impl<T: Send + 'static> BoundedQueue<T> {
    pub fn new(capacity: usize) -> Self {
        let (tx, rx) = mpsc::channel(capacity);
        Self { tx, rx, capacity }
    }

    pub fn sender(&self) -> mpsc::Sender<T> {
        self.tx.clone()
    }

    pub fn capacity(&self) -> usize {
        self.capacity
    }

    pub async fn recv(&mut self) -> Option<T> {
        self.rx.recv().await
    }
}

/// Wrapper that tracks queue depth for metrics reporting.
pub struct BackpressureController {
    queue_depth: std::sync::atomic::AtomicUsize,
    max_depth: usize,
}

impl BackpressureController {
    pub fn new(max_depth: usize) -> Self {
        Self {
            queue_depth: std::sync::atomic::AtomicUsize::new(0),
            max_depth,
        }
    }

    pub fn increment(&self) {
        let prev = self
            .queue_depth
            .fetch_add(1, std::sync::atomic::Ordering::Relaxed);
        if prev + 1 >= self.max_depth {
            warn!(
                depth = prev + 1,
                max = self.max_depth,
                "Backpressure queue near capacity"
            );
        } else {
            debug!(depth = prev + 1, "Queue depth increased");
        }
    }

    pub fn decrement(&self) {
        self.queue_depth
            .fetch_sub(1, std::sync::atomic::Ordering::Relaxed);
    }

    pub fn depth(&self) -> usize {
        self.queue_depth
            .load(std::sync::atomic::Ordering::Relaxed)
    }

    pub fn max_depth(&self) -> usize {
        self.max_depth
    }
}
