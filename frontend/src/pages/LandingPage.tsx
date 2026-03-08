import { Link } from 'react-router-dom';
import { useState } from 'react';
import ArchitectureDiagram from '../components/ArchitectureDiagram';

/** Firecrawl-style section counter: [ 01 / 09 ] · LABEL */
function SectionCounter({ num, total, label }: { num: number; total: number; label: string }) {
  return (
    <div className="section-counter">
      <span className="divider">[</span>
      <span className="num">{String(num).padStart(2, '0')}</span>
      <span className="divider">/</span>
      <span>{String(total).padStart(2, '0')}</span>
      <span className="divider">]</span>
      <span className="divider">&middot;</span>
      <span className="label">{label}</span>
    </div>
  );
}

const TOTAL = 9;

const TECH_STACK = [
  { label: 'Rust', color: 'bg-recover/10 text-recover border-recover/20' },
  { label: 'Python', color: 'bg-info/10 text-info border-info/20' },
  { label: 'TypeScript', color: 'bg-info/10 text-info border-info/20' },
  { label: 'PyTorch', color: 'bg-err/10 text-err border-err/20' },
  { label: 'React', color: 'bg-brand-violet/10 text-brand-violet border-brand-violet/20' },
  { label: 'gRPC', color: 'bg-ok/10 text-ok border-ok/20' },
  { label: 'FastAPI', color: 'bg-ok/10 text-ok border-ok/20' },
  { label: 'etcd', color: 'bg-brand-violet/10 text-brand-violet border-brand-violet/20' },
  { label: 'MinIO / S3', color: 'bg-warn/10 text-warn border-warn/20' },
  { label: 'Docker', color: 'bg-info/10 text-info border-info/20' },
  { label: 'Kubernetes', color: 'bg-info/10 text-info border-info/20' },
  { label: 'Prometheus', color: 'bg-err/10 text-err border-err/20' },
  { label: 'Grafana', color: 'bg-recover/10 text-recover border-recover/20' },
  { label: 'Jaeger', color: 'bg-warn/10 text-warn border-warn/20' },
  { label: 'OpenTelemetry', color: 'bg-surface-3 text-txt-2 border-line' },
];

const QA_ITEMS = [
  {
    q: 'What would you do differently if you started over?',
    a: 'I\'d start with the state machine and etcd coordination layer before writing a single line of training code. I spent a lot of time debugging timing issues because I built the training loop first and bolted coordination on later. The state machine is the heart of the system. Everything else flows from "what state is the run in right now?" Starting there would have saved me weeks.',
  },
  {
    q: 'How does this compare to what companies like Meta actually use?',
    a: 'The architecture pattern is the same: control plane / data plane split, async checkpointing, content-addressed storage. But at a different scale. Meta\'s systems handle thousands of GPUs across data centers with dedicated hardware for checkpoint storage. Mine runs on a single 4-vCPU VPS with 2 CPU-only workers. The engineering principles are identical though: atomic commits, heartbeat-based failure detection, manifest-driven recovery. I built this to prove I understand the architecture, not to compete with their scale.',
  },
  {
    q: 'What was the hardest bug you ran into?',
    a: 'Worker rank incrementing after kill/restart cycles. After killing and restarting workers, PyTorch DDP would assign new ranks (0,1 → 2,3 → 5,6) instead of reusing the old ones. The frontend was matching workers by rank index, so after a kill cycle the UI would show the wrong workers. I had to redesign the frontend to sort workers by active status and most recent heartbeat instead of relying on rank numbers.',
  },
  {
    q: 'Why not just use an existing checkpoint library?',
    a: 'Libraries like PyTorch\'s built-in checkpointing just serialize model weights to a file. They don\'t handle the hard parts: When do you save? How do you coordinate multiple workers? What if the save itself fails? How do you detect a dead worker? How do you resume from the right checkpoint? I wanted to build the full coordination system, the orchestration layer that makes checkpointing actually reliable in a distributed setting.',
  },
  {
    q: 'How would this work at real scale, thousands of GPUs?',
    a: 'The architecture scales horizontally. The control plane would need to be replicated for availability (multiple FastAPI instances behind a load balancer, with etcd handling consensus). The Rust data plane already handles concurrent shard uploads, so you\'d run multiple data plane instances close to storage. The biggest change would be sharding strategy. Instead of one shard per rank, you\'d want hierarchical checkpointing where each node saves locally first, then async-uploads to durable storage. The state machine and coordination protocol wouldn\'t change at all.',
  },
  {
    q: 'What did you learn from building this?',
    a: 'The biggest lesson was that distributed systems fail in ways you can\'t predict, so you have to design for failure from the start, not as an afterthought. I also learned that the "boring" parts (state machines, heartbeats, retry logic) are what make the system actually work. The flashy parts (Rust, gRPC, streaming) are implementation details. If your coordination is wrong, nothing else matters.',
  },
];

export default function LandingPage() {
  const [openQA, setOpenQA] = useState<number | null>(null);

  return (
    <div className="min-h-screen bg-surface-0">
      {/* ── Hero ─────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        {/* Gradient glow */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-[800px] h-[500px] bg-brand-violet/[0.07] rounded-full blur-[120px]" />
        </div>

        {/* Grid pattern overlay */}
        <div className="absolute inset-0 bg-grid opacity-60" />

        <div className="relative max-w-4xl mx-auto px-5 pt-16 md:pt-32 pb-16 text-center">
          <p className="text-sm font-semibold text-brand-violet uppercase tracking-widest mb-6">
            A Portfolio Project by Tasfiq
          </p>

          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-txt-1 tracking-tight leading-[1.1]">
            I asked myself: what happens
            <br />
            <span className="gradient-text">when a machine crashes mid-training?</span>
          </h1>

          <p className="mt-8 text-xl text-txt-2 max-w-2xl mx-auto leading-relaxed">
            Training AI models can take hours or days across many machines.
            If one machine dies, all progress is lost.{' '}
            <span className="text-txt-1 font-medium">This is my answer: a fault-tolerant checkpoint runtime
            I designed and built from scratch</span> that saves progress automatically and recovers instantly.
          </p>

          <div className="mt-10 flex items-center justify-center gap-4">
            <Link
              to="/demo"
              className="btn-primary cursor-pointer inline-flex items-center gap-2 px-8 py-3.5 text-base font-semibold rounded-lg transition-colors duration-150"
            >
              Try the Live Demo
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </Link>
            <Link
              to="/how-it-works"
              className="btn-primary cursor-pointer inline-flex items-center gap-2 px-8 py-3.5 text-base font-semibold rounded-lg transition-colors duration-150"
            >
              How I Built It
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </Link>
          </div>
        </div>
      </section>

      {/* ── Why I Built This ───────────────────────────────────── */}
      <section id="why-i-built-this" className="max-w-4xl mx-auto px-5 pt-12 pb-16">
        <SectionCounter num={1} total={TOTAL} label="Origin" />
        <h2 className="text-3xl sm:text-4xl font-bold text-txt-1 mb-4">
          Why I Built This
        </h2>
        <p className="text-base text-txt-3 mb-10 max-w-xl">
          The problem that made me want to build something real
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Without checkpointing */}
          <div className="card p-6 border-err/20">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-err-muted flex items-center justify-center">
                <svg className="w-5 h-5 text-err" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
              <h3 className="text-lg font-bold text-err">The Problem I Kept Seeing</h3>
            </div>
            <div className="space-y-3 text-base text-txt-2 leading-relaxed">
              <p>
                I was reading about how Meta and Google train models across thousands of GPUs, and the same problem
                kept coming up: <span className="text-err font-medium">hardware fails all the time at scale.</span>
              </p>
              <p>
                Imagine writing a 50-page essay for 8 hours, then your computer crashes
                and you never saved. You start from page 1. That's what happens during
                AI training when a machine dies without checkpointing.
              </p>
              <p className="text-txt-3 text-sm">
                At scale, a single failure can waste thousands of dollars in compute time.
              </p>
            </div>
          </div>

          {/* With checkpointing */}
          <div className="card p-6 border-ok/20">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-ok-muted flex items-center justify-center">
                <svg className="w-5 h-5 text-ok" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h3 className="text-lg font-bold text-ok">What I Built to Solve It</h3>
            </div>
            <div className="space-y-3 text-base text-txt-2 leading-relaxed">
              <p>
                So I built a system that automatically saves a snapshot of everything the AI has learned,
                every 50 training steps. Like hitting{' '}
                <span className="text-ok font-medium">Ctrl+S every few seconds.</span>
              </p>
              <p>
                When a machine crashes, the system detects it through missed heartbeats, restarts the machine,
                loads the last save from object storage, and{' '}
                <span className="text-ok font-medium">picks up right where it left off.</span>
              </p>
              <p className="text-txt-3 text-sm">
                Zero data loss. Automatic recovery. No human intervention needed.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── My Engineering Decisions ──────────────────────────── */}
      <section id="engineering" className="max-w-4xl mx-auto px-5 py-16">
        <SectionCounter num={2} total={TOTAL} label="Engineering" />
        <h2 className="text-3xl sm:text-4xl font-bold text-txt-1 mb-4">
          My Engineering Decisions
        </h2>
        <p className="text-base text-txt-3 mb-12 max-w-xl">
          Why I made each technical choice, not just what I used
        </p>

        <div className="space-y-6">
          {/* Decision 1 */}
          <div className="card p-6">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-xl bg-recover-muted flex items-center justify-center flex-shrink-0 mt-0.5">
                <span className="text-recover font-bold text-sm">1</span>
              </div>
              <div>
                <h3 className="text-lg font-bold text-txt-1 mb-2">
                  I split the system into a Control Plane and Data Plane
                </h3>
                <p className="text-base text-txt-2 leading-relaxed">
                  I chose this because it mirrors how real infrastructure at companies like Meta works.
                  The <span className="text-info font-medium">Control Plane</span> (Python/FastAPI) is the brain. It decides{' '}
                  <em>when</em> to save, tracks which machines are alive via etcd leases, and manages the training lifecycle
                  through an 8-state machine.
                  The <span className="text-recover font-medium">Data Plane</span> (Rust) does the heavy lifting. It{' '}
                  <em>actually moves</em> checkpoint data to S3 storage via gRPC streaming as fast as possible.
                  Separating these concerns means each can be optimized independently.
                </p>
              </div>
            </div>
          </div>

          {/* Decision 2 */}
          <div className="card p-6">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-xl bg-recover-muted flex items-center justify-center flex-shrink-0 mt-0.5">
                <span className="text-recover font-bold text-sm">2</span>
              </div>
              <div>
                <h3 className="text-lg font-bold text-txt-1 mb-2">
                  I wrote the Data Plane in Rust for speed and safety
                </h3>
                <p className="text-base text-txt-2 leading-relaxed">
                  I could have done everything in Python, but the bottleneck in checkpointing is I/O:
                  moving gigabytes of model weights to storage. Rust gives me zero-overhead async I/O via Tokio
                  and memory safety without a garbage collector. The result: checkpoint data streams to S3 storage
                  via gRPC at near-wire speed, with SHA-256 checksums verifying every byte. If a write fails,
                  built-in retry logic with exponential backoff and jitter handles it automatically.
                </p>
              </div>
            </div>
          </div>

          {/* Decision 3 */}
          <div className="card p-6">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-xl bg-recover-muted flex items-center justify-center flex-shrink-0 mt-0.5">
                <span className="text-recover font-bold text-sm">3</span>
              </div>
              <div>
                <h3 className="text-lg font-bold text-txt-1 mb-2">
                  I used an 8-state machine to coordinate everything
                </h3>
                <p className="text-base text-txt-2 leading-relaxed">
                  The hardest part wasn't writing the training loop. It was coordinating everything around it.
                  The system tracks every training run through 8 possible states:{' '}
                  <code className="text-xs bg-surface-3 px-1.5 py-0.5 rounded text-txt-2 font-mono">
                    CREATED → RUNNING → CHECKPOINTING → COMMITTED
                  </code>{' '}
                  in a loop. When something goes wrong:{' '}
                  <code className="text-xs bg-surface-3 px-1.5 py-0.5 rounded text-txt-2 font-mono">
                    FAILED → RECOVERING → RUNNING
                  </code>.
                  This state machine lives in etcd (a distributed key-value store), so every component
                  always knows exactly what's happening, even across multiple machines.
                </p>
              </div>
            </div>
          </div>

          {/* Decision 4 */}
          <div className="card p-6">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-xl bg-recover-muted flex items-center justify-center flex-shrink-0 mt-0.5">
                <span className="text-recover font-bold text-sm">4</span>
              </div>
              <div>
                <h3 className="text-lg font-bold text-txt-1 mb-2">
                  I made it real, not a mock or simulation
                </h3>
                <p className="text-base text-txt-2 leading-relaxed">
                  Anyone can draw architecture diagrams. I wanted to actually run it. Everything runs as
                  11 real Docker containers on a cloud server in Virginia. Real PyTorch models train across workers.
                  Real checkpoint data saves to real object storage (MinIO, S3-compatible).
                  When you click "Kill" in the demo, it sends{' '}
                  <code className="text-xs bg-surface-3 px-1.5 py-0.5 rounded text-txt-2 font-mono">docker kill</code>{' '}
                  to a real container. The recovery you see is the actual system doing its job.
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-10 flex justify-center">
          <Link
            to="/how-it-works"
            className="btn-primary cursor-pointer inline-flex items-center gap-2 px-8 py-3.5 text-base font-semibold rounded-lg transition-colors duration-150"
          >
            Exhaustive Details
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
          </Link>
        </div>
      </section>

      {/* ── What the Live Demo Shows ──────────────────────────── */}
      <section className="max-w-4xl mx-auto px-5 py-16">
        <SectionCounter num={3} total={TOTAL} label="Live Demo" />
        <h2 className="text-3xl sm:text-4xl font-bold text-txt-1 mb-4">
          I Built This Demo So You Can Break It
        </h2>
        <p className="text-base text-txt-3 mb-12 max-w-xl">
          Three steps, takes about 30 seconds
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <div className="card p-6 space-y-4 text-center">
            <div className="w-12 h-12 mx-auto rounded-2xl bg-ok-muted flex items-center justify-center">
              <span className="text-ok font-bold text-lg">1</span>
            </div>
            <h3 className="text-lg font-bold text-txt-1">Training Starts</h3>
            <p className="text-base text-txt-2 leading-relaxed">
              Two real servers begin training an AI model together.
              You'll see the step counter climbing and checkpoints saving automatically every 50 steps.
            </p>
          </div>

          <div className="card p-6 space-y-4 text-center">
            <div className="w-12 h-12 mx-auto rounded-2xl bg-err-muted flex items-center justify-center">
              <span className="text-err font-bold text-lg">2</span>
            </div>
            <h3 className="text-lg font-bold text-txt-1">You Crash a Server</h3>
            <p className="text-base text-txt-2 leading-relaxed">
              Click the Kill button to destroy one of the training servers.
              This sends a real{' '}
              <code className="text-xs bg-surface-3 px-1 py-0.5 rounded text-txt-3 font-mono">docker kill</code>{' '}
              command, and the container actually dies on the server in Virginia.
            </p>
          </div>

          <div className="card p-6 space-y-4 text-center">
            <div className="w-12 h-12 mx-auto rounded-2xl bg-info-muted flex items-center justify-center">
              <span className="text-info font-bold text-lg">3</span>
            </div>
            <h3 className="text-lg font-bold text-txt-1">It Recovers Itself</h3>
            <p className="text-base text-txt-2 leading-relaxed">
              The system detects the crash via missed heartbeats, restarts the server, loads the last checkpoint
              from storage, and resumes training. All automatically in under 5 seconds.
            </p>
          </div>
        </div>

        <div className="text-center mt-10">
          <Link
            to="/demo"
            className="btn-primary cursor-pointer inline-flex items-center gap-2 px-8 py-3.5 text-base font-semibold rounded-lg"
          >
            Try It Yourself
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
          </Link>
        </div>
      </section>

      {/* ── What's Actually Running ──────────────────────────── */}
      <section className="max-w-4xl mx-auto px-5 py-16">
        <SectionCounter num={4} total={TOTAL} label="Infrastructure" />
        <h2 className="text-3xl sm:text-4xl font-bold text-txt-1 mb-4">
          What's Actually Running Right Now
        </h2>
        <p className="text-base text-txt-3 mb-10 max-w-xl">
          This isn't a mock-up. 11 real Docker containers are running on a VPS I provisioned
        </p>

        <div className="card p-6 space-y-6">
          {/* Server info */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 pb-5 border-b border-line">
            <div className="flex items-center gap-3">
              <div className="w-3 h-3 rounded-full bg-ok animate-pulse" />
              <span className="text-base font-semibold text-txt-1">Live Server</span>
            </div>
            <div className="flex flex-wrap gap-2 text-sm">
              <span className="bg-surface-3 text-txt-2 px-2.5 py-1 rounded-lg font-mono">Hetzner CPX31</span>
              <span className="bg-surface-3 text-txt-2 px-2.5 py-1 rounded-lg font-mono">4 vCPU &middot; 8 GB RAM</span>
              <span className="bg-surface-3 text-txt-2 px-2.5 py-1 rounded-lg font-mono">Ashburn, Virginia</span>
            </div>
          </div>

          {/* Container grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {[
              { name: 'Control Plane', tech: 'Python + FastAPI', color: 'text-info', bg: 'bg-info-muted' },
              { name: 'Data Plane', tech: 'Rust + gRPC', color: 'text-recover', bg: 'bg-recover-muted' },
              { name: 'Worker 0', tech: 'PyTorch DDP', color: 'text-ok', bg: 'bg-ok-muted' },
              { name: 'Worker 1', tech: 'PyTorch DDP', color: 'text-ok', bg: 'bg-ok-muted' },
              { name: 'etcd', tech: 'Coordination', color: 'text-brand-violet', bg: 'bg-brand-violet/10' },
              { name: 'MinIO', tech: 'S3 Storage', color: 'text-warn', bg: 'bg-warn-muted' },
              { name: 'Prometheus', tech: 'Metrics', color: 'text-err', bg: 'bg-err-muted' },
              { name: 'Grafana', tech: 'Dashboards', color: 'text-err', bg: 'bg-err-muted' },
              { name: 'Jaeger', tech: 'Tracing', color: 'text-warn', bg: 'bg-warn-muted' },
              { name: 'OTEL', tech: 'Telemetry', color: 'text-txt-2', bg: 'bg-surface-3' },
              { name: 'Frontend', tech: 'React + Vite', color: 'text-brand-violet', bg: 'bg-brand-violet/10' },
            ].map((svc) => (
              <div key={svc.name} className={`${svc.bg} rounded-xl px-3 py-2.5`}>
                <p className={`text-sm font-semibold ${svc.color}`}>{svc.name}</p>
                <p className="text-xs text-txt-3 mt-0.5">{svc.tech}</p>
              </div>
            ))}
          </div>

          <p className="text-sm text-txt-3 text-center">
            All 11 containers run on a single VPS via Docker Compose. The frontend you're viewing is served from Vercel,
            and every API call hits the real backend in Virginia.
          </p>
        </div>
      </section>

      {/* ── Architecture Diagram ─────────────────────────────── */}
      <section id="architecture" className="max-w-4xl mx-auto px-5 py-16">
        <SectionCounter num={5} total={TOTAL} label="Architecture" />
        <h2 className="text-3xl sm:text-4xl font-bold text-txt-1 mb-4">
          System Architecture
        </h2>
        <p className="text-base text-txt-3 mb-10 max-w-xl">
          How I connected the 11 services together
        </p>
        <ArchitectureDiagram />
      </section>

      {/* ── Designing for Failure ─────────────────────────────── */}
      <section className="max-w-4xl mx-auto px-5 py-16">
        <SectionCounter num={6} total={TOTAL} label="Reliability" />
        <h2 className="text-3xl sm:text-4xl font-bold text-txt-1 mb-4">
          Designing for Failure, Not Perfection
        </h2>
        <p className="text-base text-txt-3 mb-12 max-w-xl">
          The question I kept asking was: what if THIS part fails?
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Atomic commits */}
          <div className="card p-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-9 h-9 rounded-lg bg-info-muted flex items-center justify-center">
                <svg className="w-4.5 h-4.5 text-info" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              </div>
              <h3 className="text-base font-bold text-txt-1">Atomic Checkpoint Commits</h3>
            </div>
            <p className="text-sm text-txt-2 leading-relaxed">
              What if the system crashes halfway through saving a checkpoint? I solved this with the manifest pattern:
              all data shards are written first, and a manifest file is written last as the "commit signal." If the manifest
              doesn't exist, the checkpoint is incomplete and gets ignored. No half-written saves, ever.
            </p>
          </div>

          {/* Heartbeat detection */}
          <div className="card p-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-9 h-9 rounded-lg bg-err-muted flex items-center justify-center">
                <svg className="w-4.5 h-4.5 text-err" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                </svg>
              </div>
              <h3 className="text-base font-bold text-txt-1">Heartbeat-Based Failure Detection</h3>
            </div>
            <p className="text-sm text-txt-2 leading-relaxed">
              How do you know a machine is dead vs. just slow? Each worker sends heartbeats to etcd with a TTL lease.
              If heartbeats stop, the lease expires and the control plane knows that worker is gone. Not guessing,
              not polling, just a clean timeout. This is the same pattern used in production Kubernetes clusters.
            </p>
          </div>

          {/* Content-addressed storage */}
          <div className="card p-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-9 h-9 rounded-lg bg-warn-muted flex items-center justify-center">
                <svg className="w-4.5 h-4.5 text-warn" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                </svg>
              </div>
              <h3 className="text-base font-bold text-txt-1">Content-Addressed Storage</h3>
            </div>
            <p className="text-sm text-txt-2 leading-relaxed">
              What if the same shard gets uploaded twice? Each file is named by its SHA-256 hash, so
              identical data always maps to the same key. This makes writes idempotent: if a retry re-uploads
              the same shard, it just overwrites with identical content. No duplicates, no corruption, no wasted storage.
            </p>
          </div>

          {/* Backpressure */}
          <div className="card p-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-9 h-9 rounded-lg bg-recover-muted flex items-center justify-center">
                <svg className="w-4.5 h-4.5 text-recover" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 17h8m0 0V9m0 8l-8-8-4 4-6-6" />
                </svg>
              </div>
              <h3 className="text-base font-bold text-txt-1">Backpressure & Flow Control</h3>
            </div>
            <p className="text-sm text-txt-2 leading-relaxed">
              What if checkpoints come in faster than storage can handle? The Rust data plane uses a bounded queue.
              If the queue fills up, it pushes back on the control plane to slow down instead of crashing with
              out-of-memory errors. This is the same pattern used in TCP flow control and production message queues.
            </p>
          </div>
        </div>
      </section>

      {/* ── Proof It's Real ───────────────────────────────────── */}
      <section className="max-w-4xl mx-auto px-5 py-16">
        <SectionCounter num={7} total={TOTAL} label="Proof" />
        <div className="card p-8 border-brand-violet/20">
          <h2 className="text-2xl font-bold text-txt-1 text-center mb-3">
            "How do I know this isn't just a fancy animation?"
          </h2>
          <p className="text-base text-txt-3 text-center mb-6">
            I get this question. Here's how you can verify everything is real:
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex items-start gap-3">
              <svg className="w-5 h-5 text-ok flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <p className="text-base text-txt-2">
                <span className="text-txt-1 font-medium">The demo panel shows real Docker logs</span>, actual container
                output streaming in real-time, not pre-recorded text
              </p>
            </div>
            <div className="flex items-start gap-3">
              <svg className="w-5 h-5 text-ok flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <p className="text-base text-txt-2">
                <span className="text-txt-1 font-medium">The storage browser shows real S3 files</span>, checkpoint shards
                with SHA-256 hashes appear as they're written
              </p>
            </div>
            <div className="flex items-start gap-3">
              <svg className="w-5 h-5 text-ok flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <p className="text-base text-txt-2">
                <span className="text-txt-1 font-medium">The container panel shows real{' '}
                <code className="text-xs bg-surface-3 px-1 py-0.5 rounded font-mono">docker ps</code> output</span>. You can
                see the killed container go down and come back
              </p>
            </div>
            <div className="flex items-start gap-3">
              <svg className="w-5 h-5 text-ok flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <p className="text-base text-txt-2">
                <span className="text-txt-1 font-medium">The system info shows real server stats</span>: hostname, CPU count,
                memory usage, Docker version from the actual Hetzner VPS
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Q&A ──────────────────────────────────────────────── */}
      <section className="max-w-4xl mx-auto px-5 py-16">
        <SectionCounter num={8} total={TOTAL} label="Q&A" />
        <h2 className="text-3xl sm:text-4xl font-bold text-txt-1 mb-4">
          Questions I'd Want to Ask
        </h2>
        <p className="text-base text-txt-3 mb-10 max-w-xl">
          If I were reading someone's project, these are the questions I'd have
        </p>

        <div className="space-y-3">
          {QA_ITEMS.map((item, i) => {
            const isOpen = openQA === i;
            return (
              <div key={i} className="card overflow-hidden">
                <button
                  onClick={() => setOpenQA(isOpen ? null : i)}
                  className="w-full flex items-center justify-between gap-4 p-5 text-left cursor-pointer hover:bg-surface-2/50 transition-colors"
                >
                  <span className="text-base font-semibold text-txt-1">{item.q}</span>
                  <svg
                    className={`w-5 h-5 text-txt-3 flex-shrink-0 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {isOpen && (
                  <div className="px-5 pb-5 pt-0">
                    <p className="text-base text-txt-2 leading-relaxed">{item.a}</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* ── Tech Stack ───────────────────────────────────────── */}
      <section className="max-w-4xl mx-auto px-5 py-16">
        <SectionCounter num={9} total={TOTAL} label="Stack" />
        <h2 className="text-3xl sm:text-4xl font-bold text-txt-1 mb-3">
          Tech Stack
        </h2>
        <p className="text-base text-txt-3 mb-8">
          Technologies I used across the system
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          {TECH_STACK.map((tech) => (
            <span
              key={tech.label}
              className={`inline-flex items-center px-4 py-2 rounded-full text-sm font-medium border ${tech.color}`}
            >
              {tech.label}
            </span>
          ))}
        </div>
      </section>

      {/* ── Footer CTA ───────────────────────────────────────── */}
      <section className="max-w-4xl mx-auto px-5 py-20 text-center">
        <div className="space-y-6">
          <h2 className="text-3xl font-bold text-txt-1">Want to see it break and recover?</h2>
          <p className="text-base text-txt-2 max-w-md mx-auto">
            Crash a real server and watch it recover. The live demo takes 30 seconds.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              to="/demo"
              className="btn-primary cursor-pointer inline-flex items-center gap-2 px-8 py-3.5 text-base font-semibold rounded-lg transition-colors duration-150"
            >
              Try Live Demo
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </Link>
            <a
              href="https://github.com/TasfiqJ/checkpoint-runtime"
              target="_blank"
              rel="noopener noreferrer"
              className="btn-ghost cursor-pointer inline-flex items-center gap-2 px-6 py-3.5 text-base font-semibold rounded-lg transition-colors duration-150"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
              </svg>
              View Source Code
            </a>
          </div>
          <p className="text-sm text-txt-3">
            Built by Tasfiq J
          </p>
        </div>
      </section>
    </div>
  );
}
