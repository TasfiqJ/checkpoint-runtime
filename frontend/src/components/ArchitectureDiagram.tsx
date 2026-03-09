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
            color="border-ok/20 bg-ok-muted text-ok"
          />
          <ServiceBox
            label="Worker 1"
            sub="PyTorch DDP"
            color="border-ok/20 bg-ok-muted text-ok"
          />
        </div>

        <Arrow />

        {/* Control Plane */}
        <div className="flex flex-col items-center gap-1">
          <ServiceBox
            label="Control Plane"
            sub="Python / FastAPI"
            color="border-info/20 bg-info-muted text-info"
          />
          <Arrow direction="down" />
          <ServiceBox
            label="etcd"
            sub="Coordination"
            color="border-brand-violet/20 bg-brand-violet/10 text-brand-violet"
          />
        </div>

        <Arrow />

        {/* Data Plane */}
        <div className="flex flex-col items-center gap-1">
          <ServiceBox
            label="Data Plane"
            sub="Rust / gRPC"
            color="border-recover/20 bg-recover-muted text-recover"
          />
          <Arrow direction="down" />
          <ServiceBox
            label="MinIO"
            sub="S3 Storage"
            color="border-warn/20 bg-warn-muted text-warn"
          />
        </div>

        <Arrow />

        {/* Observability */}
        <div className="flex flex-col gap-2">
          <ServiceBox
            label="Prometheus"
            sub="Metrics"
            color="border-err/20 bg-err-muted text-err"
          />
          <ServiceBox
            label="Grafana"
            sub="Dashboards"
            color="border-err/20 bg-err-muted text-err"
          />
          <ServiceBox
            label="Jaeger"
            sub="Tracing"
            color="border-err/20 bg-err-muted text-err"
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
