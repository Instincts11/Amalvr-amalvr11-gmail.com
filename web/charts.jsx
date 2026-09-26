import { useState } from 'react';
import { kicker } from './ui.js';

const TONES = ['#39FF14', '#8dff63', '#1f8a32', '#c6ffb0', '#d7e6d4', '#7f8c82'];

function Card({ title, hint, children }) {
  return (
    <figure className="border border-[#1a2420] p-4">
      <figcaption>
        <p className={kicker}>{title}</p>
        <p className="mt-2 text-sm leading-6 text-[#7f8c82]">{hint}</p>
      </figcaption>
      <div className="mt-4">{children}</div>
    </figure>
  );
}

function Empty() {
  return <p className="py-8 text-sm text-[#7f8c82]">Nothing recorded for this chart.</p>;
}

function Tip({ label, detail, x, y }) {
  return (
    <div
      className="pointer-events-none absolute z-10 border border-[#1a2420] bg-[#0A0D0B] px-3 py-2"
      style={{
        left: `${x}%`,
        top: `${y}%`,
        transform: x > 62 ? 'translate(calc(-100% - 10px), -120%)' : 'translate(10px, -120%)',
      }}
    >
      <p className="max-w-[14rem] truncate text-sm text-[#f4fff2]">{label}</p>
      <p className="text-sm text-[#39FF14]">{detail}</p>
    </div>
  );
}

export function Donut({ title, hint, rows }) {
  const [hover, setHover] = useState(null);
  const total = rows.reduce((sum, row) => sum + row.value, 0);
  let cursor = 0;
  const slices = rows.map((row, index) => {
    const start = total > 0 ? (cursor / total) * 360 : 0;
    cursor += row.value;
    const end = total > 0 ? (cursor / total) * 360 : 0;
    return { ...row, start, end, color: row.deny ? '#ff8b96' : TONES[index % TONES.length] };
  });
  const active = hover == null ? null : slices[hover];

  return (
    <Card title={title} hint={hint}>
      {total === 0 ? <Empty /> : (
        <div className="flex flex-wrap items-center gap-6">
          <svg viewBox="0 0 160 160" className="h-56 w-56 shrink-0" role="img" aria-label={title}>
            {slices.map((slice, index) => {
              const span = slice.end - slice.start;
              if (span >= 359.9) {
                return <circle key={slice.label} cx="80" cy="80" r="62" fill={slice.color} opacity={hover == null || hover === index ? 1 : 0.35} onPointerEnter={() => setHover(index)} onPointerLeave={() => setHover(null)} />;
              }
              if (span <= 0) return null;
              const start = ((slice.start - 90) * Math.PI) / 180;
              const end = ((slice.end - 90) * Math.PI) / 180;
              const large = span > 180 ? 1 : 0;
              const x1 = 80 + 62 * Math.cos(start);
              const y1 = 80 + 62 * Math.sin(start);
              const x2 = 80 + 62 * Math.cos(end);
              const y2 = 80 + 62 * Math.sin(end);
              return (
                <path
                  key={slice.label}
                  d={`M 80 80 L ${x1} ${y1} A 62 62 0 ${large} 1 ${x2} ${y2} Z`}
                  fill={slice.color}
                  opacity={hover == null || hover === index ? 1 : 0.35}
                  onPointerEnter={() => setHover(index)}
                  onPointerLeave={() => setHover(null)}
                />
              );
            })}
            <circle cx="80" cy="80" r="36" fill="#050505" />
            <text x="80" y="84" textAnchor="middle" fill="#f4fff2" fontSize="18">{active ? active.value : total}</text>
          </svg>
          <ul className="min-w-0 flex-1 space-y-2">
            {slices.map((slice, index) => (
              <li key={slice.label}>
                <button
                  type="button"
                  className="flex w-full items-baseline justify-between gap-4 text-left text-sm"
                  onPointerEnter={() => setHover(index)}
                  onPointerLeave={() => setHover(null)}
                >
                  <span className={hover === index ? 'text-[#f4fff2]' : 'text-[#7f8c82]'}>{slice.label}</span>
                  <span style={{ color: slice.color }}>{slice.value}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}

export function SplitBar({ title, hint, parts }) {
  const [hover, setHover] = useState(null);
  const total = parts.reduce((sum, part) => sum + part.value, 0);
  return (
    <Card title={title} hint={hint}>
      {total === 0 ? <Empty /> : (
        <>
          <div className="flex h-16 w-full overflow-hidden" role="img" aria-label={title}>
            {parts.map((part, index) => (
              <button
                key={part.label}
                type="button"
                className="h-full"
                style={{ width: `${(part.value / total) * 100}%`, background: part.color, opacity: hover == null || hover === index ? 1 : 0.4 }}
                onPointerEnter={() => setHover(index)}
                onPointerLeave={() => setHover(null)}
                aria-label={`${part.label} ${part.value}`}
              />
            ))}
          </div>
          <div className="mt-3 flex justify-between gap-4 text-sm">
            {parts.map((part) => (
              <span key={part.label} style={{ color: part.color }}>{part.value} {part.label}</span>
            ))}
          </div>
          {hover != null && <p className="mt-2 text-sm text-[#f4fff2]">{parts[hover].label} · {parts[hover].value} of {total}</p>}
        </>
      )}
    </Card>
  );
}

export function Columns({ title, hint, rows }) {
  const [hover, setHover] = useState(null);
  const max = Math.max(...rows.map((row) => row.value), 1);
  return (
    <Card title={title} hint={hint}>
      {rows.length === 0 ? <Empty /> : (
        <div className="relative flex h-64 items-end gap-2" role="img" aria-label={title} onPointerLeave={() => setHover(null)}>
          {rows.map((row, index) => (
            <button
              key={row.label}
              type="button"
              className="flex h-full min-w-0 flex-1 flex-col justify-end"
              onPointerEnter={() => setHover(index)}
            >
              <span className="mb-1 truncate text-center text-[11px] text-[#7f8c82]">{row.value}</span>
              <span className="block w-full" style={{ height: `${Math.max(8, (row.value / max) * 78)}%`, background: row.tone || '#39FF14', opacity: hover == null || hover === index ? 1 : 0.35 }} />
              <span className="mt-2 truncate text-center text-[11px] text-[#7f8c82]">{row.label}</span>
            </button>
          ))}
          {hover != null && <Tip label={rows[hover].label} detail={String(rows[hover].value)} x={((hover + 0.5) / rows.length) * 100} y={18} />}
        </div>
      )}
    </Card>
  );
}

export function HBars({ title, hint, rows }) {
  const [hover, setHover] = useState(null);
  const max = Math.max(...rows.map((row) => row.value), 1);
  return (
    <Card title={title} hint={hint}>
      {rows.length === 0 ? <Empty /> : (
        <ul className="space-y-3" onPointerLeave={() => setHover(null)}>
          {rows.map((row, index) => (
            <li key={row.label}>
              <button type="button" className="w-full text-left" onPointerEnter={() => setHover(index)}>
                <span className="flex items-baseline justify-between gap-4 text-sm">
                  <span className={hover === index ? 'text-[#f4fff2]' : 'text-[#7f8c82]'}>{row.label}</span>
                  <span className="text-[#39FF14]">{row.value}</span>
                </span>
                <span className="mt-1 block h-3 bg-[#1a2420]">
                  <span className="block h-3" style={{ width: `${(row.value / max) * 100}%`, background: row.tone || '#39FF14', opacity: hover == null || hover === index ? 1 : 0.4 }} />
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export function Stacked({ title, hint, rows }) {
  const [hover, setHover] = useState(null);
  const max = Math.max(...rows.map((row) => row.allow + row.deny), 1);
  return (
    <Card title={title} hint={hint}>
      {rows.length === 0 ? <Empty /> : (
        <ul className="space-y-3" onPointerLeave={() => setHover(null)}>
          {rows.map((row, index) => (
            <li key={row.label}>
              <button type="button" className="w-full text-left" onPointerEnter={() => setHover(index)}>
                <span className="flex items-baseline justify-between gap-4 text-sm">
                  <span className={hover === index ? 'truncate text-[#f4fff2]' : 'truncate text-[#7f8c82]'}>{row.label}</span>
                  <span><span className="text-[#39FF14]">{row.allow} allow</span> <span className="text-[#ff8b96]">{row.deny} deny</span></span>
                </span>
                <span className="mt-1 flex h-3 bg-[#1a2420]">
                  <span className="h-3 bg-[#39FF14]" style={{ width: `${(row.allow / max) * 100}%`, opacity: hover == null || hover === index ? 1 : 0.4 }} />
                  <span className="h-3 bg-[#ff8b96]" style={{ width: `${(row.deny / max) * 100}%`, opacity: hover == null || hover === index ? 1 : 0.4 }} />
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export function AreaSeries({ title, hint, points }) {
  const [hover, setHover] = useState(null);
  const values = points.map((point) => point.value);
  const min = values.length ? Math.min(...values, 0) : 0;
  const max = values.length ? Math.max(...values, 1) : 1;
  const span = max - min || 1;
  const width = 1000;
  const plotRight = 960;
  const top = 16;
  const bottom = 220;
  const xAt = (index) => (points.length <= 1 ? plotRight / 2 : (index / (points.length - 1)) * plotRight);
  const yAt = (value) => bottom - ((value - min) / span) * (bottom - top);
  const line = points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${xAt(index).toFixed(1)} ${yAt(point.value).toFixed(1)}`).join(' ');
  const area = points.length ? `${line} L ${xAt(points.length - 1).toFixed(1)} ${bottom} L ${xAt(0).toFixed(1)} ${bottom} Z` : '';
  const focus = hover == null ? null : points[hover];

  function track(event) {
    if (!points.length) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * width;
    let nearest = 0;
    let best = Infinity;
    for (let index = 0; index < points.length; index += 1) {
      const distance = Math.abs(xAt(index) - x);
      if (distance < best) {
        best = distance;
        nearest = index;
      }
    }
    setHover((current) => (current === nearest ? current : nearest));
  }

  return (
    <Card title={title} hint={hint}>
      {points.length === 0 ? <Empty /> : (
        <div className="relative h-72 w-full cursor-crosshair" onPointerMove={track} onPointerLeave={() => setHover(null)}>
          <svg className="absolute inset-0 h-full w-full" viewBox={`0 0 ${width} 260`} preserveAspectRatio="none" role="img" aria-label={title}>
            <defs>
              <linearGradient id="people-area" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#39FF14" stopOpacity="0.35" />
                <stop offset="100%" stopColor="#39FF14" stopOpacity="0" />
              </linearGradient>
            </defs>
            {[0, 0.5, 1].map((step) => {
              const y = top + (bottom - top) * step;
              return <line key={step} x1="0" x2={plotRight} y1={y} y2={y} stroke="#1a2420" vectorEffect="non-scaling-stroke" />;
            })}
            {area && <path d={area} fill="url(#people-area)" />}
            {line && <path d={line} fill="none" stroke="#39FF14" strokeWidth="2" vectorEffect="non-scaling-stroke" />}
          </svg>
          {focus && (
            <>
              <span className="pointer-events-none absolute top-0 bottom-0 w-px bg-[#e8f2e6]/40" style={{ left: `${(xAt(hover) / width) * 100}%` }} />
              <span className="pointer-events-none absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#39FF14]" style={{ left: `${(xAt(hover) / width) * 100}%`, top: `${(yAt(focus.value) / 260) * 100}%` }} />
              <Tip label={focus.label} detail={`${focus.deny ? 'deny' : 'allow'} · ${focus.value >= 0 ? '+' : ''}${focus.value}`} x={(xAt(hover) / width) * 100} y={(yAt(focus.value) / 260) * 100} />
            </>
          )}
        </div>
      )}
    </Card>
  );
}
