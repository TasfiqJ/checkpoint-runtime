import { Link } from 'react-router-dom';
import ArchitectureDiagram from '../components/ArchitectureDiagram';
import VisitorStats from '../components/VisitorStats';

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

        <div className="relative max-w-5xl mx-auto px-5 pt-28 pb-24 text-center">
          <p className="text-2xs font-semibold text-txt-3 uppercase tracking-widest mb-6">
            Never lose a training run again
          </p>

          <h1 className="text-5xl sm:text-6xl font-bold text-txt-1 tracking-tight leading-[1.1]">
            Fault-Tolerant Distributed
            <br />
            <span className="gradient-text">Checkpoint Runtime</span>
          </h1>

          <p className="mt-6 text-lg text-txt-2 max-w-2xl mx-auto leading-relaxed">
            Training AI models takes hours (or days). If one machine crashes, you could lose
            all that progress. This system automatically saves snapshots of your work across
            every machine — so when something breaks, you pick up right where you left off.
          </p>

          <div className="mt-10 flex items-center justify-center gap-4">
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
              href="#architecture"
              className="btn-ghost cursor-pointer inline-flex items-center gap-2 px-6 py-3.5 text-base font-semibold rounded-lg transition-colors duration-150"
            >
              How It Works
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </a>
          </div>
        </div>
      </section>

      {/* ── Problem Statement ──────────────────────────────────── */}
      <section className="max-w-5xl mx-auto px-5 py-16">
        <div className="card p-8">
          <p className="text-2xs font-semibold text-txt-3 uppercase tracking-widest mb-4">
            The Problem
          </p>
          <p className="text-txt-2 leading-relaxed text-[15px]">
            In large-scale ML training, a single GPU failure in a multi-node cluster
            can waste hours of compute time. Without checkpointing, the entire training
            run must restart from scratch. This system implements{' '}
            <span className="text-brand-violet font-medium">asynchronous distributed checkpointing</span>{' '}
            — saving model state to S3-compatible storage via a high-throughput Rust
            data plane, enabling instant recovery when any worker fails.
          </p>
        </div>
      </section>

      {/* ── Feature Cards ─────────────────────────────────────── */}
      <section className="max-w-5xl mx-auto px-5 py-16">
        <p className="text-2xs font-semibold text-txt-3 uppercase tracking-widest mb-8 text-center">
          Not a Simulation — Real Infrastructure
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Real Data */}
          <div className="card p-6 space-y-3 hover:border-line-emphasis transition-colors duration-150">
            <div className="w-10 h-10 rounded-lg bg-ok/10 flex items-center justify-center">
              <svg className="w-5 h-5 text-ok" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
              </svg>
            </div>
            <h3 className="text-sm font-semibold text-txt-1">Real Data</h3>
            <p className="text-2xs text-txt-3 leading-relaxed">
              PyTorch tensor bytes stream through gRPC to the Rust data plane, then
              to MinIO with SHA-256 checksums. Content-addressed storage keys prove deduplication.
            </p>
          </div>

          {/* Real Failures */}
          <div className="card p-6 space-y-3 hover:border-line-emphasis transition-colors duration-150">
            <div className="w-10 h-10 rounded-lg bg-err/10 flex items-center justify-center">
              <svg className="w-5 h-5 text-err" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
              </svg>
            </div>
            <h3 className="text-sm font-semibold text-txt-1">Real Failures</h3>
            <p className="text-2xs text-txt-3 leading-relaxed">
              Docker containers are actually killed with{' '}
              <code className="text-txt-2 bg-surface-3 px-1 py-0.5 rounded font-mono text-2xs">docker kill</code>.
              The infrastructure panel shows the process die and restart in real time.
            </p>
          </div>

          {/* Real Recovery */}
          <div className="card p-6 space-y-3 hover:border-line-emphasis transition-colors duration-150">
            <div className="w-10 h-10 rounded-lg bg-info/10 flex items-center justify-center">
              <svg className="w-5 h-5 text-info" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </div>
            <h3 className="text-sm font-semibold text-txt-1">Real Recovery</h3>
            <p className="text-2xs text-txt-3 leading-relaxed">
              Model and optimizer state restored byte-for-byte from the last committed
              checkpoint. Training resumes from the saved step — not from zero.
            </p>
          </div>
        </div>
      </section>

      {/* ── Architecture ─────────────────────────────────────── */}
      <section id="architecture" className="max-w-5xl mx-auto px-5 py-20">
        <p className="text-2xs font-semibold text-txt-3 uppercase tracking-widest mb-8 text-center">
          Architecture — 11 Services
        </p>
        <ArchitectureDiagram />
      </section>

      {/* ── Tech Stack ───────────────────────────────────────── */}
      <section className="max-w-5xl mx-auto px-5 py-16 text-center">
        <p className="text-2xs font-semibold text-txt-3 uppercase tracking-widest mb-6">
          Tech Stack
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          {TECH_STACK.map((tech) => (
            <span
              key={tech.label}
              className={`inline-flex items-center px-3 py-1 rounded-full text-2xs font-medium border ${tech.color}`}
            >
              {tech.label}
            </span>
          ))}
        </div>
      </section>

      {/* ── Visitor Stats ────────────────────────────────────── */}
      <section className="max-w-sm mx-auto px-5 py-16">
        <VisitorStats />
      </section>

      {/* ── Footer CTA ───────────────────────────────────────── */}
      <section className="max-w-5xl mx-auto px-5 py-20 text-center">
        <div className="space-y-6">
          <Link
            to="/demo"
            className="btn-primary cursor-pointer inline-flex items-center gap-2 px-8 py-3.5 text-base font-semibold rounded-lg transition-colors duration-150"
          >
            Try Live Demo
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
          </Link>
          <p className="text-2xs text-txt-3">
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
