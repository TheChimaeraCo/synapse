/**
 * Empty state illustrations with inline SVGs using accent gradient colors.
 */

function GradientDefs({ id }: { id: string }) {
  return (
    <defs>
      <linearGradient id={`${id}-grad`} x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="rgba(59,130,246,0.4)" />
        <stop offset="100%" stopColor="rgba(168,85,247,0.4)" />
      </linearGradient>
      <linearGradient id={`${id}-grad-light`} x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="rgba(59,130,246,0.15)" />
        <stop offset="100%" stopColor="rgba(168,85,247,0.15)" />
      </linearGradient>
    </defs>
  );
}

export function EmptyChatIllustration() {
  return (
    <svg width="120" height="120" viewBox="0 0 120 120" fill="none" className="mx-auto mb-4">
      <GradientDefs id="chat" />
      <rect x="15" y="20" width="70" height="50" rx="12" stroke="url(#chat-grad)" strokeWidth="2" fill="url(#chat-grad-light)" />
      <circle cx="35" cy="45" r="3" fill="url(#chat-grad)" />
      <circle cx="50" cy="45" r="3" fill="url(#chat-grad)" />
      <circle cx="65" cy="45" r="3" fill="url(#chat-grad)" />
      <rect x="35" y="55" width="60" height="40" rx="12" stroke="url(#chat-grad)" strokeWidth="2" fill="url(#chat-grad-light)" opacity="0.7" />
      <rect x="45" y="71" width="40" height="4" rx="2" fill="url(#chat-grad)" opacity="0.5" />
      <rect x="45" y="79" width="25" height="4" rx="2" fill="url(#chat-grad)" opacity="0.3" />
    </svg>
  );
}

export function EmptyKnowledgeIllustration() {
  return (
    <svg width="120" height="120" viewBox="0 0 120 120" fill="none" className="mx-auto mb-4">
      <GradientDefs id="know" />
      {/* Brain/lightbulb outline */}
      <path
        d="M60 20C45 20 33 32 33 47c0 8 3.5 15 9 20v13h36V67c5.5-5 9-12 9-20C87 32 75 20 60 20z"
        stroke="url(#know-grad)" strokeWidth="2" fill="url(#know-grad-light)"
      />
      <rect x="42" y="85" width="36" height="6" rx="3" stroke="url(#know-grad)" strokeWidth="2" fill="url(#know-grad-light)" />
      <rect x="46" y="95" width="28" height="6" rx="3" stroke="url(#know-grad)" strokeWidth="2" fill="url(#know-grad-light)" />
      {/* Rays */}
      <line x1="60" y1="5" x2="60" y2="12" stroke="url(#know-grad)" strokeWidth="2" strokeLinecap="round" />
      <line x1="90" y1="18" x2="85" y2="23" stroke="url(#know-grad)" strokeWidth="2" strokeLinecap="round" />
      <line x1="30" y1="18" x2="35" y2="23" stroke="url(#know-grad)" strokeWidth="2" strokeLinecap="round" />
      <line x1="100" y1="47" x2="93" y2="47" stroke="url(#know-grad)" strokeWidth="2" strokeLinecap="round" />
      <line x1="20" y1="47" x2="27" y2="47" stroke="url(#know-grad)" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function EmptyProjectsIllustration() {
  return (
    <svg width="120" height="120" viewBox="0 0 120 120" fill="none" className="mx-auto mb-4">
      <GradientDefs id="proj" />
      {/* Folder shape */}
      <path
        d="M15 35h30l8-10h42c3.3 0 6 2.7 6 6v54c0 3.3-2.7 6-6 6H15c-3.3 0-6-2.7-6-6V41c0-3.3 2.7-6 6-6z"
        stroke="url(#proj-grad)" strokeWidth="2" fill="url(#proj-grad-light)"
      />
      {/* Inner lines */}
      <rect x="25" y="55" width="50" height="4" rx="2" fill="url(#proj-grad)" opacity="0.4" />
      <rect x="25" y="65" width="35" height="4" rx="2" fill="url(#proj-grad)" opacity="0.3" />
      <rect x="25" y="75" width="45" height="4" rx="2" fill="url(#proj-grad)" opacity="0.2" />
    </svg>
  );
}

export function EmptyAnalyticsIllustration() {
  return (
    <svg width="120" height="120" viewBox="0 0 120 120" fill="none" className="mx-auto mb-4">
      <GradientDefs id="anal" />
      {/* Chart bars */}
      <rect x="15" y="70" width="16" height="35" rx="4" stroke="url(#anal-grad)" strokeWidth="2" fill="url(#anal-grad-light)" />
      <rect x="37" y="45" width="16" height="60" rx="4" stroke="url(#anal-grad)" strokeWidth="2" fill="url(#anal-grad-light)" />
      <rect x="59" y="55" width="16" height="50" rx="4" stroke="url(#anal-grad)" strokeWidth="2" fill="url(#anal-grad-light)" />
      <rect x="81" y="25" width="16" height="80" rx="4" stroke="url(#anal-grad)" strokeWidth="2" fill="url(#anal-grad-light)" />
      {/* Trend line */}
      <path d="M23 65 L45 40 L67 50 L89 20" stroke="url(#anal-grad)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      {/* Dots */}
      <circle cx="23" cy="65" r="3" fill="url(#anal-grad)" />
      <circle cx="45" cy="40" r="3" fill="url(#anal-grad)" />
      <circle cx="67" cy="50" r="3" fill="url(#anal-grad)" />
      <circle cx="89" cy="20" r="3" fill="url(#anal-grad)" />
    </svg>
  );
}
