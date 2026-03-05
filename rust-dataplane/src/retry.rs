use std::time::Duration;

use rand::Rng;
use tracing::{info, warn};

/// Retry with exponential backoff + jitter for transient failures.
pub struct RetryPolicy {
    max_attempts: u32,
    base_delay: Duration,
}

impl RetryPolicy {
    pub fn new(max_attempts: u32, base_delay_ms: u64) -> Self {
        Self {
            max_attempts,
            base_delay: Duration::from_millis(base_delay_ms),
        }
    }

    /// Execute an async operation with retries. Returns the result on success,
    /// or the last error if all attempts fail.
    pub async fn execute<F, Fut, T, E>(&self, operation: F) -> Result<T, E>
    where
        F: Fn() -> Fut,
        Fut: std::future::Future<Output = Result<T, E>>,
        E: std::fmt::Display,
    {
        let mut last_err = None;

        for attempt in 1..=self.max_attempts {
            match operation().await {
                Ok(result) => return Ok(result),
                Err(e) => {
                    if attempt == self.max_attempts {
                        warn!(attempt, max = self.max_attempts, error = %e, "All retry attempts exhausted");
                        last_err = Some(e);
                    } else {
                        let delay = self.compute_delay(attempt);
                        info!(attempt, max = self.max_attempts, delay_ms = delay.as_millis() as u64, error = %e, "Retrying after transient failure");
                        tokio::time::sleep(delay).await;
                        last_err = Some(e);
                    }
                }
            }
        }

        Err(last_err.unwrap())
    }

    fn compute_delay(&self, attempt: u32) -> Duration {
        let base_ms = self.base_delay.as_millis() as u64;
        let exp_ms = base_ms * 2u64.pow(attempt - 1);
        let capped_ms = exp_ms.min(30_000); // Cap at 30s

        // Add jitter: random value between 0 and exp_ms
        let mut rng = rand::thread_rng();
        let jitter = rng.gen_range(0..=capped_ms / 2);
        Duration::from_millis(capped_ms + jitter)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU32, Ordering};

    #[tokio::test]
    async fn test_retry_succeeds_first_attempt() {
        let policy = RetryPolicy::new(3, 10);
        let result: Result<i32, String> = policy.execute(|| async { Ok(42) }).await;
        assert_eq!(result.unwrap(), 42);
    }

    #[tokio::test]
    async fn test_retry_succeeds_after_failures() {
        let counter = std::sync::Arc::new(AtomicU32::new(0));
        let policy = RetryPolicy::new(3, 10);
        let c = counter.clone();
        let result: Result<i32, String> = policy
            .execute(|| {
                let c = c.clone();
                async move {
                    let attempt = c.fetch_add(1, Ordering::Relaxed);
                    if attempt < 2 {
                        Err("transient".to_string())
                    } else {
                        Ok(42)
                    }
                }
            })
            .await;
        assert_eq!(result.unwrap(), 42);
        assert_eq!(counter.load(Ordering::Relaxed), 3);
    }

    #[tokio::test]
    async fn test_retry_all_failures() {
        let policy = RetryPolicy::new(2, 10);
        let result: Result<i32, String> = policy
            .execute(|| async { Err("permanent".to_string()) })
            .await;
        assert!(result.is_err());
    }
}
