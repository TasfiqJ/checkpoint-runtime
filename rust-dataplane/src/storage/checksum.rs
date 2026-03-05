use sha2::{Digest, Sha256};

/// Compute SHA-256 checksum of the given data, returning the hex-encoded string.
pub fn sha256_hex(data: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(data);
    hex::encode(hasher.finalize())
}

/// Streaming SHA-256 hasher that can process chunks incrementally.
pub struct StreamingChecksum {
    hasher: Sha256,
    total_bytes: u64,
}

impl StreamingChecksum {
    pub fn new() -> Self {
        Self {
            hasher: Sha256::new(),
            total_bytes: 0,
        }
    }

    pub fn update(&mut self, data: &[u8]) {
        self.hasher.update(data);
        self.total_bytes += data.len() as u64;
    }

    pub fn finalize(self) -> (String, u64) {
        let checksum = hex::encode(self.hasher.finalize());
        (checksum, self.total_bytes)
    }

    pub fn total_bytes(&self) -> u64 {
        self.total_bytes
    }
}

impl Default for StreamingChecksum {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_sha256_hex_empty() {
        let result = sha256_hex(b"");
        assert_eq!(
            result,
            "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
        );
    }

    #[test]
    fn test_sha256_hex_known_value() {
        let result = sha256_hex(b"hello world");
        assert_eq!(
            result,
            "b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9"
        );
    }

    #[test]
    fn test_streaming_checksum() {
        let mut sc = StreamingChecksum::new();
        sc.update(b"hello ");
        sc.update(b"world");
        let (checksum, total) = sc.finalize();
        assert_eq!(total, 11);
        assert_eq!(
            checksum,
            "b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9"
        );
    }
}
