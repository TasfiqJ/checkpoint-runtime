export default function TrainingInfo() {
  return (
    <div className="card p-4">
      <div className="panel-header">
        <span className="panel-tag">model</span>
        <h4 className="panel-title">What's Training</h4>
      </div>

      {/* Layer diagram */}
      <div className="mt-3 mb-3 flex items-center justify-center gap-1 overflow-x-auto">
        {[
          { label: 'Input', dim: '784' },
          { label: 'Hidden', dim: '256' },
          { label: 'Hidden', dim: '256' },
          { label: 'Hidden', dim: '256' },
          { label: 'Output', dim: '10' },
        ].map((layer, i, arr) => (
          <div key={i} className="flex items-center gap-1">
            <div className="flex flex-col items-center">
              <div className={`px-2 py-1 rounded-md text-2xs font-mono font-semibold border ${
                i === 0 ? 'border-info/30 bg-info-muted text-info' :
                i === arr.length - 1 ? 'border-ok/30 bg-ok-muted text-ok' :
                'border-line bg-surface-2 text-txt-2'
              }`}>
                {layer.dim}
              </div>
              <span className="text-[8px] text-txt-3 mt-0.5">{layer.label}</span>
            </div>
            {i < arr.length - 1 && (
              <svg className="w-3 h-3 text-txt-3 flex-shrink-0 -mt-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            )}
          </div>
        ))}
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-3 gap-2 text-center">
        {[
          { label: 'Parameters', value: '202K' },
          { label: 'Loss fn', value: 'CrossEntropy' },
          { label: 'Optimizer', value: 'Adam' },
          { label: 'Dataset', value: '1024 samples' },
          { label: 'Workers', value: '2 (DDP)' },
          { label: 'Ckpt interval', value: '50 steps' },
        ].map(({ label, value }) => (
          <div key={label} className="py-1">
            <p className="text-2xs text-txt-3">{label}</p>
            <p className="text-xs font-semibold text-txt-1">{value}</p>
          </div>
        ))}
      </div>

      <p className="text-2xs text-txt-3 mt-2 leading-relaxed">
        A real MLP neural network training on synthetic MNIST-like data using PyTorch Distributed Data Parallel across 2 CPU workers.
      </p>
    </div>
  );
}
