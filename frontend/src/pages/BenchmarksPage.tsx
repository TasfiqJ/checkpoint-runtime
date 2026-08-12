const RESULTS_BASE =
  'https://github.com/TasfiqJ/checkpoint-runtime/blob/main/benchmarks/results/shard-size-matrix';

const shardResults = [
  { size: '1 MiB', bufferedThroughput: '3.223', streamingThroughput: '3.177', throughputDelta: '-1.42%', bufferedP95: '101.70 ms', streamingP95: '131.60 ms', latencyDelta: '+29.40%' },
  { size: '16 MiB', bufferedThroughput: '47.093', streamingThroughput: '43.508', throughputDelta: '-7.61%', bufferedP95: '294.65 ms', streamingP95: '516.60 ms', latencyDelta: '+75.33%' },
  { size: '64 MiB', bufferedThroughput: '123.785', streamingThroughput: '111.762', throughputDelta: '-9.71%', bufferedP95: '1,338.25 ms', streamingP95: '1,538.70 ms', latencyDelta: '+14.98%' },
  { size: '256 MiB', bufferedThroughput: '179.038', streamingThroughput: '137.025', throughputDelta: '-23.47%', bufferedP95: '7,137.20 ms', streamingP95: '7,581.50 ms', latencyDelta: '+6.23%' },
];

const artifacts = [
  ['buffered-1mib-k6-summary.json', '1686ec99a359eab000be040f6cd36e641fae927e64d75d838cb715fbd0359e70'],
  ['streaming-1mib-k6-summary.json', 'fa8eb2729f3631114ef84dcd223b5037421e4dbfe8dbf0231605e408b9ebed23'],
  ['buffered-16mib-k6-summary.json', '3f7a32b0598a06aade9910295de263097ece678fa66e883504e80a5dd13170a9'],
  ['streaming-16mib-k6-summary.json', '996174256166e70557537328650c3ac8a9cbd879b83f61fe65698bf8af4dfa7f'],
  ['buffered-64mib-k6-summary.json', '286edc325fb2c88974880cb7b170a0f071c687b92e9d7c594331a56a136cb83d'],
  ['streaming-64mib-k6-summary.json', '6c3c3bd0f888f0aebfb8a5c68dcf4b443a41bae778138b367b3cef74d1a1db72'],
  ['buffered-256mib-k6-summary.json', '4777a14e22b3ddae75a64a7ab69c053beada9f27a412769a3d413cfd4e823208'],
  ['streaming-256mib-k6-summary.json', 'c6d58701d8f411aff05e9f7f830aa8fccee326c9992b1f4cb16af9f85a106044'],
] as const;

function ExternalLinkIcon() {
  return (
    <svg className="h-4 w-4 flex-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H18m0 0v4.5M18 6l-7.5 7.5M8.25 7.5H6.75A2.25 2.25 0 004.5 9.75v7.5a2.25 2.25 0 002.25 2.25h7.5a2.25 2.25 0 002.25-2.25v-1.5" />
    </svg>
  );
}

export default function BenchmarksPage() {
  return (
    <div className="mx-auto max-w-6xl space-y-10 pb-12">
      <header>
        <div className="section-counter">
          <span className="num">04</span><span className="divider">/</span><span className="label">Measured evidence</span>
        </div>
        <h1 className="page-header">Benchmarks</h1>
        <p className="page-subtitle max-w-3xl">
          The streaming optimization lost. This page publishes the result, the raw artifacts, and the design cost that likely explains it.
        </p>
      </header>

      <section className="rounded-2xl border border-err/30 bg-err-muted p-5 sm:p-6">
        <div className="flex flex-col items-start gap-3 sm:flex-row">
          <span className="badge bg-err/15 text-err">Retracted</span>
          <div>
            <h2 className="text-lg font-semibold text-txt-1">The earlier +63% throughput / -45% p95 figures were not measured.</h2>
            <p className="mt-2 text-sm leading-relaxed text-txt-2">
              They were unmeasured projections for a proposed design and have been retracted. No baseline run was recorded for those claims.
            </p>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-brand-violet">Recovery measurement</p>
          <h2 className="mt-1 text-2xl font-semibold text-txt-1">Failure recovery, measured over 10 kill trials</h2>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="card p-5">
            <p className="metric-label">Kill trials</p>
            <p className="metric-value">10</p>
          </div>
          <div className="card p-5">
            <p className="metric-label">Worst case</p>
            <p className="metric-value text-recover">9.689s</p>
          </div>
          <div className="card p-5 sm:col-span-1">
            <p className="metric-label">Recovery hold</p>
            <p className="metric-value">~6s</p>
          </div>
        </div>
        <div className="card border-recover/25 bg-recover-muted p-5">
          <p className="text-sm leading-relaxed text-txt-2">
            Roughly six seconds is a deliberate <code className="rounded bg-surface-3 px-1.5 py-0.5 font-mono text-xs text-recover">RECOVERING</code> hold.
            Restarting a dead process is the orchestrator's job; the runtime detects the failure and coordinates recovery after a replacement process is available.
          </p>
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-end">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-brand-violet">Shard-size A/B</p>
            <h2 className="mt-1 text-2xl font-semibold text-txt-1">Streaming was slower at every tested size</h2>
          </div>
          <span className="badge w-fit bg-err-muted text-err">No crossover</span>
        </div>
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[920px] text-sm">
            <thead>
              <tr className="border-b border-line">
                <th rowSpan={2} className="table-header align-bottom">Shard</th>
                <th colSpan={3} className="table-header text-center">Throughput (MiB/s)</th>
                <th colSpan={3} className="table-header text-center">p95 latency</th>
              </tr>
              <tr className="border-b border-line">
                <th className="table-header text-right">Buffered</th>
                <th className="table-header text-right">Streaming</th>
                <th className="table-header text-right">Change</th>
                <th className="table-header text-right">Buffered</th>
                <th className="table-header text-right">Streaming</th>
                <th className="table-header text-right">Change</th>
              </tr>
            </thead>
            <tbody>
              {shardResults.map((row) => (
                <tr key={row.size} className="border-b border-line-subtle last:border-0">
                  <td className="table-cell font-semibold text-txt-1">{row.size}</td>
                  <td className="table-cell text-right font-mono text-txt-2">{row.bufferedThroughput}</td>
                  <td className="table-cell text-right font-mono text-txt-2">{row.streamingThroughput}</td>
                  <td className="table-cell text-right font-mono font-semibold text-err">{row.throughputDelta}</td>
                  <td className="table-cell text-right font-mono text-txt-2">{row.bufferedP95}</td>
                  <td className="table-cell text-right font-mono text-txt-2">{row.streamingP95}</td>
                  <td className="table-cell text-right font-mono font-semibold text-err">{row.latencyDelta}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-sm leading-relaxed text-txt-2">
          Negative throughput changes mean the streaming build moved fewer bytes per second; positive latency changes mean its p95 was worse. There is no shard size in this matrix where streaming outperformed buffered.
        </p>
      </section>

      <section className="card overflow-hidden">
        <div className="border-b border-line px-5 py-4 sm:px-6">
          <p className="text-xs font-semibold uppercase tracking-widest text-brand-violet">Why the pipeline lost</p>
          <h2 className="mt-1 text-xl font-semibold text-txt-1">Content addressing adds a promotion step</h2>
        </div>
        <div className="grid gap-6 p-5 sm:p-6 lg:grid-cols-[1fr_1.25fr]">
          <div className="flex flex-wrap items-center gap-2 font-mono text-xs text-txt-2">
            {['5 MiB parts', 'staging object', 'server-side copy', 'final hash key'].map((label, index) => (
              <div key={label} className="contents">
                {index > 0 && <span className="text-err">→</span>}
                <span className="rounded-lg border border-line bg-surface-2 px-3 py-2">{label}</span>
              </div>
            ))}
          </div>
          <p className="text-sm leading-relaxed text-txt-2">
            The final object key contains the SHA-256 digest, which is unknown until the full shard has arrived. The streaming path therefore writes multipart data to a staging key, then performs a server-side copy to the content-addressed key and deletes the staging object. That extra write-promotion path likely outweighs the gains from hashing and uploading in parallel.
          </p>
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-brand-violet">Raw evidence</p>
            <h2 className="mt-1 text-2xl font-semibold text-txt-1">Eight k6 JSON summaries</h2>
          </div>
          <a href={`${RESULTS_BASE}/README.md`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-sm font-medium text-brand-violet hover:text-brand-blue">
            Matrix methodology <ExternalLinkIcon />
          </a>
        </div>
        <div className="grid gap-3 lg:grid-cols-2">
          {artifacts.map(([filename, sha256]) => (
            <a key={filename} href={`${RESULTS_BASE}/${filename}`} target="_blank" rel="noopener noreferrer" className="card group p-4 hover:border-brand-violet/40">
              <div className="flex items-start justify-between gap-3">
                <span className="break-all font-mono text-xs font-semibold text-txt-1 group-hover:text-brand-violet">{filename}</span>
                <ExternalLinkIcon />
              </div>
              <p className="mt-3 text-2xs font-semibold uppercase tracking-wider text-txt-3">SHA-256</p>
              <p className="mt-1 break-all font-mono text-[11px] leading-relaxed text-txt-2">{sha256}</p>
            </a>
          ))}
        </div>
      </section>
    </div>
  );
}
