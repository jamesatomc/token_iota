import React from "react";

type Point = { ts: number; price: number };

type Props = {
  data: Point[];
  width?: number;
  height?: number;
  stroke?: string;
  fill?: string;
};

// A tiny, dependency-free SVG sparkline. Expects numeric prices.
export default function PriceChart({ data, width = 300, height = 60, stroke = "#2563eb", fill = "rgba(37,99,235,0.08)" }: Props) {

  // Use responsive SVG that fills its container. We'll measure container width when mounted.
  const gradId = `spark_grad_${React.useId()}`;
  const [hoverIndex, setHoverIndex] = React.useState<number | null>(null);
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const [containerWidth, setContainerWidth] = React.useState<number | null>(null);

  // Resize observer to update width for responsive rendering
  React.useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    // If ResizeObserver is available, use it with proper typings.
    if (typeof ResizeObserver !== "undefined") {
      const ro = new ResizeObserver((entries: ResizeObserverEntry[]) => {
        for (const entry of entries) {
          const rect = entry.contentRect;
          const w = rect?.width ?? el.clientWidth;
          setContainerWidth(Math.max(20, Math.floor(w)));
        }
      });
      ro.observe(el);
      // initial
      setContainerWidth(Math.max(20, el.clientWidth || width));
      return () => ro.disconnect();
    }

    // Fallback for environments without ResizeObserver
    const onResize = () => setContainerWidth(Math.max(20, el.clientWidth || width));
    window.addEventListener("resize", onResize);
    onResize();
    return () => window.removeEventListener("resize", onResize);
  }, [width]);

  if (!data || data.length === 0) {
    return (
      <div ref={containerRef} style={{ width: '100%', height, display: "flex", alignItems: "center", justifyContent: "center", color: "#6b7280", fontSize: 12 }}>
        No data
      </div>
    );
  }

  const prices = data.map((d) => d.price);
  let min = Math.min(...prices);
  let max = Math.max(...prices);
  // If all values equal, add a small delta so the sparkline is visible vertically
  if (min === max) {
    if (min === 0) {
      min = -1;
      max = 1;
    } else {
      const delta = Math.abs(min) * 0.005 || 1;
      min = min - delta;
      max = max + delta;
    }
  }
  const range = max - min || 1;

  // Compute suitable fraction digits dynamically based on data range
  const computeFractionDigits = (r: number, maxDigits = 6) => {
    if (!isFinite(r) || r <= 0) return 2;
    // If range >= 1, show 2 decimal places by default
    if (r >= 1) return 2;
    // For ranges < 1, increase digits so small differences are visible
    // e.g. range = 0.1 -> ceil(-log10(0.1)) = 1 -> use 1 + 1 = 2
    // range = 0.001 -> ceil(-log10(0.001)) = 3 -> use 3 + 1 = 4
    const digits = Math.min(maxDigits, Math.max(2, Math.ceil(-Math.log10(r)) + 1));
    return digits;
  };

  const priceFractionDigits = computeFractionDigits(range, 6);

  const formatPrice = (v: number) => {
    try {
      return v.toLocaleString(undefined, { minimumFractionDigits: priceFractionDigits, maximumFractionDigits: 6 });
    } catch {
      return String(v);
    }
  };

  // Map points to svg coords
  // Marker radius and horizontal padding
  const markerR = 3.5;
  const pad = Math.max(8, Math.ceil(markerR + 4));
  const w = Math.max(20, containerWidth || width);
  // core chart drawing height (controls vertical scale of plotted area)
  const chartH = Math.max(12, height);
  // add extra bottom space so labels / markers are not clipped by the SVG viewport
  const extraBottom = 20; // px
  const svgH = chartH + extraBottom;
  const innerW = w - pad * 2;
  const innerH = chartH - pad * 2;

  const step = innerW / Math.max(1, prices.length - 1);
  const numericPoints = prices.map((p, i) => {
    const x = pad + i * step;
    const y = pad + innerH - ((p - min) / range) * innerH;
    return { x, y, p, i, ts: data[i]?.ts };
  });

  const points = numericPoints.map((pt) => `${pt.x},${pt.y}`);
  const pathD = points.length > 0 ? `M ${points.join(" L ")}` : "";
  // Area path (closed)
  const areaD = points.length > 0 ? `${pathD} L ${pad + innerW},${pad + innerH} L ${pad},${pad + innerH} Z` : "";


  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const svg = e.currentTarget;
    const rect = svg.getBoundingClientRect();
    const x = e.clientX - rect.left - pad; // relative to inner area
    const idx = Math.round(x / (step || 1));
    const clamped = Math.max(0, Math.min(numericPoints.length - 1, idx));
    setHoverIndex(clamped);
  };

  const handleMouseLeave = () => setHoverIndex(null);

  return (
    // Make the outer container fluid so the chart fills available width responsively.
    // SVG uses a viewBox so internal coords stay consistent while the visual scales.
    <div ref={containerRef} style={{ position: "relative", width: '100%', height: svgH, overflow: 'visible' }}>
      <svg
        width="100%"
        height={svgH}
        viewBox={`0 0 ${w} ${svgH}`}
        preserveAspectRatio="none"
        aria-hidden
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
        <defs>
          <linearGradient id={gradId} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={stroke} stopOpacity="0.12" />
            <stop offset="100%" stopColor={stroke} stopOpacity="0" />
          </linearGradient>
        </defs>
        {/* grid lines (3 horizontal rows) */}
        {Array.from({ length: 3 }).map((_, i) => {
          const y = pad + (innerH * i) / 2;
          return <line key={`g-${i}`} x1={pad} x2={pad + innerW} y1={y} y2={y} stroke="#e6eef8" strokeWidth={0.5} strokeOpacity={0.6} />;
        })}

        {/* area */}
        {areaD && <path d={areaD} fill={fill || `url(#${gradId})`} />}
        {/* line */}
        {pathD && <path d={pathD} fill="none" stroke={stroke} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />}

        {/* y-axis labels (max at top, min at bottom) */}
        <text x={6} y={pad + 10} fontSize={10} fill="#6b7280">{formatPrice(max)}</text>
        <text x={6} y={pad + innerH} fontSize={10} fill="#6b7280">{formatPrice(min)}</text>

        {/* current price horizontal line */}
        {numericPoints.length > 0 && (
          <>
            <line x1={pad} x2={pad + innerW} y1={numericPoints[numericPoints.length - 1].y} y2={numericPoints[numericPoints.length - 1].y} stroke={stroke} strokeWidth={1} strokeDasharray="4 4" strokeOpacity={0.9} />
            {/* price label on right */}
            <rect x={pad + innerW - 72} y={numericPoints[numericPoints.length - 1].y - 12} width={72} height={20} rx={6} fill={stroke} opacity={0.95} />
            <text x={pad + innerW - 36} y={numericPoints[numericPoints.length - 1].y + 4} fontSize={11} fill="#ffffff" textAnchor="middle">{formatPrice(numericPoints[numericPoints.length - 1].p)}</text>
          </>
        )}

        {/* Hover marker */}
        {hoverIndex !== null && numericPoints[hoverIndex] && (
          <g>
            <circle cx={numericPoints[hoverIndex].x} cy={numericPoints[hoverIndex].y} r={markerR} fill={stroke} stroke="#fff" strokeWidth={1} />
          </g>
        )}

        {/* x-axis ticks: start, mid, end */}
        {numericPoints.length > 0 && (() => {
          const first = numericPoints[0];
          const last = numericPoints[numericPoints.length - 1];
          const mid = numericPoints[Math.floor(numericPoints.length / 2)];
          const fmt = (ts?: number) => ts ? new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
          return (
            <>
              <text x={first.x} y={pad + innerH + 14} fontSize={10} fill="#6b7280" textAnchor="start">{fmt(first.ts)}</text>
              <text x={mid.x} y={pad + innerH + 14} fontSize={10} fill="#6b7280" textAnchor="middle">{fmt(mid.ts)}</text>
              <text x={last.x} y={pad + innerH + 14} fontSize={10} fill="#6b7280" textAnchor="end">{fmt(last.ts)}</text>
            </>
          );
        })()}
      </svg>

      {/* Tooltip */}
      {hoverIndex !== null && numericPoints[hoverIndex] && (
        (() => {
          const pt = numericPoints[hoverIndex];
          const left = Math.max(8, Math.min(w - 120, pt.x + 4));
          // ensure tooltip stays within the visible svg area including extraBottom
          const top = Math.max(4, Math.min(svgH - 8 - 40, pt.y - 30));
          return (
            <div style={{ position: "absolute", left, top, pointerEvents: "none", background: "rgba(17,24,39,0.95)", color: "#fff", padding: '6px 8px', borderRadius: 6, fontSize: 12, minWidth: 96 }}>
              <div style={{ fontSize: 11, opacity: 0.9 }}>{new Date(pt.ts).toLocaleString()}</div>
              <div style={{ fontWeight: 600 }}>{formatPrice(pt.p)}</div>
            </div>
          );
        })()
      )}
    </div>
  );
}
