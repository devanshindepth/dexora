"use client";

interface SentimentArcProps {
  value: number; // 0.0 – 1.0
  label?: string;
}

export function SentimentArc({ value, label = "Sentiment" }: SentimentArcProps) {
  const size = 88;
  const cx = size / 2;
  const cy = size / 2 + 8;
  const r = 30;
  const strokeWidth = 6;

  // Arc from 210° to 330° (a 120° arc centered at bottom)
  // We use a larger visible arc from left to right
  const startAngle = -210; // degrees
  const totalArcDeg = 240;

  function polarToCartesian(angleDeg: number) {
    const rad = ((angleDeg - 90) * Math.PI) / 180;
    return {
      x: cx + r * Math.cos(rad),
      y: cy + r * Math.sin(rad),
    };
  }

  function describeArc(startDeg: number, endDeg: number) {
    const s = polarToCartesian(startDeg);
    const e = polarToCartesian(endDeg);
    const largeArc = endDeg - startDeg > 180 ? 1 : 0;
    return `M ${s.x} ${s.y} A ${r} ${r} 0 ${largeArc} 1 ${e.x} ${e.y}`;
  }

  const arcStart = startAngle;
  const arcEnd = arcStart + totalArcDeg;
  const fillEnd = arcStart + value * totalArcDeg;

  // Color interpolation: red → yellow → green
  function sentimentColor(v: number): string {
    if (v < 0.4) return "#f14c4c";
    if (v < 0.6) return "#cca700";
    return "#89d185";
  }

  const color = sentimentColor(value);
  const pct = Math.round(value * 100);

  // Needle
  const needleAngle = arcStart + value * totalArcDeg;
  const needleTip = polarToCartesian(needleAngle);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "2px",
      }}
    >
      <svg width={size} height={size * 0.7} viewBox={`0 0 ${size} ${size * 0.7}`}>
        {/* Track */}
        <path
          d={describeArc(arcStart, arcEnd)}
          fill="none"
          stroke="var(--border-color)"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />
        {/* Fill */}
        <path
          d={describeArc(arcStart, fillEnd)}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 0.5s ease, stroke 0.5s ease" }}
        />
        {/* Needle dot */}
        <circle
          cx={needleTip.x}
          cy={needleTip.y}
          r={4}
          fill={color}
          style={{ transition: "all 0.5s ease" }}
        />
        {/* Center pct */}
        <text
          x={cx}
          y={cy + 2}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize="11"
          fontWeight="700"
          fill={color}
          style={{ transition: "fill 0.5s ease" }}
        >
          {pct}
        </text>
      </svg>
      <span
        style={{
          fontSize: "9px",
          fontFamily: "var(--font-mono)",
          color: "var(--foreground-muted)",
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          marginTop: "-4px",
        }}
      >
        {label}
      </span>
    </div>
  );
}
