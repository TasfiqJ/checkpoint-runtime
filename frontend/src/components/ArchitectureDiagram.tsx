/**
 * Architecture diagram built with CSS/Tailwind — no external library.
 * Shows the 11-service topology of the checkpoint runtime.
 */

function ServiceBox({
  label,
  sub,
  color,
}: {
  label: string;
  sub: string;
  color: string;
}) {
  return (
    <div
      className={`rounded-lg border px-3 py-2 text-center ${color} min-w-[110px]`}
    >
      <div className="text-xs font-semibold">{label}</div>
      <div className="text-[10px] opacity-60">{sub}</div>
    </div>
  );
}

function Arrow({ direction = 'right' }: { direction?: 'right' | 'down' }) {
  if (direction === 'down') {
    return (
      <div className="flex justify-center py-1">
        <div className="w-px h-6 bg-gray-600 relative">
          <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-0 h-0 border-l-[4px] border-l-transparent border-r-[4px] border-r-transparent border-t-[5px] border-t-gray-600" />
        </div>
      </div>
    );
  }
  return (
    <div className="flex items-center px-1">
      <div className="h-px w-6 bg-gray-600 relative">
        <div className="absolute -right-1 top-1/2 -translate-y-1/2 w-0 h-0 border-t-[4px] border-t-transparent border-b-[4px] border-b-transparent border-l-[5px] border-l-gray-600" />
      </div>
    </div>
  );
}

export default function ArchitectureDiagram() {
  return (
    <div className="bg-gray-900/50 border border-gray-800 rounded-2xl p-6 overflow-x-auto">
      {/* Main data flow row */}
      <div className="flex items-center justify-center gap-0 flex-wrap">
        {/* Workers */}
        <div className="flex flex-col gap-2">
          <ServiceBox
            label="Worker 0"
            sub="PyTorch DDP"
            color="border-green-700 bg-green-950/40 text-green-300"
          />
          <ServiceBox
            label="Worker 1"
            sub="PyTorch DDP"
            color="border-green-700 bg-green-950/40 text-green-300"
          />
        </div>

        <Arrow />

        {/* Control Plane */}
        <div className="flex flex-col items-center gap-1">
          <ServiceBox
            label="Control Plane"
            sub="Python / FastAPI"
            color="border-blue-700 bg-blue-950/40 text-blue-300"
          />
          <Arrow direction="down" />
          <ServiceBox
            label="etcd"
            sub="Coordination"
            color="border-purple-700 bg-purple-950/40 text-purple-300"
          />
        </div>

        <Arrow />

        {/* Data Plane */}
        <div className="flex flex-col items-center gap-1">
          <ServiceBox
            label="Data Plane"
            sub="Rust / gRPC"
            color="border-orange-700 bg-orange-950/40 text-orange-300"
          />
          <Arrow direction="down" />
          <ServiceBox
            label="MinIO"
            sub="S3 Storage"
            color="border-yellow-700 bg-yellow-950/40 text-yellow-300"
          />
        </div>

        <Arrow />

        {/* Observability */}
        <div className="flex flex-col gap-2">
          <ServiceBox
            label="Prometheus"
            sub="Metrics"
            color="border-red-800 bg-red-950/40 text-red-300"
          />
          <ServiceBox
            label="Grafana"
            sub="Dashboards"
            color="border-red-800 bg-red-950/40 text-red-300"
          />
          <ServiceBox
            label="Jaeger"
            sub="Tracing"
            color="border-red-800 bg-red-950/40 text-red-300"
          />
        </div>
      </div>

      {/* OTEL Collector label */}
      <div className="flex justify-center mt-3">
        <div className="text-[10px] text-gray-500 bg-gray-800/50 rounded-full px-3 py-0.5">
          Connected via OpenTelemetry Collector
        </div>
      </div>
    </div>
  );
}
