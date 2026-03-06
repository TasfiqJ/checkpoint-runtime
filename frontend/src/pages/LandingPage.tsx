import { Link } from 'react-router-dom';
import ArchitectureDiagram from '../components/ArchitectureDiagram';

const TECH_STACK = [
  { label: 'Rust', color: 'bg-orange-900/50 text-orange-300 border-orange-800' },
  { label: 'Python', color: 'bg-blue-900/50 text-blue-300 border-blue-800' },
  { label: 'React', color: 'bg-cyan-900/50 text-cyan-300 border-cyan-800' },
  { label: 'gRPC', color: 'bg-green-900/50 text-green-300 border-green-800' },
  { label: 'etcd', color: 'bg-purple-900/50 text-purple-300 border-purple-800' },
  { label: 'MinIO / S3', color: 'bg-yellow-900/50 text-yellow-300 border-yellow-800' },
  { label: 'Docker', color: 'bg-blue-900/50 text-blue-300 border-blue-800' },
  { label: 'Kubernetes', color: 'bg-blue-900/50 text-blue-300 border-blue-800' },
  { label: 'Prometheus', color: 'bg-red-900/50 text-red-300 border-red-800' },
  { label: 'Grafana', color: 'bg-red-900/50 text-red-300 border-red-800' },
  { label: 'Jaeger', color: 'bg-red-900/50 text-red-300 border-red-800' },
  { label: 'OpenTelemetry', color: 'bg-gray-800/50 text-gray-300 border-gray-700' },
];

export default function LandingPage() {
  return (
    <div className="max-w-4xl mx-auto space-y-12 py-8">
      {/* ── Hero ─────────────────────────────────────────────────── */}
      <section className="text-center space-y-4">
        <h1 className="text-4xl font-bold text-gray-100 tracking-tight">
          Fault-Tolerant Distributed
          <br />
          <span className="text-indigo-400">Checkpoint Runtime</span>
        </h1>
        <p className="text-lg text-gray-400 max-w-2xl mx-auto leading-relaxed">
          Saves ML training state across distributed workers via a high-throughput
          Rust data plane, so a single node failure doesn't lose hours of compute.
        </p>
        <div className="pt-4">
          <Link
            to="/demo"
            className="inline-flex items-center gap-2 px-8 py-4 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-xl transition-colors text-lg"
          >
            Try the Live Demo
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
          </Link>
        </div>
      </section>

      {/* ── The Problem ──────────────────────────────────────────── */}
      <section className="bg-gray-900/50 border border-gray-800 rounded-2xl p-8">
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
          The Problem
        </h2>
        <p className="text-gray-300 leading-relaxed">
          In large-scale ML training, a single GPU failure in a multi-node cluster
          can waste hours of compute time. Without checkpointing, the entire training
          run must restart from scratch. This system implements{' '}
          <span className="text-indigo-400 font-medium">asynchronous distributed checkpointing</span>{' '}
          — saving model state to S3-compatible storage via a high-throughput Rust
          data plane, enabling instant recovery when any worker fails.
        </p>
      </section>

      {/* ── What Makes It Real ───────────────────────────────────── */}
      <section>
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4 text-center">
          Not a Simulation — Real Infrastructure
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-2">
            <div className="w-10 h-10 rounded-lg bg-green-900/50 flex items-center justify-center">
              <svg className="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
              </svg>
            </div>
            <h3 className="text-sm font-semibold text-gray-200">Real Data</h3>
            <p className="text-xs text-gray-400 leading-relaxed">
              PyTorch tensor bytes stream through gRPC to the Rust data plane, then
              to MinIO with SHA-256 checksums. Content-addressed storage keys prove deduplication.
            </p>
          </div>

          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-2">
            <div className="w-10 h-10 rounded-lg bg-red-900/50 flex items-center justify-center">
              <svg className="w-5 h-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
              </svg>
            </div>
            <h3 className="text-sm font-semibold text-gray-200">Real Failures</h3>
            <p className="text-xs text-gray-400 leading-relaxed">
              Docker containers are actually killed with <code className="text-gray-300 bg-gray-800 px-1 rounded">docker kill</code>.
              The infrastructure panel shows the process die and restart in real time.
            </p>
          </div>

          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-2">
            <div className="w-10 h-10 rounded-lg bg-blue-900/50 flex items-center justify-center">
              <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </div>
            <h3 className="text-sm font-semibold text-gray-200">Real Recovery</h3>
            <p className="text-xs text-gray-400 leading-relaxed">
              Model and optimizer state restored byte-for-byte from the last committed
              checkpoint. Training resumes from the saved step — not from zero.
            </p>
          </div>
        </div>
      </section>

      {/* ── Architecture ─────────────────────────────────────────── */}
      <section>
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4 text-center">
          Architecture — 11 Services
        </h2>
        <ArchitectureDiagram />
      </section>

      {/* ── Tech Stack ───────────────────────────────────────────── */}
      <section className="text-center space-y-4">
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
          Tech Stack
        </h2>
        <div className="flex flex-wrap justify-center gap-2">
          {TECH_STACK.map((tech) => (
            <span
              key={tech.label}
              className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium border ${tech.color}`}
            >
              {tech.label}
            </span>
          ))}
        </div>
      </section>

      {/* ── Footer CTA ───────────────────────────────────────────── */}
      <section className="text-center space-y-4 pb-8">
        <Link
          to="/demo"
          className="inline-flex items-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-xl transition-colors"
        >
          Try the Live Demo
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
          </svg>
        </Link>
        <p className="text-xs text-gray-500">
          Built by Tasfiq J &middot;{' '}
          <a
            href="https://github.com/TasfiqJ/checkpoint-runtime"
            target="_blank"
            rel="noopener noreferrer"
            className="text-indigo-400 hover:text-indigo-300"
          >
            View on GitHub
          </a>
        </p>
      </section>
    </div>
  );
}
