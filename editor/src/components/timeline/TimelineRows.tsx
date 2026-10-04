import type { Ref } from 'react';
import type { ScrubHandlers } from './useScrub';
import { hueToCss } from '../../model/colors';
import { MAX_INSTANCES_PER_HOP, periodMarkers, type TimelineBar, type TimelineRowGroup } from '../../model/timeline';
import type { LinkId, Stream, StreamId } from '../../model/types';
import { BAR_PAD, GROUP_HEIGHT, LABEL_WIDTH, MIN_BAR_PX, SUB_ROW_HEIGHT, groupTop, rowsHeight, xOf } from './geometry';

export interface BarHover {
    bar: TimelineBar;
    /** Screen rect of the hovered bar. */
    anchor: DOMRect;
}

export interface TimelineRowsProps {
    groups: TimelineRowGroup[];
    windowNs: number;
    width: number;
    /** Ref callback for the bars area; measured by the dock and shared with the playhead. */
    attachArea: Ref<HTMLDivElement>;
    hueOf: ReadonlyMap<StreamId, number>;
    /** Emphasised stream; its period boundaries are marked when it is routed. */
    selectedStream: Stream | undefined;
    onBarClick: (bar: TimelineBar) => void;
    /** Hovered bar, or null when the pointer leaves. */
    onBarHover: (hover: BarHover | null) => void;
    /** Hovered link row group, or null. */
    onGroupHover: (linkId: LinkId | null) => void;
    /** Pointer handlers so a press on empty row space seeks. */
    scrub: ScrubHandlers;
}

/** Label column on the left, SVG bars on the right; one group of two directional sub-rows per link. */
export function TimelineRows({
    groups,
    windowNs,
    width,
    attachArea,
    hueOf,
    selectedStream,
    onBarClick,
    onBarHover,
    onGroupHover,
    scrub,
}: TimelineRowsProps) {
    const height = rowsHeight(groups.length);
    const selectedId = selectedStream?.id ?? null;
    const marker = selectedStream?.status === 'ok' ? { hue: selectedStream.hue, ns: periodMarkers(selectedStream.period_ns, windowNs) } : null;

    return (
        <div
            className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden"
            onScroll={() => onBarHover(null)}
            onMouseLeave={() => onBarHover(null)}
        >
            <div className="flex" style={{ height }}>
                {/* Label column */}
                <div className="shrink-0 border-r border-slate-100" style={{ width: LABEL_WIDTH }}>
                    {groups.map((group) => (
                        <div
                            key={group.linkId}
                            className="px-3 flex flex-col justify-center hover:bg-slate-50 transition-colors"
                            style={{ height: GROUP_HEIGHT }}
                            title={group.label}
                            onMouseEnter={() => onGroupHover(group.linkId)}
                            onMouseLeave={() => onGroupHover(null)}
                        >
                            <div className="text-[10px] font-bold text-slate-600 font-mono truncate leading-4">{group.label}</div>
                            <div className="flex flex-col text-[9px] text-slate-400 font-mono leading-[12px]">
                                <span className="truncate">{group.rows[0].label}</span>
                                <span className="truncate">{group.rows[1].label}</span>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Bars */}
                <div ref={attachArea} {...scrub} className="relative flex-1 min-w-0 touch-none">
                    {width > 0 && (
                        <svg width={width} height={height} className="block">
                            {/* row separators and hover hit areas */}
                            {groups.map((group, i) => (
                                <g key={group.linkId}>
                                    <rect
                                        x={0}
                                        y={i * GROUP_HEIGHT}
                                        width={width}
                                        height={GROUP_HEIGHT}
                                        className="fill-transparent hover:fill-slate-50"
                                        onMouseEnter={() => onGroupHover(group.linkId)}
                                        onMouseLeave={() => onGroupHover(null)}
                                    />
                                    <line x1={0} x2={width} y1={(i + 1) * GROUP_HEIGHT - 0.5} y2={(i + 1) * GROUP_HEIGHT - 0.5} className="stroke-slate-100" />
                                </g>
                            ))}

                            {/* period markers of the selected stream */}
                            {marker?.ns.map((ns) => {
                                const x = Math.round(xOf(ns, windowNs, width)) + 0.5;
                                return <line key={ns} x1={x} x2={x} y1={0} y2={height} stroke={hueToCss(marker.hue, 0.35)} strokeDasharray="2 3" />;
                            })}

                            {groups.map((group, gi) =>
                                group.rows.map((sub, si) => {
                                    const rowTop = groupTop(gi) + si * SUB_ROW_HEIGHT;
                                    const laneHeight = (SUB_ROW_HEIGHT - 2 * BAR_PAD) / sub.laneCount;
                                    const bars = sub.bars.map((bar) => {
                                        const x0 = Math.max(0, xOf(bar.startNs, windowNs, width));
                                        const xTx = Math.min(width, Math.max(0, xOf(bar.txEndNs, windowNs, width)));
                                        const x1 = Math.min(width, xOf(bar.rxEndNs, windowNs, width));
                                        if (x1 <= x0) return null;
                                        const y = rowTop + BAR_PAD + bar.lane * laneHeight;
                                        const hue = hueOf.get(bar.streamId) ?? 0;
                                        const selected = bar.streamId === selectedId;
                                        const dimmed = selectedId !== null && !selected;
                                        return (
                                            <g
                                                key={bar.key}
                                                opacity={dimmed ? 0.35 : 1}
                                                className="cursor-pointer"
                                                onClick={() => onBarClick(bar)}
                                                onPointerDown={(e) => e.stopPropagation()}
                                                onMouseEnter={(e) => {
                                                    onGroupHover(group.linkId);
                                                    onBarHover({ bar, anchor: e.currentTarget.getBoundingClientRect() });
                                                }}
                                                onMouseLeave={() => onBarHover(null)}
                                            >
                                                {/* transmission */}
                                                <rect
                                                    x={x0}
                                                    y={y}
                                                    width={Math.max(MIN_BAR_PX, xTx - x0)}
                                                    height={laneHeight}
                                                    rx={2}
                                                    fill={hueToCss(hue)}
                                                    stroke={selected ? 'white' : undefined}
                                                    strokeWidth={selected ? 1 : undefined}
                                                />
                                                {/* propagation tail */}
                                                {x1 > xTx && (
                                                    <rect x={xTx} y={y} width={x1 - xTx} height={laneHeight} rx={2} fill={hueToCss(hue, 0.4)} />
                                                )}
                                            </g>
                                        );
                                    });
                                    if (!sub.truncated) return bars;
                                    // The instance cap stopped the bars early; shade the rest of the
                                    // row so the gap is not mistaken for idle time.
                                    const lastDrawnNs = Math.max(...sub.bars.map((b) => b.rxEndNs));
                                    const from = Math.min(width, Math.max(0, xOf(lastDrawnNs, windowNs, width)));
                                    return [
                                        ...bars,
                                        <g key={`${group.linkId}:${si}:truncated`}>
                                            <rect
                                                x={from}
                                                y={rowTop + BAR_PAD}
                                                width={Math.max(0, width - from)}
                                                height={SUB_ROW_HEIGHT - 2 * BAR_PAD}
                                                rx={2}
                                                fill="rgb(245 158 11 / 0.12)"
                                                stroke="rgb(245 158 11 / 0.5)"
                                                strokeDasharray="3 3"
                                            />
                                            <title>{`Only the first ${MAX_INSTANCES_PER_HOP} transmissions per hop are drawn; the stream keeps repeating here.`}</title>
                                        </g>,
                                    ];
                                }),
                            )}
                        </svg>
                    )}
                </div>
            </div>
        </div>
    );
}
