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
    <div className={`rounded-lg border px-3 py-2 text-center ${color} min-w-[110px]`}>
      <div className="text-xs font-semibold">{label}</div>
      <div className="text-2xs opacity-60">{sub}</div>
    </div>
  );
}

function Arrow({ direction = 'right' }: { direction?: 'right' | 'down' }) {
  if (direction === 'down') {
    return (
      <div className="flex justify-center py-1">
        <div className="w-px h-6 bg-line-emphasis relative">
          <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-0 h-0 border-l-[4px] border-l-transparent border-r-[4px] border-r-transparent border-t-[5px] border-t-line-emphasis" />
        </div>
      </div>
    );
  }
  return (
    <div className="flex items-center px-1">
      <div className="h-px w-6 bg-line-emphasis relative">
        <div className="absolute -right-1 top-1/2 -translate-y-1/2 w-0 h-0 border-t-[4px] border-t-transparent border-b-[4px] border-b-transparent border-l-[5px] border-l-line-emphasis" />
      </div>
    </div>
  );
}

export default function ArchitectureDiagram() {
  return (
    <div className="card p-6 overflow-x-auto">
      <div className="flex items-center justify-center gap-0 flex-wrap">
        {/* Workers */}
        <div className="flex flex-col gap-2">
          <ServiceBox
            label="Worker 0"
            sub="PyTorch DDP"
            color="border-emerald-800/60 bg-emerald-950/30 text-ok"
          />
          <ServiceBox
            label="Worker 1"
            sub="PyTorch DDP"
            color="border-emerald-800/60 bg-emerald-950/30 text-ok"
          />
        </div>

        <Arrow />

        {/* Control Plane */}
        <div className="flex flex-col items-center gap-1">
          <ServiceBox
            label="Control Plane"
            sub="Python / FastAPI"
            color="border-sky-800/60 bg-sky-950/30 text-info"
          />
          <Arrow direction="down" />
          <ServiceBox
            label="etcd"
            sub="Coordination"
            color="border-purple-800/60 bg-purple-950/30 text-purple-400"
          />
        </div>

        <Arrow />

        {/* Data Plane */}
        <div className="flex flex-col items-center gap-1">
          <ServiceBox
            label="Data Plane"
            sub="Rust / gRPC"
            color="border-orange-800/60 bg-orange-950/30 text-recover"
          />
          <Arrow direction="down" />
          <ServiceBox
            label="MinIO"
            sub="S3 Storage"
            color="border-amber-800/60 bg-amber-950/30 text-warn"
          />
        </div>

        <Arrow />

        {/* Observability */}
        <div className="flex flex-col gap-2">
          <ServiceBox
            label="Prometheus"
            sub="Metrics"
            color="border-rose-800/60 bg-rose-950/30 text-err"
          />
          <ServiceBox
            label="Grafana"
            sub="Dashboards"
            color="border-rose-800/60 bg-rose-950/30 text-err"
          />
          <ServiceBox
            label="Jaeger"
            sub="Tracing"
            color="border-rose-800/60 bg-rose-950/30 text-err"
          />
        </div>
      </div>

      <div className="flex justify-center mt-3">
        <div className="text-2xs text-txt-3 bg-surface-3 rounded-full px-3 py-0.5">
          Connected via OpenTelemetry Collector
        </div>
      </div>
    </div>
  );
}
