const STEPS = [
  {
    title: 'Training is Running',
    description:
      'Two PyTorch workers are training a neural network. Watch the step counter increase and loss values decrease in the Live Logs panel.',
  },
  {
    title: 'Checkpoints are Saving',
    description:
      'Every 50 steps, model weights (real tensor bytes) stream through gRPC to the Rust data plane, then to MinIO. See new .bin files appearing in the Storage panel.',
  },
  {
    title: 'Kill a Worker',
    description:
      'Click the red Kill button on any worker. This runs docker kill on the actual container. Watch the Infrastructure panel — the process dies.',
  },
  {
    title: 'Failure Detected',
    description:
      'The control plane detects the missed heartbeat. Watch the state change to FAILED in the Event Timeline. See "heartbeat timeout" in the Live Logs.',
  },
  {
    title: 'Recovery Complete',
    description:
      'The worker auto-restarts, loads the last checkpoint from MinIO, and resumes training. The step counter continues from the checkpoint — not from zero.',
  },
];

interface Props {
  currentStep: number;
}

export default function DemoWalkthrough({ currentStep }: Props) {
  const step = STEPS[currentStep] ?? STEPS[0];
  const num = Math.min(currentStep, STEPS.length - 1);

  return (
    <div className="bg-gray-900/80 backdrop-blur border border-gray-700 rounded-xl p-4">
      {/* Progress dots */}
      <div className="flex items-center gap-3 mb-3">
        <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
          Step {num + 1}/{STEPS.length}
        </span>
        <div className="flex gap-1.5">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className={`w-2 h-2 rounded-full transition-colors ${
                i <= num ? 'bg-indigo-500' : 'bg-gray-700'
              }`}
            />
          ))}
        </div>
      </div>

      {/* Current step */}
      <h4 className="text-sm font-semibold text-gray-100 mb-1">{step.title}</h4>
      <p className="text-xs text-gray-400 leading-relaxed">{step.description}</p>
    </div>
  );
}
