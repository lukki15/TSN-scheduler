import type { TimelineRowGroup } from '../../model/timeline';

interface IdleLinksRowProps {
    idleGroups: TimelineRowGroup[];
    shown: boolean;
    onToggle: () => void;
}

/** Compact footer naming the links without scheduled traffic, with a toggle to show them as rows. */
export function IdleLinksRow({ idleGroups, shown, onToggle }: IdleLinksRowProps) {
    if (idleGroups.length === 0) return null;
    const list = idleGroups.map((g) => g.label).join(' · ');
    const count = idleGroups.length;

    return (
        <div className="shrink-0 flex items-center gap-3 px-4 h-7 border-t border-slate-100 bg-slate-50/50">
            <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 whitespace-nowrap">
                {count} idle {count === 1 ? 'link' : 'links'}
            </span>
            <span className="flex-1 min-w-0 truncate font-mono text-[10px] text-slate-400" title={list}>
                {list}
            </span>
            <button
                onClick={onToggle}
                className="px-2 py-0.5 rounded-full text-[10px] font-bold text-slate-500 border border-slate-200 bg-white hover:bg-slate-100 transition-colors"
            >
                {shown ? 'hide' : 'show'}
            </button>
        </div>
    );
}
