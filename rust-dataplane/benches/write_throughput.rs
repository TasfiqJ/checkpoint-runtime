use criterion::{criterion_group, criterion_main, Criterion, Throughput};

fn checksum_benchmark(c: &mut Criterion) {
    use sha2::{Digest, Sha256};

    let data = vec![0u8; 4 * 1024 * 1024]; // 4MB chunk

    let mut group = c.benchmark_group("checksum");
    group.throughput(Throughput::Bytes(data.len() as u64));

    group.bench_function("sha256_4mb", |b| {
        b.iter(|| {
            let mut hasher = Sha256::new();
            hasher.update(&data);
            hex::encode(hasher.finalize())
        })
    });

    group.finish();
}

criterion_group!(benches, checksum_benchmark);
criterion_main!(benches);
