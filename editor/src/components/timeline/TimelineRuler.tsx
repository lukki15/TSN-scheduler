import { niceTicks } from '../../model/timeline';
import { RULER_HEIGHT, xOf } from './geometry';

interface TimelineRulerProps {
    windowNs: number;
    width: number;
}

/** Tick marks and µs labels across the time window, in pixel coordinates. */
export function TimelineRuler({ windowNs, width }: TimelineRulerProps) {
    const ticks = width > 0 ? niceTicks(windowNs, Math.max(2, Math.round(width / 110))) : [];

    return (
        <svg width={width} height={RULER_HEIGHT} className="block select-none">
            <line x1={0} x2={width} y1={RULER_HEIGHT - 0.5} y2={RULER_HEIGHT - 0.5} className="stroke-slate-200" />
            {ticks.map((tick) => {
                const x = Math.round(xOf(tick.ns, windowNs, width)) + 0.5;
                const isLast = tick.ns === windowNs;
                return (
                    <g key={tick.ns}>
                        <line x1={x} x2={x} y1={tick.major ? RULER_HEIGHT - 9 : RULER_HEIGHT - 4} y2={RULER_HEIGHT} className={tick.major ? 'stroke-slate-400' : 'stroke-slate-200'} />
                        {tick.major && (
                            <text
                                x={isLast ? x - 3 : x + 3}
                                y={11}
                                textAnchor={isLast ? 'end' : 'start'}
                                className="fill-slate-400 font-mono text-[9px] tabular-nums"
                            >
                                {tick.label}
                            </text>
                        )}
                    </g>
                );
            })}
        </svg>
    );
}
