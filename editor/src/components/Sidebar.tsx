import { ChevronLeft, ChevronRight, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState, type DragEvent } from 'react';
import { useEditorStore } from '../store/editorStore';
import { DangerButton } from './inspector/fields';
import { DRAG_MIME, NODE_TYPES_CONFIG } from './node-types';

export function Sidebar() {
    const clearCanvas = useEditorStore((s) => s.clearCanvas);
    const [collapsed, setCollapsed] = useState(false);
    // Clear Canvas is destructive and autosaved; like ArchAlive's save-slot delete it
    // needs a second click within a few seconds.
    const [confirming, setConfirming] = useState(false);
    const confirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    useEffect(() => () => { if (confirmTimer.current) clearTimeout(confirmTimer.current); }, []);

    const onClearClick = () => {
        if (confirmTimer.current) clearTimeout(confirmTimer.current);
        if (confirming) {
            setConfirming(false);
            clearCanvas();
            return;
        }
        setConfirming(true);
        confirmTimer.current = setTimeout(() => setConfirming(false), 3000);
    };

    const onDragStart = (event: DragEvent, nodeType: string) => {
        event.dataTransfer.setData(DRAG_MIME, nodeType);
        event.dataTransfer.effectAllowed = 'move';
    };

    return (
        <aside data-sidebar className={`absolute top-4 left-4 flex flex-col gap-2 transition-all duration-300 z-[100] ${collapsed ? 'w-auto' : 'w-56'}`}>
            <div className="bg-white rounded-2xl shadow-lg border border-slate-200 overflow-hidden flex flex-col p-2">
                <div className="flex items-center justify-between p-2 mb-2">
                    {!collapsed && <h2 className="text-sm font-bold text-slate-500 uppercase tracking-wider">Components</h2>}
                    <button
                        onClick={() => setCollapsed(!collapsed)}
                        className="p-1 hover:bg-slate-100 rounded-full text-slate-400 transition-colors"
                    >
                        {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
                    </button>
                </div>

                <div className="flex flex-col gap-1">
                    {NODE_TYPES_CONFIG.map((item) => (
                        <div
                            key={item.type}
                            className={`
                                flex items-center gap-3 p-2 rounded-xl cursor-grab hover:bg-slate-50 transition-all border border-transparent hover:border-slate-100 hover:shadow-sm
                                ${collapsed ? 'justify-center w-10 h-10' : ''}
                            `}
                            draggable
                            onDragStart={(event) => onDragStart(event, item.type)}
                            title={collapsed ? item.label : undefined}
                        >
                            <item.icon size={20} className={item.color} />
                            {!collapsed && <span className="text-sm font-medium text-slate-700">{item.label}</span>}
                        </div>
                    ))}
                </div>

                <div className="pt-4 mt-2 border-t border-slate-100">
                    <DangerButton
                        onClick={onClearClick}
                        armed={confirming}
                        className={collapsed ? 'w-10 h-10 p-0' : 'w-full p-2 px-3'}
                        title={confirming ? 'Click again to clear everything' : collapsed ? 'Clear Canvas' : undefined}
                    >
                        <Trash2 size={18} />
                        {!collapsed && <span>{confirming ? 'Click again to confirm' : 'Clear Canvas'}</span>}
                    </DangerButton>
                </div>
            </div>
        </aside>
    );
}
