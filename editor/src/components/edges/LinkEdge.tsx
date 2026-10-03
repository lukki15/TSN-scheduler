import { useState } from 'react';
import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from '@xyflow/react';
import { UNITS } from '../../model/defaults';
import type { EditorLink } from '../../store/editorStore';

/**
 * Undirected link. Ported from ArchAlive's LatencyEdge (plain bezier BaseEdge)
 * with the RpsEdge label-pill pattern showing length and bandwidth while the
 * link is hovered or selected.
 */
export function LinkEdge({
    id,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    markerEnd,
    style,
    data,
    selected,
}: EdgeProps<EditorLink>) {
    const [hovered, setHovered] = useState(false);
    const [edgePath, labelX, labelY] = getBezierPath({
        sourceX, sourceY, sourcePosition,
        targetX, targetY, targetPosition,
    });

    const { length, bandwidth } = data;
    const showLabel = hovered || selected;

    return (
        <g onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}>
            <BaseEdge id={id} path={edgePath} markerEnd={markerEnd} style={style} />
            {showLabel && (
                <EdgeLabelRenderer>
                    <div
                        style={{
                            position: 'absolute',
                            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
                            pointerEvents: 'all',
                            fontSize: 10,
                            fontWeight: 700,
                            color: '#4f46e5',
                            background: selected ? '#eef2ff' : 'white',
                            border: '1px solid #4f46e5',
                            borderRadius: 4,
                            padding: '1px 5px',
                            lineHeight: 1.2,
                            whiteSpace: 'nowrap',
                        }}
                        className="nodrag nopan font-mono"
                    >
                        {length} {UNITS.length} · {bandwidth} {UNITS.bandwidth}
                    </div>
                </EdgeLabelRenderer>
            )}
        </g>
    );
}
