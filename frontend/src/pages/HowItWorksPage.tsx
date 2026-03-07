export default function HowItWorksPage() {
  return (
    <div className="max-w-3xl mx-auto space-y-12 py-4">
      <header>
        <h1 className="text-3xl font-bold text-txt-1 tracking-tight">
          How It Works
        </h1>
        <p className="text-sm text-txt-2 mt-2 leading-relaxed">
          A detailed walkthrough of every backend component, what it does, and why it exists.
        </p>
      </header>

      {/* -- THE PROBLEM ------------------------------------------------- */}
      <Section title="The Problem -- Why This Exists">
        <P>
          You're training a neural network across 2 machines. It takes 1,000 steps.
          At step 850, one machine crashes. The operating system killed it because it ran out of memory.
          Or the network dropped. Or someone tripped over a power cable. Doesn't matter -- it's dead.
        </P>
        <P>
          Without checkpointing, you start over from step 0. All 850 steps of work? Gone.
          The model weights, the optimizer momentum, the learning rate schedule -- all of it was in RAM,
          and RAM is empty after a crash.
        </P>
        <P>
          Now imagine this at scale. OpenAI, Google, Meta -- they train models on <Strong>thousands</Strong> of
          GPUs for <Strong>weeks</Strong>. A single GPU failure every few hours is normal. Without checkpointing,
          large-scale training is literally impossible.
        </P>
        <P>
          This system solves that. Every 50 training steps, it saves the model's brain (the weights and
          optimizer state) to storage. When a machine dies, the new machine loads the last save and picks
          up right where the dead one left off.
        </P>
      </Section>

      {/* -- THE ARCHITECTURE -------------------------------------------- */}
      <Section title="The Architecture -- Two Planes">
        <P>
          The system is split into two halves. This is the same pattern used at companies like
          OpenAI and Anyscale for their training infrastructure.
        </P>

        <SubSection title="Control Plane (Python / FastAPI)">
          <P>
            The brain. It doesn't touch any training data. It only manages <Strong>state</Strong> -- who's alive,
            who's dead, what step are we on, is a checkpoint in progress.
          </P>
          <BulletList items={[
            'Written in Python because it coordinates with PyTorch workers (also Python)',
            'Runs a FastAPI REST server on port 8000',
            'Talks to etcd (a distributed key-value store) to track worker leases and run state',
            'Talks to the Rust data plane over gRPC to trigger checkpoint writes and reads',
            'Manages an 8-state lifecycle state machine for each training run',
          ]} />
        </SubSection>

        <SubSection title="Data Plane (Rust / Tokio / gRPC)">
          <P>
            The muscle. It handles the actual bytes -- receiving checkpoint data over gRPC,
            computing SHA-256 checksums, and writing to MinIO (S3-compatible object storage).
          </P>
          <BulletList items={[
            'Written in Rust for speed -- no garbage collector pauses during large uploads',
            'Uses Tokio async runtime for concurrent I/O (multiple shards uploading at once)',
            'Exposes a gRPC server on port 50051 using the tonic framework',
            'Implements backpressure -- if the upload queue is full, it tells the control plane to slow down',
            'Retries failed S3 uploads with exponential backoff + jitter (random delay to prevent thundering herd)',
          ]} />
        </SubSection>

        <SubSection title="Why Split Them?">
          <P>
            Python is great for orchestration but slow at I/O-heavy work. Rust is great at I/O but
            overkill for managing state machines. By splitting them, each part uses the best tool for
            the job. The control plane can be restarted without interrupting an in-progress upload,
            and the data plane can be scaled independently.
          </P>
        </SubSection>
      </Section>

      {/* -- WHAT HAPPENS WHEN A CHECKPOINT SAVES ------------------------ */}
      <Section title="What Happens When a Checkpoint Saves">
        <P>
          Let's say training is at step 100 and it's time to save. Here's every single thing
          that happens, in order:
        </P>

        <Step n={1} title="Worker serializes the model">
          <P>
            The PyTorch worker on rank 0 calls <Code>torch.save()</Code> to convert the model
            weights and optimizer state into raw bytes. This is a <Code>state_dict</Code> -- a
            Python dictionary where keys are layer names and values are tensors.
          </P>
          <CodeBlock>{`state = {
    "model_state_dict": model.state_dict(),
    "optimizer_state_dict": optimizer.state_dict(),
    "step": 100,
    "loss": 0.234,
}
buffer = io.BytesIO()
torch.save(state, buffer)
shard_data = buffer.getvalue()  # raw bytes, ~2.5 MB`}</CodeBlock>
        </Step>

        <Step n={2} title="Worker tells the control plane: 'start a checkpoint'">
          <P>
            The worker sends an HTTP POST request to the control plane:
          </P>
          <CodeBlock>{`POST /api/runs/{run_id}/checkpoint
Body: {"step": 100}

Response: {"checkpoint_id": "ckpt-a1b2c3d4"}`}</CodeBlock>
          <P>
            The control plane changes the run's state from <Code>RUNNING</Code> to{' '}
            <Code>CHECKPOINTING</Code>. This is stored in etcd so all services know
            a checkpoint is in progress.
          </P>
        </Step>

        <Step n={3} title="Worker uploads the bytes through the control plane to the data plane">
          <P>
            The worker sends the raw bytes to the control plane via HTTP:
          </P>
          <CodeBlock>{`POST /api/runs/{run_id}/checkpoints/{checkpoint_id}/shards/rank-0
Content-Type: application/octet-stream
Body: <2.5 MB of raw bytes>`}</CodeBlock>
          <P>
            The control plane doesn't store these bytes. It immediately forwards them to
            the Rust data plane over gRPC using <Strong>streaming</Strong>. The bytes are split into
            4 MB chunks and sent one at a time:
          </P>
          <CodeBlock>{`// Python control plane -> Rust data plane (gRPC)
WriteShard(stream of ShardChunk messages)

Each ShardChunk = {
    checkpoint_id: "run-xyz/ckpt-a1b2c3d4",  // composite encoding!
    shard_id: "rank-0",
    data: <4 MB chunk>,
    chunk_index: 0,
    total_chunks: 1,
}`}</CodeBlock>
          <P>
            Notice the <Code>checkpoint_id</Code> field. The gRPC proto doesn't have a
            separate <Code>run_id</Code> field, so the Python side encodes both as{' '}
            <Code>"run_id/checkpoint_id"</Code>. The Rust side splits on <Code>/</Code> to
            recover both values. This is a real integration detail that took debugging to get right.
          </P>
        </Step>

        <Step n={4} title="Rust data plane writes to MinIO with content-addressed keys">
          <P>
            The Rust service receives the bytes, computes a SHA-256 hash, and uploads to MinIO:
          </P>
          <CodeBlock>{`// Rust data plane
let hash = sha256(all_chunks);
let storage_key = format!(
    "{run_id}/{checkpoint_id}/sha256-{hash_prefix}-{shard_id}.bin"
);
// Example: "run-xyz/ckpt-a1b2/sha256-a1b2c3d4e5f6-rank-0.bin"

s3_client.put_object(bucket, storage_key, bytes).await?;

// Also writes a checksum sidecar file:
// "run-xyz/ckpt-a1b2/rank-0.sha256" containing the full hash`}</CodeBlock>
          <P>
            The key contains the hash. This means if you upload the exact same bytes twice,
            you get the exact same key -- so it's <Strong>deduplicated automatically</Strong>.
            This is called content-addressed storage.
          </P>
        </Step>

        <Step n={5} title="Worker tells the control plane: 'commit this checkpoint'">
          <P>
            After all shards are uploaded, the worker sends:
          </P>
          <CodeBlock>{`POST /api/runs/{run_id}/commit`}</CodeBlock>
          <P>
            The control plane tells the Rust data plane to write a <Code>_manifest.json</Code> file:
          </P>
          <CodeBlock>{`// Written to MinIO: run-xyz/ckpt-a1b2/_manifest.json
{
    "checkpoint_id": "ckpt-a1b2c3d4",
    "run_id": "run-xyz",
    "step": 100,
    "created_at": "2026-03-06T14:35:42Z",
    "num_shards": 1,
    "total_bytes": 2567890,
    "shards": [{
        "shard_id": "rank-0",
        "size_bytes": 2567890,
        "sha256": "a1b2c3d4e5f6g7h8...",
        "storage_key": "run-xyz/ckpt-a1b2/sha256-a1b2c3d4e5f6-rank-0.bin"
    }]
}`}</CodeBlock>
          <P>
            The manifest is the <Strong>atomic commit point</Strong>. If the manifest file
            exists in MinIO, the checkpoint is complete. If it doesn't exist, the checkpoint
            failed and the shard files are garbage. This is how databases work too -- write the data
            first, then write a commit record.
          </P>
          <P>
            The run state transitions: <Code>CHECKPOINTING {'\u2192'} COMMITTED {'\u2192'} RUNNING</Code>.
            Training continues.
          </P>
        </Step>
      </Section>

      {/* -- WHAT HAPPENS WHEN A WORKER DIES ----------------------------- */}
      <Section title="What Happens When a Worker Dies">
        <P>
          You click the "Kill" button on the demo page. Here's every single thing that happens:
        </P>

        <Step n={1} title="The container is killed">
          <P>
            The frontend sends <Code>POST /api/demo/kill-worker/ckpt-worker-0</Code>.
            The control plane runs:
          </P>
          <CodeBlock>{`subprocess.run(["docker", "kill", "ckpt-worker-0"])`}</CodeBlock>
          <P>
            This sends SIGKILL to the container. The process is dead instantly. No graceful shutdown,
            no cleanup -- just like a real hardware failure.
          </P>
        </Step>

        <Step n={2} title="The control plane detects the death (5-15 seconds)">
          <P>
            Every worker sends a heartbeat to etcd every 5 seconds. Each heartbeat renews a
            <Strong> lease</Strong> with a 10-second TTL (time to live). When the worker dies,
            the heartbeats stop. After 10 seconds, the etcd lease expires.
          </P>
          <P>
            The control plane's HeartbeatManager polls every 3 seconds. When it sees the expired
            lease, it transitions the run state:
          </P>
          <CodeBlock>{`RUNNING -> FAILED

// Log: "Worker ckpt-worker-0 heartbeat timeout -- marking run as FAILED"`}</CodeBlock>
        </Step>

        <Step n={3} title="The container auto-restarts (3 seconds after kill)">
          <P>
            Back when the kill happened, the control plane also scheduled an auto-restart:
          </P>
          <CodeBlock>{`async def _restart():
    await asyncio.sleep(3)
    subprocess.run(["docker", "start", "ckpt-worker-0"])

asyncio.create_task(_restart())`}</CodeBlock>
          <P>
            Why not use Docker's built-in <Code>restart: always</Code> policy? Because on
            Docker Desktop for Windows, <Code>docker kill</Code> does NOT trigger the restart
            policy. This is a real Docker Desktop bug. The workaround is this manual restart.
          </P>
        </Step>

        <Step n={4} title="The restarted worker finds the old run">
          <P>
            When the worker starts, it checks for an existing run ID in a shared volume:
          </P>
          <CodeBlock>{`# Worker startup (train.py)
run_id = read_file("/shared/run_id")  # from previous run
status = GET /api/runs/{run_id}

if status.state in ("FAILED", "RECOVERING"):
    # This is OUR old run -- resume it
    POST /api/runs/{run_id}/resume`}</CodeBlock>
          <P>
            The control plane transitions: <Code>FAILED {'\u2192'} RECOVERING {'\u2192'} RUNNING</Code>
          </P>
        </Step>

        <Step n={5} title="The worker loads the last checkpoint from MinIO">
          <P>
            The worker asks the control plane for the list of checkpoints, finds the last one
            with state <Code>COMMITTED</Code>, and downloads the shard bytes:
          </P>
          <CodeBlock>{`GET /api/runs/{run_id}/checkpoints
-> [{checkpoint_id: "ckpt-a1b2", step: 100, state: "COMMITTED"}, ...]

GET /api/runs/{run_id}/checkpoints/ckpt-a1b2/shards/rank-0
-> <2.5 MB of raw bytes>  (fetched from MinIO via Rust data plane)`}</CodeBlock>
          <P>
            The worker deserializes the bytes back into PyTorch tensors:
          </P>
          <CodeBlock>{`state = torch.load(io.BytesIO(shard_bytes))
model.load_state_dict(state["model_state_dict"])
optimizer.load_state_dict(state["optimizer_state_dict"])
start_step = state["step"]  # 100, not 0!`}</CodeBlock>
        </Step>

        <Step n={6} title="Training resumes from step 100">
          <P>
            The training loop starts from <Code>step=100</Code> instead of <Code>step=0</Code>.
            The model weights are exactly where they were before the crash.
            The optimizer momentum is restored. No work was lost.
          </P>
          <CodeBlock>{`# Log: "Restored from checkpoint: step=100, loss=0.234"
# Training continues: step=101, step=102, step=103...`}</CodeBlock>
        </Step>
      </Section>

      {/* -- THE STATE MACHINE ------------------------------------------- */}
      <Section title="The State Machine -- 8 States">
        <P>
          Every training run has a state. The control plane enforces that only valid transitions
          happen. You can't go from <Code>COMPLETED</Code> to <Code>RUNNING</Code>,
          for example. Here are all the states:
        </P>

        <div className="card overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-line">
                <th className="table-header">State</th>
                <th className="table-header">Meaning</th>
                <th className="table-header">Next States</th>
              </tr>
            </thead>
            <tbody className="text-txt-2">
              {[
                ['CREATED', 'Run registered, not started yet', 'RUNNING, CANCELLED'],
                ['RUNNING', 'Training is actively happening', 'CHECKPOINTING, FAILED, COMPLETED, CANCELLED'],
                ['CHECKPOINTING', 'Saving model bytes to storage', 'COMMITTED, FAILED'],
                ['COMMITTED', 'Checkpoint saved successfully', 'RUNNING, FAILED'],
                ['FAILED', 'Worker died or heartbeat timed out', 'RECOVERING, CANCELLED'],
                ['RECOVERING', 'Loading checkpoint, about to resume', 'RUNNING, FAILED'],
                ['COMPLETED', 'Training finished all steps (terminal)', 'none'],
                ['CANCELLED', 'Manually stopped (terminal)', 'none'],
              ].map(([state, meaning, next]) => (
                <tr key={state} className="border-b border-line-subtle">
                  <td className="table-cell font-mono text-brand-violet">{state}</td>
                  <td className="table-cell">{meaning}</td>
                  <td className="table-cell font-mono text-txt-3">{next}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <P>
          The normal loop is: <Code>RUNNING {'\u2192'} CHECKPOINTING {'\u2192'} COMMITTED {'\u2192'} RUNNING</Code> (repeat).
        </P>
        <P>
          The failure/recovery path is: <Code>RUNNING {'\u2192'} FAILED {'\u2192'} RECOVERING {'\u2192'} RUNNING</Code>.
        </P>
        <P>
          All transitions are stored in etcd with timestamps, so you get a full audit trail
          of everything that happened during training.
        </P>
      </Section>

      {/* -- COORDINATION WITH ETCD -------------------------------------- */}
      <Section title="etcd -- The Coordination Layer">
        <P>
          etcd is a distributed key-value store. Think of it as a shared dictionary that
          multiple services can read and write to, with strong consistency guarantees (if
          you write a value, everyone sees it immediately).
        </P>
        <P>
          This system uses etcd for three things:
        </P>
        <BulletList items={[
          'Worker leases -- each worker holds a lease with a 10-second TTL. If the worker stops renewing it, the lease expires and the control plane knows the worker is dead.',
          'Run state -- the current state (RUNNING, FAILED, etc.) and metadata (current step, run ID) are stored in etcd keys.',
          'Checkpoint metadata -- which checkpoints exist, what step they\'re at, and whether they\'re committed.',
        ]} />
        <P>
          Why etcd instead of a regular database? Because etcd has built-in lease TTLs.
          You create a lease, attach it to a key, and if the lease isn't renewed within the TTL,
          the key is automatically deleted. This is exactly what we need for heartbeat-based
          failure detection -- no custom timer code needed.
        </P>
      </Section>

      {/* -- STORAGE ----------------------------------------------------- */}
      <Section title="MinIO -- The Storage Layer">
        <P>
          MinIO is an open-source S3-compatible object store. It speaks the exact same API
          as Amazon S3, so the Rust data plane uses the AWS S3 SDK to talk to it. If you
          swapped MinIO for real S3, you'd change one environment variable and everything
          would still work.
        </P>
        <P>
          File layout in the bucket:
        </P>
        <CodeBlock>{`checkpoints/
└── run-abc123/
    ├── ckpt-001/
    │   ├── sha256-a1b2c3d4e5f6-rank-0.bin   (2.4 MB -- model weights)
    │   ├── rank-0.sha256                      (64 bytes -- checksum)
    │   └── _manifest.json                     (commit proof)
    └── ckpt-002/
        ├── sha256-f7g8h9i0j1k2-rank-0.bin   (2.4 MB)
        ├── rank-0.sha256
        └── _manifest.json`}</CodeBlock>
        <P>
          The <Code>.bin</Code> files contain the actual model weights. The filename includes
          the first 12 characters of the SHA-256 hash of the contents. The <Code>.sha256</Code> file
          contains the full 64-character hash for verification. The <Code>_manifest.json</Code> is
          the commit record that proves the checkpoint completed successfully.
        </P>
      </Section>

      {/* -- OBSERVABILITY ----------------------------------------------- */}
      <Section title="Observability -- Metrics, Traces, Dashboards">
        <P>
          The system exports telemetry data through OpenTelemetry, which feeds into three
          backends:
        </P>
        <SubSection title="Prometheus (Metrics)">
          <P>
            Numbers over time. The control plane exports metrics in Prometheus format at{' '}
            <Code>/api/metrics/prometheus</Code>:
          </P>
          <BulletList items={[
            'controlplane_checkpoints_total -- how many checkpoints have been created',
            'controlplane_checkpoint_duration_seconds -- how long each checkpoint save takes',
            'controlplane_worker_heartbeat_lag_seconds -- how stale each worker\'s last heartbeat is',
            'controlplane_active_workers -- how many workers are currently alive',
          ]} />
        </SubSection>
        <SubSection title="Grafana (Dashboards)">
          <P>
            Visualizes Prometheus metrics as graphs and charts. There's a pre-built dashboard
            showing checkpoint throughput, worker health, and recovery timelines. Accessible
            on port 3001.
          </P>
        </SubSection>
        <SubSection title="Jaeger (Distributed Tracing)">
          <P>
            Traces show the path of a single request across multiple services. When a checkpoint
            saves, you can see the trace: Worker {'\u2192'} Control Plane {'\u2192'} Rust Data Plane {'\u2192'} MinIO,
            with timing for each hop. This is how you debug latency issues in distributed systems.
            Accessible on port 16686.
          </P>
        </SubSection>
      </Section>

      {/* -- DDP --------------------------------------------------------- */}
      <Section title="PyTorch DDP -- How the Workers Train">
        <P>
          DDP stands for Distributed Data Parallel. It's PyTorch's built-in way to train
          one model across multiple machines. Each worker has a full copy of the model.
          Each worker gets a different slice of the training data. After computing gradients,
          all workers sync their gradients using <Strong>all-reduce</Strong> (every worker
          sends its gradients to every other worker, and they all average them).
        </P>
        <P>
          This system uses the <Code>gloo</Code> backend (CPU-only) instead of <Code>nccl</Code> (GPU).
          Since this is a demo running on a VPS without GPUs, gloo works over regular TCP.
          To switch to GPU training, you'd change one line: <Code>backend="nccl"</Code>.
        </P>
        <P>
          Only rank-0 (the first worker) saves checkpoints. The other workers don't need to
          save because in DDP with gloo, all workers have identical model weights after each
          all-reduce step. When recovering, non-rank-0 workers fall back to loading rank-0's
          shard -- they'll get the same weights.
        </P>
      </Section>

      {/* -- DOCKER ------------------------------------------------------ */}
      <Section title="The Docker Stack -- 11 Services">
        <P>
          Everything runs in Docker Compose. Here's every single container:
        </P>
        <div className="card overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-line">
                <th className="table-header">Container</th>
                <th className="table-header">Port</th>
                <th className="table-header">What It Does</th>
              </tr>
            </thead>
            <tbody className="text-txt-2">
              {[
                ['ckpt-etcd', '2379', 'Coordination store for leases, run state, metadata'],
                ['ckpt-minio', '9000', 'S3-compatible object storage for checkpoint files'],
                ['ckpt-dataplane', '50051', 'Rust gRPC server -- writes/reads shards to MinIO'],
                ['ckpt-controlplane', '8000', 'Python REST API -- orchestrates everything'],
                ['ckpt-worker-0', '--', 'PyTorch DDP worker rank 0 (saves checkpoints)'],
                ['ckpt-worker-1', '--', 'PyTorch DDP worker rank 1 (trains in parallel)'],
                ['ckpt-frontend', '3000', 'React dashboard and this page you\'re reading'],
                ['ckpt-otel', '4317', 'OpenTelemetry Collector -- receives and routes telemetry'],
                ['ckpt-prometheus', '9090', 'Time-series database for metrics'],
                ['ckpt-grafana', '3001', 'Dashboard UI for metrics visualization'],
                ['ckpt-jaeger', '16686', 'Distributed tracing UI'],
              ].map(([name, port, desc]) => (
                <tr key={name} className="border-b border-line-subtle">
                  <td className="table-cell font-mono text-brand-violet">{name}</td>
                  <td className="table-cell font-mono text-txt-3">{port}</td>
                  <td className="table-cell">{desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      {/* -- TECH DECISIONS ---------------------------------------------- */}
      <Section title="Why These Technology Choices">
        <div className="grid gap-3">
          <TechChoice
            tech="Rust for the Data Plane"
            reason="Checkpoint data can be gigabytes. Rust has zero-cost abstractions, no garbage collector pauses, and async I/O via Tokio. A Python data plane would add seconds of GC latency during large uploads."
          />
          <TechChoice
            tech="gRPC for Control-Data communication"
            reason="gRPC supports streaming -- the control plane can send checkpoint bytes as a stream of chunks instead of buffering the entire thing in memory. It also generates type-safe client/server code from .proto files."
          />
          <TechChoice
            tech="etcd for coordination"
            reason="Built-in lease TTLs make heartbeat-based failure detection trivial. Strong consistency means all services see the same state. Used in production by Kubernetes itself."
          />
          <TechChoice
            tech="MinIO for storage"
            reason="API-compatible with Amazon S3. Runs locally in Docker for development. Switch to real S3 by changing one environment variable. No vendor lock-in."
          />
          <TechChoice
            tech="FastAPI for the Control Plane"
            reason="Async Python with type hints. Auto-generates OpenAPI docs. Plays well with the PyTorch ecosystem (same language as the training workers)."
          />
          <TechChoice
            tech="Content-addressed storage keys"
            reason="The filename includes the SHA-256 hash of the content. Upload the same bytes twice? Same filename -- automatic deduplication. Verify data integrity? Recompute the hash and compare."
          />
        </div>
      </Section>

      <footer className="text-center pb-8 pt-4">
        <p className="text-xs text-txt-3">
          Built with Rust, Python, React, gRPC, etcd, MinIO, Docker, Prometheus, Grafana, and Jaeger.
        </p>
      </footer>
    </div>
  );
}

// -- Reusable Components ----------------------------------------------------

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4">
      <h2 className="text-lg font-semibold text-txt-1 border-b border-line pb-3">{title}</h2>
      {children}
    </section>
  );
}

function SubSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-txt-1">{title}</h3>
      {children}
    </div>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-txt-2 leading-relaxed">{children}</p>;
}

function Strong({ children }: { children: React.ReactNode }) {
  return <strong className="text-txt-1 font-medium">{children}</strong>;
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="text-xs font-mono bg-surface-3 text-brand-blue px-1.5 py-0.5 rounded">
      {children}
    </code>
  );
}

function CodeBlock({ children }: { children: string }) {
  return (
    <pre className="bg-surface-0 border border-line rounded-lg p-3.5 text-[11px] font-mono text-txt-2 overflow-x-auto leading-relaxed">
      {children}
    </pre>
  );
}

function BulletList({ items }: { items: string[] }) {
  return (
    <ul className="space-y-1.5 ml-4">
      {items.map((item, i) => (
        <li key={i} className="text-sm text-txt-2 leading-relaxed flex gap-2">
          <span className="text-txt-3 mt-1.5 flex-shrink-0 text-[8px]">&#9679;</span>
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2.5 pl-4 border-l-2 border-brand-violet/20">
      <div className="flex items-center gap-2.5">
        <span className="w-6 h-6 rounded-md bg-brand-violet/15 text-brand-violet text-xs font-semibold flex items-center justify-center flex-shrink-0">
          {n}
        </span>
        <h3 className="text-sm font-semibold text-txt-1">{title}</h3>
      </div>
      {children}
    </div>
  );
}

function TechChoice({ tech, reason }: { tech: string; reason: string }) {
  return (
    <div className="card p-4">
      <h4 className="text-xs font-semibold text-brand-violet mb-1.5">{tech}</h4>
      <p className="text-xs text-txt-2 leading-relaxed">{reason}</p>
    </div>
  );
}
