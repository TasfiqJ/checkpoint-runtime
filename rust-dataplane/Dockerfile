FROM rust:1.85-bookworm AS builder

# protoc is required by prost-build >= 0.13
RUN apt-get update && apt-get install -y protobuf-compiler && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy proto files first (for build.rs)
COPY proto/ /app/proto/

# Copy manifest and lock
COPY rust-dataplane/Cargo.toml rust-dataplane/Cargo.lock* rust-dataplane/build.rs ./

# Create dummy source files to cache dependencies
RUN mkdir -p src benches && \
    echo 'fn main() { println!("placeholder"); }' > src/main.rs && \
    echo 'pub fn lib() {}' > src/lib.rs && \
    echo 'fn main() {}' > benches/write_throughput.rs
RUN cargo build --release 2>/dev/null || true

# Copy actual source and benches
COPY rust-dataplane/src/ ./src/
COPY rust-dataplane/benches/ ./benches/

# Build the real binary
RUN cargo build --release

FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y ca-certificates && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/target/release/ckpt-dataplane /usr/local/bin/ckpt-dataplane

ENV GRPC_PORT=50051
ENV METRICS_PORT=9090
EXPOSE 50051 9090

CMD ["ckpt-dataplane"]
