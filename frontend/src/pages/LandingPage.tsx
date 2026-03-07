import { Link } from 'react-router-dom';
import ArchitectureDiagram from '../components/ArchitectureDiagram';
import VisitorStats from '../components/VisitorStats';

/** Firecrawl-style section counter: [ 01 / 07 ] · LABEL */
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

const TECH_STACK = [
  { label: 'Rust', color: 'bg-recover/10 text-recover border-recover/20' },
  { label: 'Python', color: 'bg-info/10 text-info border-info/20' },
  { label: 'React', color: 'bg-brand-violet/10 text-brand-violet border-brand-violet/20' },
  { label: 'gRPC', color: 'bg-ok/10 text-ok border-ok/20' },
  { label: 'etcd', color: 'bg-brand-violet/10 text-brand-violet border-brand-violet/20' },
  { label: 'MinIO / S3', color: 'bg-warn/10 text-warn border-warn/20' },
  { label: 'Docker', color: 'bg-info/10 text-info border-info/20' },
  { label: 'Kubernetes', color: 'bg-info/10 text-info border-info/20' },
  { label: 'Prometheus', color: 'bg-err/10 text-err border-err/20' },
  { label: 'Grafana', color: 'bg-recover/10 text-recover border-recover/20' },
  { label: 'Jaeger', color: 'bg-warn/10 text-warn border-warn/20' },
  { label: 'OpenTelemetry', color: 'bg-surface-3 text-txt-2 border-line' },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-surface-0">
      {/* ── Hero ─────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        {/* Gradient glow */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-[800px] h-[500px] bg-brand-violet/[0.07] rounded-full blur-[120px]" />
        </div>

        {/* Grid pattern overlay */}
        <div className="absolute inset-0 bg-dots bg-dots opacity-40" />

        <div className="relative max-w-4xl mx-auto px-5 pt-28 pb-16 text-center">
          <p className="text-xs font-semibold text-brand-violet uppercase tracking-widest mb-6">
            Distributed Systems Engineering Project
          </p>

          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-txt-1 tracking-tight leading-[1.1]">
            What happens when a machine
            <br />
            <span className="gradient-text">crashes mid-training?</span>
          </h1>

          <p className="mt-8 text-lg sm:text-xl text-txt-2 max-w-2xl mx-auto leading-relaxed">
            Training AI models can take hours or days across many machines.
            If one machine dies, all progress is lost.{' '}
            <span className="text-txt-1 font-medium">I built a system that saves progress automatically
            and recovers instantly</span> — so no work is ever lost.
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
            <a
              href="#how-i-solved-it"
              className="btn-ghost cursor-pointer inline-flex items-center gap-2 px-6 py-3.5 text-base font-semibold rounded-lg transition-colors duration-150"
            >
              How I Built It
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </a>
          </div>
        </div>
      </section>

      {/* ── The Problem (simple analogy) ─────────────────────────── */}
      <section className="max-w-4xl mx-auto px-5 pt-12 pb-16">
        <SectionCounter num={1} total={7} label="The Problem" />
        <h2 className="text-2xl sm:text-3xl font-bold text-txt-1 mb-4">
          The Problem
        </h2>
        <p className="text-sm text-txt-3 mb-10 max-w-xl">
          Why this matters in real-world AI infrastructure
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
              <h3 className="text-lg font-bold text-err">Without Checkpointing</h3>
            </div>
            <div className="space-y-3 text-sm text-txt-2 leading-relaxed">
              <p>
                Imagine writing a 50-page essay for 8 hours — then your computer crashes
                and you never saved. <span className="text-err font-medium">You start from page 1.</span>
              </p>
              <p>
                That's what happens during AI training. Companies run training jobs across
                dozens of machines for days. One hardware failure = everything is gone.
              </p>
              <p className="text-txt-3 text-xs">
                At scale, this wastes thousands of dollars in compute time per failure.
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
              <h3 className="text-lg font-bold text-ok">With This System</h3>
            </div>
            <div className="space-y-3 text-sm text-txt-2 leading-relaxed">
              <p>
                The system automatically saves a snapshot of everything the AI has learned —
                every 50 training steps. Like hitting{' '}
                <span className="text-ok font-medium">Ctrl+S every few seconds.</span>
              </p>
              <p>
                When a machine crashes, the system detects it, restarts the machine,
                loads the last save, and <span className="text-ok font-medium">picks up right where it left off.</span>
              </p>
              <p className="text-txt-3 text-xs">
                Zero data loss. Automatic recovery. No human intervention needed.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── How I Solved It ──────────────────────────────────────── */}
      <section id="how-i-solved-it" className="max-w-4xl mx-auto px-5 py-16">
        <SectionCounter num={2} total={7} label="Engineering" />
        <h2 className="text-2xl sm:text-3xl font-bold text-txt-1 mb-4">
          How I Built It
        </h2>
        <p className="text-sm text-txt-3 mb-12 max-w-xl">
          The key engineering decisions behind this system
        </p>

        <div className="space-y-6">
          {/* Decision 1 */}
          <div className="card p-6">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-xl bg-recover-muted flex items-center justify-center flex-shrink-0 mt-0.5">
                <span className="text-recover font-bold text-sm">1</span>
              </div>
              <div>
                <h3 className="text-base font-bold text-txt-1 mb-2">
                  Split the system into a Control Plane and Data Plane
                </h3>
                <p className="text-sm text-txt-2 leading-relaxed">
                  The <span className="text-info font-medium">Control Plane</span> (Python) acts as the brain — it decides{' '}
                  <em>when</em> to save, tracks which machines are alive, and manages the training lifecycle.
                  The <span className="text-recover font-medium">Data Plane</span> (Rust) handles the heavy lifting — it{' '}
                  <em>actually moves</em> gigabytes of data to storage as fast as possible. Separating these two concerns
                  means each can be optimized independently, just like how real infrastructure at companies like Meta works.
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
                <h3 className="text-base font-bold text-txt-1 mb-2">
                  Wrote the Data Plane in Rust for speed
                </h3>
                <p className="text-sm text-txt-2 leading-relaxed">
                  The bottleneck is moving training data to storage. Rust gives zero-overhead async I/O
                  and memory safety without a garbage collector. The result: checkpoint data streams to S3 storage
                  via gRPC at near-wire speed, with SHA-256 checksums verifying every byte. If a write fails,
                  built-in retry logic with exponential backoff handles it automatically.
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
                <h3 className="text-base font-bold text-txt-1 mb-2">
                  Used an 8-state machine to coordinate everything
                </h3>
                <p className="text-sm text-txt-2 leading-relaxed">
                  The system tracks every training run through 8 possible states:{' '}
                  <code className="text-2xs bg-surface-3 px-1.5 py-0.5 rounded text-txt-2 font-mono">
                    CREATED → RUNNING → CHECKPOINTING → COMMITTED
                  </code>{' '}
                  in a loop. When something goes wrong:{' '}
                  <code className="text-2xs bg-surface-3 px-1.5 py-0.5 rounded text-txt-2 font-mono">
                    FAILED → RECOVERING → RUNNING
                  </code>.
                  This state machine, stored in etcd (a distributed key-value store), means every component
                  in the system always knows exactly what's happening — even across multiple machines.
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
                <h3 className="text-base font-bold text-txt-1 mb-2">
                  Made it real — not a mock or simulation
                </h3>
                <p className="text-sm text-txt-2 leading-relaxed">
                  Everything runs as 11 real Docker containers on a cloud server in Virginia.
                  Real PyTorch models train across workers. Real data saves to real object storage (MinIO, S3-compatible).
                  When you click "Kill" in the demo, it sends{' '}
                  <code className="text-2xs bg-surface-3 px-1.5 py-0.5 rounded text-txt-2 font-mono">docker kill</code>{' '}
                  to a real container — not a simulation. The recovery you see is the actual system doing its job.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── What the Demo Actually Does ──────────────────────────── */}
      <section className="max-w-4xl mx-auto px-5 py-16">
        <SectionCounter num={3} total={7} label="Live Demo" />
        <h2 className="text-2xl sm:text-3xl font-bold text-txt-1 mb-4">
          What the Live Demo Shows You
        </h2>
        <p className="text-sm text-txt-3 mb-12 max-w-xl">
          Three steps to see fault-tolerant recovery in action
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <div className="card p-6 space-y-4 text-center">
            <div className="w-12 h-12 mx-auto rounded-2xl bg-ok-muted flex items-center justify-center">
              <span className="text-ok font-bold text-lg">1</span>
            </div>
            <h3 className="text-base font-bold text-txt-1">Training Starts</h3>
            <p className="text-sm text-txt-2 leading-relaxed">
              Two real servers begin training an AI model together.
              You'll see the step counter climbing and checkpoints saving automatically.
            </p>
          </div>

          <div className="card p-6 space-y-4 text-center">
            <div className="w-12 h-12 mx-auto rounded-2xl bg-err-muted flex items-center justify-center">
              <span className="text-err font-bold text-lg">2</span>
            </div>
            <h3 className="text-base font-bold text-txt-1">You Crash a Server</h3>
            <p className="text-sm text-txt-2 leading-relaxed">
              Click the Kill button to destroy one of the training servers.
              This sends a real{' '}
              <code className="text-2xs bg-surface-3 px-1 py-0.5 rounded text-txt-3 font-mono">docker kill</code>{' '}
              command — the container actually dies.
            </p>
          </div>

          <div className="card p-6 space-y-4 text-center">
            <div className="w-12 h-12 mx-auto rounded-2xl bg-info-muted flex items-center justify-center">
              <span className="text-info font-bold text-lg">3</span>
            </div>
            <h3 className="text-base font-bold text-txt-1">It Recovers Itself</h3>
            <p className="text-sm text-txt-2 leading-relaxed">
              The system detects the crash, restarts the server, loads the last checkpoint
              from storage, and resumes training — all automatically in under 5 seconds.
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

      {/* ── What's Actually Running ──────────────────────────────── */}
      <section className="max-w-4xl mx-auto px-5 py-16">
        <SectionCounter num={4} total={7} label="Infrastructure" />
        <h2 className="text-2xl sm:text-3xl font-bold text-txt-1 mb-4">
          What's Running Right Now
        </h2>
        <p className="text-sm text-txt-3 mb-10 max-w-xl">
          This isn't frontend magic — 11 real services are running on a cloud server
        </p>

        <div className="card p-6 space-y-6">
          {/* Server info */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 pb-5 border-b border-line">
            <div className="flex items-center gap-3">
              <div className="w-3 h-3 rounded-full bg-ok animate-pulse" />
              <span className="text-sm font-semibold text-txt-1">Live Server</span>
            </div>
            <div className="flex flex-wrap gap-2 text-xs">
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
                <p className={`text-xs font-semibold ${svc.color}`}>{svc.name}</p>
                <p className="text-2xs text-txt-3 mt-0.5">{svc.tech}</p>
              </div>
            ))}
          </div>

          <p className="text-xs text-txt-3 text-center">
            All 11 containers run on a single VPS via Docker Compose. The frontend you're viewing is served from Vercel,
            and every API call hits the real backend in Virginia.
          </p>
        </div>
      </section>

      {/* ── Architecture Diagram ─────────────────────────────────── */}
      <section id="architecture" className="max-w-4xl mx-auto px-5 py-16">
        <SectionCounter num={5} total={7} label="Architecture" />
        <h2 className="text-2xl sm:text-3xl font-bold text-txt-1 mb-4">
          System Architecture
        </h2>
        <p className="text-sm text-txt-3 mb-10 max-w-xl">
          How the 11 services connect to each other
        </p>
        <ArchitectureDiagram />
      </section>

      {/* ── Not Frontend Magic ───────────────────────────────────── */}
      <section className="max-w-4xl mx-auto px-5 py-16">
        <SectionCounter num={6} total={7} label="Proof" />
        <div className="card p-8 border-brand-violet/20">
          <h2 className="text-xl font-bold text-txt-1 text-center mb-6">
            "How do I know this isn't just a fancy animation?"
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex items-start gap-3">
              <svg className="w-5 h-5 text-ok flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <p className="text-sm text-txt-2">
                <span className="text-txt-1 font-medium">The demo panel shows real Docker logs</span> — you can see actual container
                output streaming in real-time, not pre-recorded text
              </p>
            </div>
            <div className="flex items-start gap-3">
              <svg className="w-5 h-5 text-ok flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <p className="text-sm text-txt-2">
                <span className="text-txt-1 font-medium">The storage browser shows real S3 files</span> — checkpoint shards
                with SHA-256 hashes appear as they're written
              </p>
            </div>
            <div className="flex items-start gap-3">
              <svg className="w-5 h-5 text-ok flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <p className="text-sm text-txt-2">
                <span className="text-txt-1 font-medium">The container panel shows real{' '}
                <code className="text-2xs bg-surface-3 px-1 py-0.5 rounded font-mono">docker ps</code> output</span> — you can
                see the killed container go down and come back
              </p>
            </div>
            <div className="flex items-start gap-3">
              <svg className="w-5 h-5 text-ok flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <p className="text-sm text-txt-2">
                <span className="text-txt-1 font-medium">The system info shows real server stats</span> — hostname, CPU count,
                memory usage, Docker version from the actual Hetzner VPS
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Tech Stack ───────────────────────────────────────────── */}
      <section className="max-w-4xl mx-auto px-5 py-16">
        <SectionCounter num={7} total={7} label="Stack" />
        <h2 className="text-2xl sm:text-3xl font-bold text-txt-1 mb-3">
          Tech Stack
        </h2>
        <p className="text-sm text-txt-3 mb-8">
          Production-grade technologies used across the system
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          {TECH_STACK.map((tech) => (
            <span
              key={tech.label}
              className={`inline-flex items-center px-3.5 py-1.5 rounded-full text-xs font-medium border ${tech.color}`}
            >
              {tech.label}
            </span>
          ))}
        </div>
      </section>

      {/* ── Visitor Stats ────────────────────────────────────────── */}
      <section className="max-w-sm mx-auto px-5 py-12">
        <VisitorStats />
      </section>

      {/* ── Footer CTA ───────────────────────────────────────────── */}
      <section className="max-w-4xl mx-auto px-5 py-20 text-center">
        <div className="space-y-6">
          <h2 className="text-2xl font-bold text-txt-1">See it in action</h2>
          <p className="text-sm text-txt-2 max-w-md mx-auto">
            Crash a real server and watch it recover. The live demo takes 30 seconds.
          </p>
          <Link
            to="/demo"
            className="btn-primary cursor-pointer inline-flex items-center gap-2 px-8 py-3.5 text-base font-semibold rounded-lg transition-colors duration-150"
          >
            Try Live Demo
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
          </Link>
          <p className="text-xs text-txt-3">
            Built by Tasfiq J &middot;{' '}
            <a
              href="https://github.com/TasfiqJ/checkpoint-runtime"
              target="_blank"
              rel="noopener noreferrer"
              className="text-brand-violet hover:text-brand-violet cursor-pointer transition-colors duration-150"
            >
              View on GitHub
            </a>
          </p>
        </div>
      </section>
    </div>
  );
}
