import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, TriangleAlert } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { DEFAULT_STREAM } from '../../model/defaults';
import { displayId, nodeDisplayIds } from '../../model/graph';
import { hueByStream, selectedStream as selectedStreamOf } from '../../model/streams';
import { HYPERPERIOD_CAP_FACTOR, buildTimelineRows, formatUs, hyperperiod, type TimelineBar } from '../../model/timeline';
import { useEditorStore } from '../../store/editorStore';
import { clampDockHeight, useUiStore } from '../../store/uiStore';
import { usePointerDrag } from '../usePointerDrag';
import { PlaybackControls } from '../PlaybackControls';
import { BarTooltip } from './BarTooltip';
import { IdleLinksRow } from './IdleLinksRow';
import { TimelineRows, type BarHover } from './TimelineRows';
import { TimelineRuler } from './TimelineRuler';
import { Playhead } from './Playhead';
import { useScrub } from './useScrub';
import { LABEL_WIDTH } from './geometry';
import { useElementWidth } from './useMeasuredWidth';

/**
 * Bottom dock under the canvas, in the ArchAlive glass style: a toolbar row
 * with the transport controls and the time window, above the timeline body.
 * Collapsible to the toolbar; height resizable by dragging the top edge (the
 * DOM is mutated during the drag and the height committed on release).
 */
export function TimelineDock() {
    const schedule = useEditorStore((s) => s.schedule);
    const edges = useEditorStore((s) => s.edges);
    // Only the display ids: a shallow-compared record so node drags do not rebuild the rows
    const nodeIds = useEditorStore(useShallow((s) => nodeDisplayIds(s.nodes)));
    const streams = useEditorStore((s) => s.streams);
    const selection = useEditorStore((s) => s.selection);
    const select = useEditorStore((s) => s.select);
    const collapsed = useUiStore((s) => s.dockCollapsed);
    const height = useUiStore((s) => s.dockHeight);
    const showIdleLinks = useUiStore((s) => s.showIdleLinks);
    const toggleCollapsed = useUiStore((s) => s.toggleDockCollapsed);
    const toggleShowIdleLinks = useUiStore((s) => s.toggleShowIdleLinks);
    const setDockHeight = useUiStore((s) => s.setDockHeight);
    const setHoveredLink = useUiStore((s) => s.setHoveredLink);
    const [hoverBar, setHoverBar] = useState<BarHover | null>(null);

    // Never leave a canvas edge highlighted when the dock goes away
    useEffect(() => () => setHoveredLink(null), [setHoveredLink]);

    const sectionRef = useRef<HTMLElement>(null);
    // The bars area is tracked as state (not a ref) because its width is needed during render.
    const [areaElement, attachArea] = useState<HTMLDivElement | null>(null);
    const dragStart = useRef<{ y: number; height: number } | null>(null);

    const window_ = useMemo(() => hyperperiod(schedule), [schedule]);
    const windowNs = window_.windowNs || DEFAULT_STREAM.period_ns;
    const groups = useMemo(() => buildTimelineRows(schedule, edges, nodeIds, windowNs), [schedule, edges, nodeIds, windowNs]);
    const idleGroups = groups.filter((g) => g.idle);
    const visibleGroups = showIdleLinks ? groups : groups.filter((g) => !g.idle);
    const hueOf = useMemo(() => hueByStream(streams), [streams]);
    const selectedStream = selectedStreamOf(selection, streams);
    const width = useElementWidth(areaElement);
    const scrub = useScrub(areaElement, windowNs);

    const resize = usePointerDrag<null>({
        cursor: 'ns-resize',
        onStart: (e) => {
            const section = sectionRef.current;
            if (!section) return false;
            dragStart.current = { y: e.clientY, height: section.getBoundingClientRect().height };
        },
        onMove: (e) => {
            const s = dragStart.current;
            const section = sectionRef.current;
            if (!s || !section) return;
            section.style.height = `${clampDockHeight(s.height + (s.y - e.clientY), window.innerHeight)}px`;
        },
        onEnd: () => {
            dragStart.current = null;
            if (sectionRef.current) setDockHeight(sectionRef.current.getBoundingClientRect().height);
        },
    });

    // The tooltip follows a bar element; once that bar is gone (schedule change,
    // stream removed, row hidden) no mouseleave fires, so check it still exists.
    const hoverVisible =
        hoverBar !== null && visibleGroups.some((g) => g.rows.some((r) => r.bars.some((b) => b.key === hoverBar.bar.key)));
    const hoverStream = hoverBar && hoverVisible ? streams.find((s) => s.id === hoverBar.bar.streamId) : undefined;

    return (
        <section
            ref={sectionRef}
            data-timeline
            className="relative shrink-0 flex flex-col z-[150] bg-white/95 backdrop-blur-sm border-t border-slate-200 shadow-[0_-8px_30px_rgba(0,0,0,0.06)]"
            style={collapsed ? undefined : { height }}
        >
            {/* Resize handle along the top edge */}
            {!collapsed && (
                <div
                    {...resize(null)}
                    className="absolute -top-1 left-0 right-0 h-2 cursor-ns-resize group z-10 touch-none"
                >
                    <div className="absolute left-0 right-0 top-1 h-0.5 bg-transparent group-hover:bg-blue-400 transition-colors" />
                </div>
            )}

            {/* Toolbar */}
            <div className="flex items-center gap-3 px-4 h-11 shrink-0 border-b border-slate-100">
                <button
                    onClick={toggleCollapsed}
                    className="p-1 hover:bg-slate-100 rounded-full text-slate-400 transition-colors"
                    title={collapsed ? 'Expand timeline' : 'Collapse timeline'}
                >
                    {collapsed ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </button>
                <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Timeline</span>

                <PlaybackControls />

                <div className="ml-auto flex items-center gap-2">
                    <span className="font-mono text-[10px] text-slate-500 tabular-nums" title="Time window shown by the timeline (hyperperiod of all stream periods)">
                        window {formatUs(windowNs, 0)} µs
                    </span>
                    {window_.capped && (
                        <span
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 text-amber-600 border border-amber-200 text-[9px] font-bold uppercase tracking-wider"
                            title={`The hyperperiod exceeds ${HYPERPERIOD_CAP_FACTOR}× the longest period; showing the longest period instead. Streams with other periods do not repeat exactly within this window.`}
                        >
                            <TriangleAlert size={10} /> capped
                        </span>
                    )}
                </div>
            </div>

            {hoverBar && hoverStream && (
                <BarTooltip
                    bar={hoverBar.bar}
                    anchor={hoverBar.anchor}
                    streamName={hoverStream.name}
                    hue={hoverStream.hue}
                    hopLabel={`${displayId(nodeIds, hoverBar.bar.hop.from)} → ${displayId(nodeIds, hoverBar.bar.hop.to)}`}
                />
            )}

            {/* Body */}
            {!collapsed && (
                <div className="relative flex-1 min-h-0 flex flex-col">
                    {edges.length === 0 ? (
                        <div className="flex-1 flex items-center justify-center text-xs text-slate-400">
                            Add links and streams to see the schedule
                        </div>
                    ) : (
                        <>
                            {/* Ruler + rows share the playhead overlay; the idle footer sits below it */}
                            <div className="relative flex-1 min-h-0 flex flex-col">
                                {/* Ruler, offset by the label column */}
                                <div className="shrink-0 flex border-b border-slate-100">
                                    <div className="shrink-0 border-r border-slate-100" style={{ width: LABEL_WIDTH }} />
                                    <div {...scrub} className="flex-1 min-w-0 cursor-pointer touch-none">
                                        <TimelineRuler windowNs={windowNs} width={width} />
                                    </div>
                                </div>

                                {visibleGroups.length === 0 ? (
                                    <div className="flex-1 flex">
                                        <div className="shrink-0 border-r border-slate-100" style={{ width: LABEL_WIDTH }} />
                                        <div ref={attachArea} {...scrub} className="flex-1 flex items-center justify-center text-xs text-slate-400 touch-none">
                                            No scheduled traffic. Add a stream with a start and end node.
                                        </div>
                                    </div>
                                ) : (
                                    <TimelineRows
                                        groups={visibleGroups}
                                        windowNs={windowNs}
                                        width={width}
                                        attachArea={attachArea}
                                        hueOf={hueOf}
                                        selectedStream={selectedStream}
                                        onBarClick={(bar: TimelineBar) => select({ kind: 'stream', id: bar.streamId })}
                                        onBarHover={setHoverBar}
                                        onGroupHover={setHoveredLink}
                                        scrub={scrub}
                                    />
                                )}

                                <Playhead windowNs={windowNs} width={width} scrub={scrub} />
                            </div>

                            <IdleLinksRow idleGroups={idleGroups} shown={showIdleLinks} onToggle={toggleShowIdleLinks} />
                        </>
                    )}
                </div>
            )}
        </section>
    );
}
