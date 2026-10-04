import { useMemo, useRef } from 'react';
import { ChevronDown, ChevronUp, TriangleAlert } from 'lucide-react';
import { DEFAULT_STREAM } from '../../model/defaults';
import { HYPERPERIOD_CAP_FACTOR, formatUs, hyperperiod } from '../../model/timeline';
import { useEditorStore } from '../../store/editorStore';
import { clampDockHeight, useUiStore } from '../../store/uiStore';
import { usePointerDrag } from '../usePointerDrag';
import { PlaybackControls } from '../PlaybackControls';

/**
 * Bottom dock under the canvas, in the ArchAlive glass style: a toolbar row
 * with the transport controls and the time window, above the timeline body.
 * Collapsible to the toolbar; height resizable by dragging the top edge (the
 * DOM is mutated during the drag and the height committed on release).
 */
export function TimelineDock() {
    const schedule = useEditorStore((s) => s.schedule);
    const edges = useEditorStore((s) => s.edges);
    const collapsed = useUiStore((s) => s.dockCollapsed);
    const height = useUiStore((s) => s.dockHeight);
    const toggleCollapsed = useUiStore((s) => s.toggleDockCollapsed);
    const setDockHeight = useUiStore((s) => s.setDockHeight);

    const sectionRef = useRef<HTMLElement>(null);
    const dragStart = useRef<{ y: number; height: number } | null>(null);

    const window_ = useMemo(() => hyperperiod(schedule), [schedule]);
    const windowNs = window_.windowNs || DEFAULT_STREAM.period_ns;

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

            {/* Body */}
            {!collapsed && (
                <div className="relative flex-1 min-h-0 flex flex-col">
                    {edges.length === 0 && (
                        <div className="flex-1 flex items-center justify-center text-xs text-slate-400">
                            Add links and streams to see the schedule
                        </div>
                    )}
                </div>
            )}
        </section>
    );
}
