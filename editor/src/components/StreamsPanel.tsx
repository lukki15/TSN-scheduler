import { useState } from 'react';
import { ChevronDown, ChevronUp, Plus, Trash2, Waypoints } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { displayId, nodeDisplayIds } from '../model/graph';
import { selectedStreamId } from '../model/streams';
import { useEditorStore } from '../store/editorStore';
import { STATUS_TEXT } from './streamStatus';

/**
 * Global list of streams, sitting where ArchAlive's metrics Dashboard sits and
 * reusing its card shell. Selecting a row makes the stream the inspector's
 * subject and highlights its route on the canvas.
 */
export function StreamsPanel() {
    const streams = useEditorStore((s) => s.streams);
    // Only the display ids: a shallow-compared record so node drags do not re-render the list
    const nodeIds = useEditorStore(useShallow((s) => nodeDisplayIds(s.nodes)));
    const selectedId = useEditorStore((s) => selectedStreamId(s.selection));
    const addStream = useEditorStore((s) => s.addStream);
    const removeStream = useEditorStore((s) => s.removeStream);
    const select = useEditorStore((s) => s.select);
    const [collapsed, setCollapsed] = useState(false);


    return (
        <div className={`absolute top-4 right-4 bg-white/95 backdrop-blur-sm rounded-xl shadow-lg border border-slate-100 z-[120] transition-all ${collapsed ? 'w-auto' : 'w-64'}`}>
            {/* Header - always visible */}
            <div className={`flex items-center justify-between ${collapsed ? 'p-2' : 'px-3 py-2'}`}>
                <button
                    onClick={() => setCollapsed(!collapsed)}
                    className="flex items-center gap-1.5 text-slate-500 hover:text-slate-700 transition-colors min-w-[28px] min-h-[28px]"
                >
                    <Waypoints size={12} />
                    {!collapsed && <span className="text-[10px] font-bold uppercase tracking-widest">Streams</span>}
                    {collapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} className="ml-1" />}
                </button>
                {!collapsed && (
                    <button
                        onClick={addStream}
                        className="flex items-center justify-center w-6 h-6 rounded-lg transition-colors text-indigo-500 bg-indigo-50 hover:bg-indigo-100"
                        title="Add Stream"
                    >
                        <Plus size={13} />
                    </button>
                )}
            </div>

            {/* Collapsible body */}
            {!collapsed && (
                <div className="px-3 pb-3">
                    <div className="space-y-2 max-h-[40vh] overflow-y-auto">
                        {streams.map((stream) => {
                            const isSelected = stream.id === selectedId;
                            const ok = stream.status === 'ok';
                            return (
                                <div
                                    key={stream.id}
                                    onClick={() => select({ kind: 'stream', id: stream.id })}
                                    className={`relative bg-white border rounded-xl overflow-hidden shadow-sm transition-all duration-200 cursor-pointer
                                        ${isSelected ? 'border-indigo-500 ring-4 ring-indigo-500/10' : 'border-slate-200 hover:border-indigo-300'}`}
                                >
                                    {/* Compact Accent Bar */}
                                    <div className={`absolute left-0 top-0 bottom-0 w-1 ${ok ? 'bg-indigo-500' : 'bg-rose-400'}`}></div>

                                    <div className="pl-3.5 pr-2 py-2 flex items-center gap-2">
                                        <div className="flex-1 min-w-0">
                                            <div className="text-xs font-bold text-slate-700 truncate">{stream.name}</div>
                                            <div className="text-[10px] text-slate-400 font-mono truncate">
                                                {displayId(nodeIds, stream.start_node)} → {displayId(nodeIds, stream.end_node)}
                                            </div>
                                            <div className={`text-[9px] font-bold uppercase tracking-wider ${ok ? 'text-indigo-500' : 'text-rose-500'}`}>
                                                {ok ? `${stream.route.length - 1} hop${stream.route.length === 2 ? '' : 's'}` : STATUS_TEXT[stream.status]}
                                            </div>
                                        </div>
                                        <button
                                            onClick={(e) => { e.stopPropagation(); removeStream(stream.id); }}
                                            className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all flex-shrink-0"
                                            title="Delete Stream"
                                        >
                                            <Trash2 size={13} />
                                        </button>
                                    </div>
                                </div>
                            );
                        })}

                        {/* Empty State */}
                        {streams.length === 0 && (
                            <div className="flex flex-col items-center justify-center py-6 text-center">
                                <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mb-3">
                                    <Waypoints className="text-slate-400" size={24} />
                                </div>
                                <p className="text-sm font-medium text-slate-500 mb-1">No streams</p>
                                <p className="text-xs text-slate-400">Click "+" to create your first stream</p>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
