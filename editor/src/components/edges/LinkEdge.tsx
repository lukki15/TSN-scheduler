import { useState } from 'react';
import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from '@xyflow/react';
import { useShallow } from 'zustand/react/shallow';
import { hueToCss } from '../../model/colors';
import { UNITS } from '../../model/defaults';
import { useEditorStore, type EditorLink } from '../../store/editorStore';
import { useUiStore } from '../../store/uiStore';

/**
 * Undirected link. Ported from ArchAlive's LatencyEdge (plain bezier BaseEdge)
 * with the RpsEdge label-pill pattern showing length and bandwidth while the
 * link is hovered or selected. When the selected stream travels this link the
 * path turns indigo with a dash animated in the direction of travel.
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
    // Null unless the selected stream's route uses this link; the highlight always carries a hue when it has links
    const route = useEditorStore(
        useShallow((s) => {
            const direction = s.routeHighlight.links[id];
            return direction ? { direction, hue: s.routeHighlight.hue ?? 0 } : null;
        }),
    );
    // Hovered in the timeline dock: thicken on the canvas and show the label
    const hoveredInTimeline = useUiStore((s) => s.hoveredLinkId === id);
    const [edgePath, labelX, labelY] = getBezierPath({
        sourceX, sourceY, sourcePosition,
        targetX, targetY, targetPosition,
    });

    const { length, bandwidth } = data;
    const showLabel = hovered || selected || hoveredInTimeline;

    return (
        <g onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}>
            <BaseEdge
                id={id}
                path={edgePath}
                markerEnd={markerEnd}
                className={route ? 'link-edge--route' : hoveredInTimeline ? 'link-edge--hover' : undefined}
                style={route
                    ? { ...style, stroke: hueToCss(route.hue), strokeDasharray: '8 6', animationDirection: route.direction === 'reverse' ? 'reverse' : 'normal' }
                    : style}
            />
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
