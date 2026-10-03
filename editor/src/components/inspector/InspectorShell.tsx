import { useRef, useState, type ReactNode } from 'react';
import { usePointerDrag } from '../usePointerDrag';

type ResizeType = 'horizontal' | 'vertical' | 'both';

const CURSOR: Record<ResizeType, string> = { horizontal: 'ew-resize', vertical: 'ns-resize', both: 'nwse-resize' };

interface DragStart {
    x: number;
    y: number;
    width: number;
    height: number;
}

interface InspectorShellProps {
    /** Icon tile at the top-left of the header. */
    icon: ReactNode;
    /** Header title area (an inline input or a static label). */
    title: ReactNode;
    /** Mono subtitle line under the title. */
    subtitle: ReactNode;
    children: ReactNode;
    defaultWidth?: number | string;
}

/**
 * Floating bottom-right panel ported from ArchAlive's NodeInspector (desktop
 * variant): glass card, resizable from the left edge, top edge and top-left
 * corner. The DOM is mutated directly during a drag (pointer capture on the
 * handle, no re-renders) and the final size is committed to React state on
 * release. Remount it (via `key`) to reset the size.
 */
export function InspectorShell({ icon, title, subtitle, children, defaultWidth = 280 }: InspectorShellProps) {
    const [size, setSize] = useState<{ width: number | null; height: number | null }>({ width: null, height: null });
    const panelRef = useRef<HTMLDivElement>(null);
    const start = useRef<DragStart | null>(null);

    const resize = usePointerDrag<ResizeType>({
        cursor: (type) => CURSOR[type],
        onStart: (e) => {
            const panel = panelRef.current;
            if (!panel) return false;
            const rect = panel.getBoundingClientRect();
            start.current = { x: e.clientX, y: e.clientY, width: rect.width, height: rect.height };
        },
        onMove: (e, type) => {
            const s = start.current;
            const panel = panelRef.current;
            if (!s || !panel) return;
            if (type !== 'vertical') {
                panel.style.width = `${Math.max(240, Math.min(1000, s.width + (s.x - e.clientX)))}px`;
            }
            if (type !== 'horizontal') {
                panel.style.height = `${Math.max(150, Math.min(window.innerHeight * 0.9, s.height + (s.y - e.clientY)))}px`;
            }
        },
        onEnd: (type) => {
            const panel = panelRef.current;
            start.current = null;
            if (!panel) return;
            // Commit the final size to React state so it survives re-renders
            const rect = panel.getBoundingClientRect();
            setSize({
                width: type !== 'vertical' ? rect.width : size.width,
                height: type !== 'horizontal' ? rect.height : size.height,
            });
        },
    });

    // During a drag the DOM style is mutated directly; React leaves it alone
    // because the state-derived style value below does not change until release.
    return (
        <div
            ref={panelRef}
            data-inspector
            className="
                absolute z-[200] bg-white/95 backdrop-blur-md shadow-[0_20px_50px_rgba(0,0,0,0.15)] overflow-hidden flex flex-col
                right-6 bottom-6 max-h-[min(900px,90vh)] rounded-3xl border border-white/50 ring-1 ring-slate-200/50
            "
            style={{
                width: size.width ?? defaultWidth,
                height: size.height ?? 'auto',
            }}
        >
            {/* Resize Handles */}
            {/* Left Edge */}
            <div
                {...resize('horizontal')}
                className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize group hover:bg-blue-500/10 transition-colors z-[210] touch-none"
            >
                <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-slate-200/50 group-hover:bg-blue-400 transition-colors" />
            </div>
            {/* Top Edge */}
            <div
                {...resize('vertical')}
                className="absolute top-0 left-0 right-0 h-2 cursor-ns-resize group hover:bg-blue-500/10 transition-colors z-[210] touch-none"
            >
                <div className="absolute left-0 top-0 right-0 h-0.5 bg-slate-200/50 group-hover:bg-blue-400 transition-colors" />
            </div>
            {/* Top-Left Corner */}
            <div
                {...resize('both')}
                className="absolute top-0 left-0 w-4 h-4 cursor-nwse-resize group z-[220] flex items-center justify-center touch-none"
            >
                <div className="w-1.5 h-1.5 rounded-full bg-slate-300 group-hover:bg-blue-500 transition-colors" />
            </div>

            {/* Header */}
            <div className="p-4 border-b border-slate-100 flex items-center gap-3 bg-slate-50/50">
                <div className="p-2 rounded-lg bg-indigo-100 text-indigo-600">
                    {icon}
                </div>
                <div className="flex-1 min-w-0">
                    {title}
                    <div className="text-[10px] text-slate-400 font-mono truncate">{subtitle}</div>
                </div>
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-hidden flex flex-col overflow-y-auto">
                <div className="p-4 space-y-6">
                    {children}
                </div>
            </div>
        </div>
    );
}
