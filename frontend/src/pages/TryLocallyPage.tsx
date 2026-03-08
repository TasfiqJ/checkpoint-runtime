import { useState } from 'react';
import { Link } from 'react-router-dom';

// ── Section counter (same pattern as LandingPage) ────────────────────────────

const TOTAL = 7;

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

// ── Code block with copy button ──────────────────────────────────────────────

function CodeBlock({ children, label }: { children: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    // Strip ANSI-like spans and grab raw text
    const raw = children.replace(/\n$/, '');
    navigator.clipboard.writeText(raw);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative group">
      {label && (
        <div className="flex items-center gap-2 px-4 py-2 bg-[#0a0a12] border border-b-0 border-line rounded-t-xl">
          <span className="w-2.5 h-2.5 rounded-full bg-err/60" />
          <span className="w-2.5 h-2.5 rounded-full bg-warn/60" />
          <span className="w-2.5 h-2.5 rounded-full bg-ok/60" />
          <span className="text-2xs text-txt-3 font-mono ml-2">{label}</span>
        </div>
      )}
      <pre className={`bg-[#0a0a12] text-[#e2e8f0] border border-line ${label ? 'rounded-b-xl' : 'rounded-xl'} px-5 py-4 font-mono text-sm leading-relaxed overflow-x-auto`}>
        {children}
      </pre>
      <button
        onClick={handleCopy}
        className="absolute top-3 right-3 px-2.5 py-1 text-2xs font-mono rounded-lg bg-surface-3/80 text-txt-3 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer hover:text-txt-1"
      >
        {copied ? '✓ copied' : 'copy'}
      </button>
    </div>
  );
}

// ── Terminal output block (fake screenshot) ──────────────────────────────────

function TerminalBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-2 px-4 py-2.5 bg-[#0a0a12] border border-b-0 border-line rounded-t-xl">
        <span className="w-2.5 h-2.5 rounded-full bg-err/60" />
        <span className="w-2.5 h-2.5 rounded-full bg-warn/60" />
        <span className="w-2.5 h-2.5 rounded-full bg-ok/60" />
        <span className="text-2xs text-txt-3 font-mono ml-2">{title}</span>
      </div>
      <div className="bg-[#0a0a12] text-[#e2e8f0] border border-line rounded-b-xl px-5 py-4 font-mono text-xs sm:text-sm leading-relaxed overflow-x-auto">
        {children}
      </div>
    </div>
  );
}

// ── Service card ─────────────────────────────────────────────────────────────

const SERVICES = [
  { name: 'Frontend', port: '3000', desc: 'Operator console you\'re looking at', color: 'border-l-info', tech: 'React + Vite' },
  { name: 'Control Plane', port: '8000', desc: 'REST API, SSE streams, orchestration', color: 'border-l-info', tech: 'Python / FastAPI' },
  { name: 'Data Plane', port: '50051', desc: 'gRPC streaming checkpoint I/O', color: 'border-l-recover', tech: 'Rust / Tokio' },
  { name: 'Worker 0', port: '—', desc: 'PyTorch DDP training (rank 0)', color: 'border-l-ok', tech: 'PyTorch' },
  { name: 'Worker 1', port: '—', desc: 'PyTorch DDP training (rank 1)', color: 'border-l-ok', tech: 'PyTorch' },
  { name: 'MinIO', port: '9001', desc: 'S3-compatible object storage console', color: 'border-l-warn', tech: 'MinIO' },
  { name: 'etcd', port: '2379', desc: 'Distributed coordination & leases', color: 'border-l-brand-violet', tech: 'etcd' },
  { name: 'Prometheus', port: '9091', desc: 'Metrics collection & queries', color: 'border-l-err', tech: 'Prometheus' },
  { name: 'Grafana', port: '3001', desc: 'Dashboards for checkpoint metrics', color: 'border-l-recover', tech: 'Grafana' },
  { name: 'Jaeger', port: '16686', desc: 'Distributed tracing UI', color: 'border-l-warn', tech: 'Jaeger' },
  { name: 'OTel Collector', port: '4317', desc: 'Telemetry pipeline aggregator', color: 'border-l-surface-4', tech: 'OpenTelemetry' },
];

// ── Main page ────────────────────────────────────────────────────────────────

export default function TryLocallyPage() {
  return (
    <div className="min-h-screen bg-surface-0">

      {/* ── Hero ───────────────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-[800px] h-[500px] bg-brand-violet/[0.07] rounded-full blur-[120px]" />
        </div>

        <div className="relative max-w-4xl mx-auto px-5 pt-8 md:pt-24 pb-16 text-center">
          <p className="text-sm font-semibold text-brand-violet uppercase tracking-widest mb-6">
            Prove it's real
          </p>

          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-txt-1 tracking-tight leading-[1.1]">
            Don't take my word for it
            <br />
            <span className="gradient-text">— run it yourself.</span>
          </h1>

          <p className="mt-8 text-xl text-txt-2 max-w-2xl mx-auto leading-relaxed">
            The live demo at{' '}
            <Link to="/demo" className="text-brand-violet font-medium hover:underline">ckpt.tasfiqj.com</Link>{' '}
            isn't a fancy frontend animation. It's <span className="text-txt-1 font-medium">11 Docker containers</span> doing
            real distributed training, real checkpoint saves, and real failure recovery. Here's how to run
            the whole thing on your laptop in about two minutes.
          </p>
        </div>
      </section>

      {/* ── 01: Prerequisites ─────────────────────────────────── */}
      <section className="max-w-4xl mx-auto px-5 pt-12 pb-16">
        <SectionCounter num={1} total={TOTAL} label="Prerequisites" />
        <h2 className="text-3xl sm:text-4xl font-bold text-txt-1 mb-4">
          Two things. That's it.
        </h2>
        <p className="text-base text-txt-3 mb-10 max-w-xl">
          Everything else is containerized. No Python, no Rust, no Node — Docker handles all of it.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="card p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-info-muted flex items-center justify-center">
                <svg className="w-5 h-5 text-info" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2" />
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-bold text-txt-1">Docker</h3>
                <p className="text-2xs text-txt-3">with Docker Compose</p>
              </div>
            </div>
            <CodeBlock>{'docker --version\ndocker compose version'}</CodeBlock>
            <p className="text-sm text-txt-3 mt-3">
              <a href="https://docs.docker.com/get-docker/" target="_blank" rel="noopener noreferrer" className="text-info hover:underline">
                Get Docker →
              </a>
            </p>
          </div>

          <div className="card p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-recover-muted flex items-center justify-center">
                <svg className="w-5 h-5 text-recover" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-bold text-txt-1">Git</h3>
                <p className="text-2xs text-txt-3">to clone the repo</p>
              </div>
            </div>
            <CodeBlock>{'git --version'}</CodeBlock>
            <p className="text-sm text-txt-3 mt-3">
              <a href="https://git-scm.com/downloads" target="_blank" rel="noopener noreferrer" className="text-recover hover:underline">
                Get Git →
              </a>
            </p>
          </div>
        </div>
      </section>

      {/* ── 02: Clone & Launch ────────────────────────────────── */}
      <section className="max-w-4xl mx-auto px-5 py-16">
        <SectionCounter num={2} total={TOTAL} label="Launch" />
        <h2 className="text-3xl sm:text-4xl font-bold text-txt-1 mb-4">
          Three lines. Eleven containers.
        </h2>
        <p className="text-base text-txt-3 mb-10 max-w-xl">
          Copy, paste, go make coffee. The first build takes a few minutes (Rust compilation),
          subsequent launches are instant.
        </p>

        <div className="space-y-4">
          <CodeBlock label="Terminal">{'git clone https://github.com/TasfiqJ/checkpoint-runtime.git\ncd checkpoint-runtime\ndocker compose up --build -d'}</CodeBlock>

          <p className="text-base text-txt-2 leading-relaxed">
            That's it. Docker pulls the base images, builds the Rust data plane from source,
            installs the Python control plane, compiles the React frontend, and wires everything together
            with a shared network. <span className="text-txt-1 font-medium">No environment variables, no config files, no setup scripts.</span>
          </p>

          <TerminalBlock title="What you'll see">
            <div className="space-y-0.5">
              <p><span className="text-ok">✔</span> Container ckpt-etcd <span className="text-ok">Started</span></p>
              <p><span className="text-ok">✔</span> Container ckpt-minio <span className="text-ok">Started</span></p>
              <p><span className="text-ok">✔</span> Container ckpt-dataplane <span className="text-ok">Started</span></p>
              <p><span className="text-ok">✔</span> Container ckpt-controlplane <span className="text-ok">Started</span></p>
              <p><span className="text-ok">✔</span> Container ckpt-worker-0 <span className="text-ok">Started</span></p>
              <p><span className="text-ok">✔</span> Container ckpt-worker-1 <span className="text-ok">Started</span></p>
              <p><span className="text-ok">✔</span> Container ckpt-frontend <span className="text-ok">Started</span></p>
              <p><span className="text-ok">✔</span> Container ckpt-prometheus <span className="text-ok">Started</span></p>
              <p><span className="text-ok">✔</span> Container ckpt-grafana <span className="text-ok">Started</span></p>
              <p><span className="text-ok">✔</span> Container ckpt-jaeger <span className="text-ok">Started</span></p>
              <p><span className="text-ok">✔</span> Container ckpt-otel <span className="text-ok">Started</span></p>
            </div>
          </TerminalBlock>
        </div>
      </section>

      {/* ── 03: The Fleet ─────────────────────────────────────── */}
      <section className="max-w-4xl mx-auto px-5 py-16">
        <SectionCounter num={3} total={TOTAL} label="The Fleet" />
        <h2 className="text-3xl sm:text-4xl font-bold text-txt-1 mb-4">
          11 containers. Here's what each one does.
        </h2>
        <p className="text-base text-txt-3 mb-10 max-w-xl">
          This is the same stack running in production on my Hetzner server in Virginia.
          Locally, everything maps to localhost.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {SERVICES.map((svc) => (
            <div key={svc.name} className={`card px-4 py-3.5 border-l-4 ${svc.color}`}>
              <div className="flex items-center justify-between mb-1">
                <h4 className="text-sm font-bold text-txt-1">{svc.name}</h4>
                {svc.port !== '—' && (
                  <span className="text-2xs font-mono text-brand-violet bg-brand-violet/10 px-1.5 py-0.5 rounded">
                    :{svc.port}
                  </span>
                )}
              </div>
              <p className="text-2xs text-txt-3 leading-relaxed">{svc.desc}</p>
              <p className="text-2xs text-txt-3/60 mt-1 font-mono">{svc.tech}</p>
            </div>
          ))}
        </div>

        <div className="mt-6">
          <CodeBlock label="Verify everything's running">{'docker compose ps'}</CodeBlock>
        </div>
      </section>

      {/* ── 04: Open the Dashboard ────────────────────────────── */}
      <section className="max-w-4xl mx-auto px-5 py-16">
        <SectionCounter num={4} total={TOTAL} label="Dashboard" />
        <h2 className="text-3xl sm:text-4xl font-bold text-txt-1 mb-4">
          Open the dashboard. It's alive.
        </h2>
        <p className="text-base text-txt-3 mb-10 max-w-xl">
          The workers started training the moment the containers came up. By the time you open
          your browser, checkpoints are already being saved.
        </p>

        <div className="space-y-6">
          <div className="card p-6 border-ok/20">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-xl bg-ok-muted flex items-center justify-center flex-shrink-0 mt-0.5">
                <span className="text-ok font-bold text-sm">1</span>
              </div>
              <div>
                <h3 className="text-lg font-bold text-txt-1 mb-2">Open your browser</h3>
                <p className="text-base text-txt-2 leading-relaxed">
                  Go to{' '}
                  <code className="text-sm bg-surface-3 px-2 py-0.5 rounded text-brand-violet font-mono">
                    http://localhost:3000
                  </code>
                </p>
                <p className="text-sm text-txt-3 mt-2">
                  You'll land on the same operator console you see at ckpt.tasfiqj.com.
                  Navigate to the <span className="text-txt-1 font-medium">Live Demo</span> page.
                </p>
              </div>
            </div>
          </div>

          <div className="card p-6 border-info/20">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-xl bg-info-muted flex items-center justify-center flex-shrink-0 mt-0.5">
                <span className="text-info font-bold text-sm">2</span>
              </div>
              <div>
                <h3 className="text-lg font-bold text-txt-1 mb-2">Click "Start the Demo"</h3>
                <p className="text-base text-txt-2 leading-relaxed">
                  The frontend connects to the live training run. You'll see the{' '}
                  <span className="text-ok font-medium">step counter climbing</span>, the{' '}
                  <span className="text-info font-medium">training loss decreasing</span>, and{' '}
                  <span className="text-txt-1 font-medium">blue checkpoint dots</span> appearing on
                  the chart every 50 steps as the model state gets saved to MinIO.
                </p>
              </div>
            </div>
          </div>

          <div className="card p-6 border-brand-violet/20">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-xl bg-brand-violet/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                <span className="text-brand-violet font-bold text-sm">3</span>
              </div>
              <div>
                <h3 className="text-lg font-bold text-txt-1 mb-2">Watch the proof panels</h3>
                <p className="text-base text-txt-2 leading-relaxed">
                  The right side of the page shows live proof — real{' '}
                  <code className="text-2xs bg-surface-3 px-1 py-0.5 rounded text-txt-3 font-mono">stdout</code>{' '}
                  from Docker containers, actual files appearing in MinIO storage with SHA-256 hashes,
                  container statuses, and system info from your machine.{' '}
                  <span className="text-txt-1 font-medium">None of this is mocked.</span>
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── 05: Break Something ───────────────────────────────── */}
      <section className="max-w-4xl mx-auto px-5 py-16">
        <SectionCounter num={5} total={TOTAL} label="Break It" />
        <h2 className="text-3xl sm:text-4xl font-bold text-txt-1 mb-4">
          Now destroy a server. On purpose.
        </h2>
        <p className="text-base text-txt-3 mb-10 max-w-xl">
          This is the whole point. You're about to prove that the system can recover
          from a real container crash with zero data loss.
        </p>

        <div className="space-y-6">
          <div className="card p-6 border-err/30 bg-err-muted/5">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-xl bg-err-muted flex items-center justify-center flex-shrink-0 mt-0.5">
                <svg className="w-5 h-5 text-err" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-bold text-err mb-2">Click the "Kill This Server" button</h3>
                <p className="text-base text-txt-2 leading-relaxed">
                  Wait for at least 2 checkpoints (you'll see blue dots on the loss chart), then
                  hit the red kill button on either worker. This sends a real{' '}
                  <code className="text-xs bg-surface-3 px-1 py-0.5 rounded text-txt-3 font-mono">docker kill</code>{' '}
                  — the container actually stops. Both workers go down (DDP requires it), and the
                  system transitions to <span className="text-err font-medium">FAILED</span>.
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="card px-4 py-4 text-center">
              <div className="w-8 h-8 rounded-full bg-err mx-auto mb-2 flex items-center justify-center">
                <span className="text-white text-xs font-bold">!</span>
              </div>
              <p className="text-sm font-semibold text-err mb-1">FAILED</p>
              <p className="text-2xs text-txt-3">Heartbeat timeout. System detects the crash.</p>
            </div>
            <div className="card px-4 py-4 text-center">
              <div className="w-8 h-8 rounded-full bg-recover mx-auto mb-2 flex items-center justify-center">
                <svg className="w-4 h-4 text-white animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              </div>
              <p className="text-sm font-semibold text-recover mb-1">RECOVERING</p>
              <p className="text-2xs text-txt-3">Loading last checkpoint from S3.</p>
            </div>
            <div className="card px-4 py-4 text-center">
              <div className="w-8 h-8 rounded-full bg-ok mx-auto mb-2 flex items-center justify-center">
                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="text-sm font-semibold text-ok mb-1">RESUMED</p>
              <p className="text-2xs text-txt-3">Training continues. Zero data lost.</p>
            </div>
          </div>

          <p className="text-base text-txt-2 leading-relaxed">
            The <span className="text-txt-1 font-medium">recovery proof card</span> will show you the exact step
            and loss value that was saved vs. restored — they match. If the checkpoint had failed, the loss
            would reset to ~2.3 (random weights). Look at the chart: training continues smoothly from
            where it left off.
          </p>
        </div>
      </section>

      {/* ── 06: Under the Hood ────────────────────────────────── */}
      <section className="max-w-4xl mx-auto px-5 py-16">
        <SectionCounter num={6} total={TOTAL} label="Under the Hood" />
        <h2 className="text-3xl sm:text-4xl font-bold text-txt-1 mb-4">
          Peek behind the curtain.
        </h2>
        <p className="text-base text-txt-3 mb-10 max-w-xl">
          The frontend is just the tip of the iceberg. Here's how to see what's actually
          happening inside each layer of the system.
        </p>

        <div className="space-y-6">
          {/* Watch logs */}
          <div className="card p-6">
            <h3 className="text-lg font-bold text-txt-1 mb-2">Watch real-time logs</h3>
            <p className="text-sm text-txt-3 mb-4">
              See heartbeats, checkpoint commits, failure detection, and recovery in real time.
            </p>
            <CodeBlock label="Terminal">{'# Control plane orchestration\ndocker logs -f ckpt-controlplane\n\n# Training worker output\ndocker logs -f ckpt-worker-0\n\n# Rust data plane (checkpoint I/O)\ndocker logs -f ckpt-dataplane'}</CodeBlock>
          </div>

          {/* Query the API */}
          <div className="card p-6">
            <h3 className="text-lg font-bold text-txt-1 mb-2">Query the REST API directly</h3>
            <p className="text-sm text-txt-3 mb-4">
              The control plane exposes everything. Hit it with curl and see raw JSON.
            </p>
            <CodeBlock label="Terminal">{'# List all training runs\ncurl http://localhost:8000/api/runs | python -m json.tool\n\n# Get active workers\ncurl http://localhost:8000/api/workers\n\n# Browse checkpoint storage\ncurl http://localhost:8000/api/demo/storage'}</CodeBlock>
          </div>

          {/* Observability stack */}
          <div className="card p-6">
            <h3 className="text-lg font-bold text-txt-1 mb-2">Full observability stack</h3>
            <p className="text-sm text-txt-3 mb-4">
              Prometheus, Grafana, and Jaeger are all running and collecting real telemetry.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <a href="http://localhost:3001" target="_blank" rel="noopener noreferrer"
                className="card px-4 py-3 text-center hover:shadow-glow-sm transition-shadow group cursor-pointer">
                <p className="text-sm font-semibold text-txt-1 group-hover:text-brand-violet transition-colors">Grafana</p>
                <p className="text-2xs text-txt-3">localhost:3001</p>
                <p className="text-2xs text-txt-3 mt-1">Checkpoint throughput, shard latency, queue depth</p>
              </a>
              <a href="http://localhost:16686" target="_blank" rel="noopener noreferrer"
                className="card px-4 py-3 text-center hover:shadow-glow-sm transition-shadow group cursor-pointer">
                <p className="text-sm font-semibold text-txt-1 group-hover:text-brand-violet transition-colors">Jaeger</p>
                <p className="text-2xs text-txt-3">localhost:16686</p>
                <p className="text-2xs text-txt-3 mt-1">Distributed traces across all services</p>
              </a>
              <a href="http://localhost:9001" target="_blank" rel="noopener noreferrer"
                className="card px-4 py-3 text-center hover:shadow-glow-sm transition-shadow group cursor-pointer">
                <p className="text-sm font-semibold text-txt-1 group-hover:text-brand-violet transition-colors">MinIO</p>
                <p className="text-2xs text-txt-3">localhost:9001</p>
                <p className="text-2xs text-txt-3 mt-1">Browse real checkpoint files in S3</p>
              </a>
            </div>
          </div>

          {/* Inspect storage */}
          <div className="card p-6">
            <h3 className="text-lg font-bold text-txt-1 mb-2">Inspect checkpoint storage directly</h3>
            <p className="text-sm text-txt-3 mb-4">
              Each checkpoint is a real set of files in MinIO: a <code className="text-2xs bg-surface-3 px-1 py-0.5 rounded text-ok font-mono">.bin</code> shard,
              a <code className="text-2xs bg-surface-3 px-1 py-0.5 rounded text-txt-3 font-mono">.sha256</code> checksum,
              and a <code className="text-2xs bg-surface-3 px-1 py-0.5 rounded text-warn font-mono">_manifest.json</code> that
              acts as the atomic commit point.
            </p>
            <TerminalBlock title="MinIO file listing">
              <p><span className="text-ok">$</span> docker exec ckpt-minio mc ls local/checkpoints/ --recursive</p>
              <p className="text-txt-3 mt-2">[2026-03-08 04:12:08]  3.8MiB  a1b2c3d4/f5e6d7c8/sha256-913e9c9d6b30-rank-0.bin</p>
              <p className="text-txt-3">[2026-03-08 04:12:08]     64B  a1b2c3d4/f5e6d7c8/rank-0.sha256</p>
              <p className="text-txt-3">[2026-03-08 04:12:08]    488B  a1b2c3d4/f5e6d7c8/_manifest.json</p>
              <p className="text-txt-3">[2026-03-08 04:13:24]  3.8MiB  a1b2c3d4/g9h0i1j2/sha256-edb9b9d6055e-rank-0.bin</p>
              <p className="text-txt-3">[2026-03-08 04:13:24]     64B  a1b2c3d4/g9h0i1j2/rank-0.sha256</p>
              <p className="text-txt-3">[2026-03-08 04:13:24]    488B  a1b2c3d4/g9h0i1j2/_manifest.json</p>
              <p className="text-txt-3 mt-1">...</p>
            </TerminalBlock>
          </div>
        </div>
      </section>

      {/* ── 07: Clean Up ──────────────────────────────────────── */}
      <section className="max-w-4xl mx-auto px-5 py-16">
        <SectionCounter num={7} total={TOTAL} label="Clean Up" />
        <h2 className="text-3xl sm:text-4xl font-bold text-txt-1 mb-4">
          Done? One command to clean up.
        </h2>
        <p className="text-base text-txt-3 mb-10 max-w-xl">
          This removes all containers, networks, and volumes. Nothing left behind.
        </p>

        <CodeBlock label="Terminal">{'docker compose down -v'}</CodeBlock>

        <p className="text-base text-txt-2 mt-6 leading-relaxed">
          That's it — all 11 containers, the MinIO checkpoint data, the etcd state, the Prometheus
          metrics. Gone. Your machine is exactly how it was before you started.
        </p>
      </section>

      {/* ── CTA ───────────────────────────────────────────────── */}
      <section className="max-w-4xl mx-auto px-5 py-16 text-center">
        <div className="card p-8 sm:p-12 border-brand-violet/20">
          <h2 className="text-2xl sm:text-3xl font-bold text-txt-1 mb-4">
            Still here? Go try the live version.
          </h2>
          <p className="text-base text-txt-2 mb-8 max-w-lg mx-auto">
            If you don't want to run Docker, the exact same stack is already running
            on my server. Same containers, same code — just hosted.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              to="/demo"
              className="btn-primary cursor-pointer inline-flex items-center gap-2 px-8 py-3.5 text-base font-semibold rounded-lg"
            >
              Try the Live Demo
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </Link>
            <Link
              to="/"
              className="btn-ghost cursor-pointer inline-flex items-center gap-2 px-6 py-3 text-base font-medium"
            >
              Back to Home
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
