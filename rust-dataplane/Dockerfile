FROM rust:1.78-bookworm AS builder

WORKDIR /app

# Copy proto files first (for build.rs)
COPY proto/ /app/proto/

# Copy manifest and lock
COPY rust-dataplane/Cargo.toml rust-dataplane/Cargo.lock* rust-dataplane/build.rs ./

# Create dummy main to cache dependencies
RUN mkdir src && echo 'fn main() { println!("placeholder"); }' > src/main.rs
RUN cargo build --release 2>/dev/null || true

# Copy actual source
COPY rust-dataplane/src/ ./src/

# Build the real binary
RUN cargo build --release

FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y ca-certificates && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/target/release/ckpt-dataplane /usr/local/bin/ckpt-dataplane

ENV GRPC_PORT=50051
ENV METRICS_PORT=9090
EXPOSE 50051 9090

CMD ["ckpt-dataplane"]
