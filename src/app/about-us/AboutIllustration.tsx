
const SKIN_A = "#e9b48c";
const SKIN_B = "#c98a62";

export function AboutIllustration({ className }: { className?: string }) {
  const line = { stroke: "var(--border-strong)", strokeWidth: 2, strokeLinecap: "round" as const };
  return (
    <svg className={className} viewBox="0 0 600 380" role="presentation" aria-hidden focusable="false" preserveAspectRatio="xMidYMid meet">
      {/* leaves */}
      <g fill="var(--primary)" opacity=".2">
        <ellipse cx="38" cy="290" rx="16" ry="52" transform="rotate(-18 38 290)" />
        <ellipse cx="72" cy="270" rx="14" ry="46" transform="rotate(14 72 270)" />
        <ellipse cx="560" cy="270" rx="16" ry="54" transform="rotate(16 560 270)" />
        <ellipse cx="528" cy="300" rx="13" ry="44" transform="rotate(-14 528 300)" />
      </g>
      <g fill="var(--primary)" opacity=".35">
        <ellipse cx="52" cy="318" rx="10" ry="34" transform="rotate(-30 52 318)" />
        <ellipse cx="548" cy="322" rx="10" ry="34" transform="rotate(30 548 322)" />
      </g>
      <g fill="none" stroke="var(--primary)" strokeWidth="2" strokeDasharray="5 6" strokeLinecap="round" opacity=".7">
        <path d="M170 150 C 200 120, 235 105, 262 116" />
        <path d="M455 160 C 480 130, 500 120, 512 112" />
      </g>

      {/* product cards */}
      <g>
        <rect x="236" y="26" width="104" height="104" rx="14" fill="#fff" stroke="var(--border)" strokeWidth="2" />
        <path d="M288 46 l26 14 v28 l-26 14 l-26 -14 v-28 z" fill="var(--accent)" />
        <path d="M288 46 l26 14 l-26 14 l-26 -14 z" fill="var(--accent-light)" />
        <path d="M288 74 v28" {...line} stroke="var(--accent-hover)" />
        <path d="M256 112 h64 M266 121 h44" {...line} />

        <rect x="362" y="8" width="104" height="104" rx="14" fill="#fff" stroke="var(--border)" strokeWidth="2" />
        <circle cx="414" cy="52" r="20" fill="none" stroke="var(--primary)" strokeWidth="9" strokeDasharray="7 5" />
        <circle cx="414" cy="52" r="14" fill="#fff" stroke="var(--primary)" strokeWidth="5" />
        <circle cx="414" cy="52" r="5" fill="var(--primary)" />
        <path d="M382 94 h64 M392 103 h44" {...line} />

        <rect x="488" y="40" width="96" height="96" rx="14" fill="#fff" stroke="var(--border)" strokeWidth="2" />
        <g fill="var(--text-secondary)" opacity=".85">
          <rect x="506" y="62" width="60" height="9" rx="4.5" transform="rotate(-24 536 66)" />
          <rect x="506" y="76" width="60" height="9" rx="4.5" transform="rotate(-24 536 80)" />
          <rect x="510" y="90" width="52" height="9" rx="4.5" transform="rotate(-24 536 94)" />
        </g>
        <path d="M506 122 h60" {...line} />
      </g>

      {/* conversation bubbles */}
      <g>
        <rect x="262" y="206" width="92" height="52" rx="22" fill="var(--primary)" />
        <path d="M284 256 l-10 18 l24 -14 z" fill="var(--primary)" />
        <g fill="#fff"><circle cx="290" cy="232" r="5" /><circle cx="308" cy="232" r="5" /><circle cx="326" cy="232" r="5" /></g>
        <rect x="376" y="228" width="84" height="48" rx="20" fill="var(--primary-bright)" />
        <path d="M440 274 l12 16 l-24 -12 z" fill="var(--primary-bright)" />
        <g fill="#fff"><circle cx="400" cy="252" r="4.5" /><circle cx="418" cy="252" r="4.5" /><circle cx="436" cy="252" r="4.5" /></g>
      </g>

      {/* desk */}
      <rect x="40" y="338" width="520" height="8" rx="4" fill="var(--primary-light)" stroke="var(--border)" />

      {/* left person (shirt in teal, short dark hair) */}
      <g>
        <path d="M70 338 c0 -64 22 -96 72 -96 s72 32 72 96 z" fill="var(--primary-bright)" />
        <path d="M118 248 h48 l-8 22 h-32 z" fill="#fff" opacity=".9" />
        <rect x="128" y="226" width="28" height="26" rx="10" fill={SKIN_A} />
        <circle cx="142" cy="190" r="36" fill={SKIN_A} />
        <path d="M107 188 c-6 -34 22 -52 46 -46 c22 4 32 22 28 40 c-8 -14 -22 -22 -40 -20 c-16 2 -26 12 -34 26 z" fill="var(--text-primary)" />
        <circle cx="106" cy="194" r="7" fill={SKIN_A} />
        <circle cx="127" cy="196" r="3.2" fill="var(--text-primary)" /><circle cx="156" cy="196" r="3.2" fill="var(--text-primary)" />
        <path d="M130 211 q13 10 26 0" fill="none" stroke="var(--text-primary)" strokeWidth="3" strokeLinecap="round" />
        <path d="M98 142 l-12 -14 M112 134 l-4 -18 M128 130 l2 -18" stroke="var(--accent)" strokeWidth="4" strokeLinecap="round" />
        {/* laptop, seen from behind */}
        <rect x="86" y="276" width="156" height="62" rx="8" fill="var(--text-secondary)" />
        <rect x="74" y="332" width="180" height="8" rx="4" fill="var(--text-muted)" />
        <circle cx="164" cy="308" r="7" fill="#fff" opacity=".85" />
      </g>

      {/* right person (yellow cardigan, long dark hair) */}
      <g>
        <path d="M418 338 c0 -64 22 -98 74 -98 s72 34 72 98 z" fill="var(--accent)" />
        <path d="M470 246 h44 l-6 24 h-32 z" fill="#fff" />
        <rect x="480" y="222" width="28" height="28" rx="10" fill={SKIN_B} />
        <path d="M452 200 c-8 -52 34 -70 62 -60 c26 8 36 36 30 70 c-4 26 4 38 -2 56 c-14 -6 -14 -32 -18 -48 c-6 -22 -26 -34 -44 -30 c-10 18 -10 40 -22 52 c-10 -6 -4 -22 -6 -40 z" fill="var(--text-primary)" />
        <circle cx="496" cy="194" r="34" fill={SKIN_B} />
        <path d="M463 190 c8 -30 44 -34 66 -14 c-4 14 -14 18 -26 14 c-14 -4 -26 -2 -40 0 z" fill="var(--text-primary)" />
        <circle cx="482" cy="198" r="3.2" fill="var(--text-primary)" /><circle cx="510" cy="198" r="3.2" fill="var(--text-primary)" />
        <path d="M484 212 q12 9 24 0" fill="none" stroke="var(--text-primary)" strokeWidth="3" strokeLinecap="round" />
        <path d="M545 148 l12 -14 M532 140 l4 -18" stroke="var(--accent)" strokeWidth="4" strokeLinecap="round" />
        {/* laptop, seen from behind */}
        <rect x="414" y="278" width="158" height="60" rx="8" fill="var(--text-secondary)" />
        <rect x="402" y="332" width="182" height="8" rx="4" fill="var(--text-muted)" />
        <circle cx="494" cy="308" r="7" fill="#fff" opacity=".85" />
      </g>
    </svg>
  );
}
