const STEPS = [
  {
    title: 'Training Has Started',
    description:
      'Two computers are teaching an AI model together. Watch the step counter climb in the metrics above -- each step means the model is learning a little more.',
  },
  {
    title: 'Save Points Are Being Created',
    description:
      'Every 50 steps, the system saves a snapshot of everything the AI has learned -- like a save point in a video game. Check the Storage panel to see new files appearing.',
  },
  {
    title: 'Crash a Computer',
    description:
      'Click the red "Kill" button on any worker to shut down one of the training computers on purpose. This is a real crash -- not a simulation.',
  },
  {
    title: 'The System Noticed Something Went Wrong',
    description:
      'The system detected that a computer stopped sending heartbeats. Watch the state change to FAILED in the Event Timeline, and look for "heartbeat timeout" in the Live Logs.',
  },
  {
    title: 'Everything Recovered Automatically',
    description:
      'The crashed computer restarted, loaded the last save point from storage, and picked up training right where it left off. No work was lost!',
  },
];

interface Props {
  currentStep: number;
}

export default function DemoWalkthrough({ currentStep }: Props) {
  const step = STEPS[currentStep] ?? STEPS[0];
  const num = Math.min(currentStep, STEPS.length - 1);

  return (
    <div className="glass-strong p-4">
      {/* Progress bar */}
      <div className="flex items-center gap-1 mb-3">
        {STEPS.map((_, i) => (
          <div
            key={i}
            className={`h-1 rounded-full transition-all duration-300 ${
              i <= num ? 'w-6 bg-brand-violet' : 'w-2 bg-surface-3'
            }`}
          />
        ))}
      </div>

      {/* Current step */}
      <h4 className="text-base font-semibold text-txt-1 mb-1">{step.title}</h4>
      <p className="text-sm text-txt-2 leading-relaxed">{step.description}</p>
    </div>
  );
}
