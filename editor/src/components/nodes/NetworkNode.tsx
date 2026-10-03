import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { hueToCss } from '../../model/colors';
import { useEditorStore, type EditorNode } from '../../store/editorStore';
import { NETWORK_NODE_CONFIG } from '../node-types';

const HANDLE_CLASS = '!bg-slate-50 !border-2 !border-slate-400 transition-all hover:!border-indigo-500 hover:!bg-indigo-100';

/**
 * The one TSN node type. Ported from ArchAlive's LoadBalancerNode; the only
 * change is one connection handle per side so undirected links can attach
 * anywhere (React Flow runs in loose connection mode).
 */
export const NetworkNode = memo(function NetworkNode({ id, data, selected }: NodeProps<EditorNode>) {
    const Icon = NETWORK_NODE_CONFIG.icon;
    // Primitive selector: the highlighted stream's hue when this node is on its route, else null.
    // The card re-renders only when that value changes.
    const routeHue = useEditorStore((s) => (s.routeHighlight.nodes[id] ? s.routeHighlight.hue : null));
    const onRoute = routeHue !== null;

    return (
        <div className={`
            bg-gradient-to-b from-indigo-50 to-white rounded-2xl shadow-md border transition-all duration-200 hover:-translate-y-0.5 min-w-[280px] flex flex-col group
            ${selected ? 'border-indigo-500 shadow-lg z-10' : onRoute ? 'shadow-lg' : 'border-indigo-200 hover:shadow-lg hover:border-indigo-300'}
            ${selected ? 'animate-[selection-glow_2s_ease-in-out_infinite]' : ''}
        `}
            style={onRoute && !selected ? { borderColor: hueToCss(routeHue), boxShadow: `0 0 0 4px ${hueToCss(routeHue, 0.15)}, 0 4px 12px rgba(0,0,0,0.08)` } : undefined}
        >
            <Handle type="source" id="top" position={Position.Top} className={HANDLE_CLASS} style={{ top: -6, left: '50%' }} />
            <Handle type="source" id="right" position={Position.Right} className={HANDLE_CLASS} style={{ right: -6, top: '50%' }} />
            <Handle type="source" id="bottom" position={Position.Bottom} className={HANDLE_CLASS} style={{ bottom: -6, left: '50%' }} />
            <Handle type="source" id="left" position={Position.Left} className={HANDLE_CLASS} style={{ left: -6, top: '50%' }} />

            {/* Header */}
            <div className="flex items-center gap-3 p-3 border-b bg-slate-50/30 border-slate-50 rounded-t-2xl">
                <div
                    className={`p-2 rounded-xl shadow-sm border border-slate-100 transition-colors ${onRoute ? 'text-white' : 'bg-white text-indigo-600'}`}
                    style={onRoute ? { background: hueToCss(routeHue) } : undefined}
                >
                    <Icon size={18} />
                </div>
                <div className="flex flex-col">
                    <span className="font-bold text-sm leading-tight text-slate-700">{data.id}</span>
                    <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">precision {data.precision}</span>
                </div>
            </div>

            <div className="p-2" />
        </div>
    );
});
