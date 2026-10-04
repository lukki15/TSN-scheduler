import { formatUs, type TimelineBar } from '../../model/timeline';
import { HueDot } from '../inspector/fields';

interface BarTooltipProps {
    bar: TimelineBar;
    /** Screen rect of the hovered bar. */
    anchor: DOMRect;
    streamName: string;
    hue: number;
    /** `from → to` of the bar's hop as TSN ids. */
    hopLabel: string;
}

const WIDTH = 220;

/** Glass card above a hovered bar with the stream, hop and the hop's times within its period. */
export function BarTooltip({ bar, anchor, streamName, hue, hopLabel }: BarTooltipProps) {
    const left = Math.min(Math.max(8, anchor.left + anchor.width / 2 - WIDTH / 2), window.innerWidth - WIDTH - 8);
    const top = anchor.top - 8;
    const rows: [string, string][] = [
        ['tx start', formatUs(bar.hop.tx_start_ns)],
        ['tx end', formatUs(bar.hop.tx_end_ns)],
        ['rx end', formatUs(bar.hop.rx_end_ns)],
    ];

    return (
        <div
            className="fixed z-[300] pointer-events-none bg-white/95 backdrop-blur-md rounded-xl shadow-[0_10px_30px_rgba(0,0,0,0.12)] border border-white/50 ring-1 ring-slate-200/50 p-3"
            style={{ left, top, width: WIDTH, transform: 'translateY(-100%)' }}
        >
            <div className="flex items-center gap-2 mb-1">
                <HueDot hue={hue} />
                <span className="text-xs font-bold text-slate-700 truncate">{streamName}</span>
            </div>
            <div className="font-mono text-[10px] text-slate-500 truncate mb-2">
                {hopLabel} · hop {bar.hopIndex + 1} · #{bar.instance}
            </div>
            <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
                {rows.map(([label, value]) => (
                    <div key={label} className="contents">
                        <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">{label}</span>
                        <span className="font-mono text-[10px] tabular-nums text-slate-700 text-right">{value} µs</span>
                    </div>
                ))}
            </div>
        </div>
    );
}
