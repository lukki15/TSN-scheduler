import { useCallback, useEffect, useRef, useState, type DragEvent } from 'react';
import {
    ReactFlow,
    Background,
    ConnectionMode,
    SelectionMode,
    useReactFlow,
    type Connection,
    type Edge,
    type IsValidConnection,
    type Viewport,
} from '@xyflow/react';
import { canConnect } from '../model/graph';
import { useEditorStore, type EditorLink, type EditorNode } from '../store/editorStore';
import { ConnectionRipple } from './ConnectionRipple';
import { LinkEdge } from './edges/LinkEdge';
import { DRAG_MIME, NETWORK_NODE_CONFIG } from './node-types';
import { NetworkNode } from './nodes/NetworkNode';

const nodeTypes = { [NETWORK_NODE_CONFIG.type]: NetworkNode };
const edgeTypes = { link: LinkEdge };

const initialViewport = useEditorStore.getState().viewport;

/** Undirected uniqueness is checked against live store state so the callback stays referentially stable. */
const isValidConnection: IsValidConnection<EditorLink> = (connection: Edge | Connection) => {
    const { nodes, edges } = useEditorStore.getState();
    return canConnect(nodes, edges, connection.source, connection.target).ok;
};

export function EditorCanvas() {
    const nodes = useEditorStore((s) => s.nodes);
    const edges = useEditorStore((s) => s.edges);
    const onNodesChange = useEditorStore((s) => s.onNodesChange);
    const onEdgesChange = useEditorStore((s) => s.onEdgesChange);
    const setViewport = useEditorStore((s) => s.setViewport);
    const addNode = useEditorStore((s) => s.addNode);
    const connect = useEditorStore((s) => s.connect);
    const select = useEditorStore((s) => s.select);

    const { screenToFlowPosition } = useReactFlow();

    const [connectionPoint, setConnectionPoint] = useState<{ x: number; y: number } | null>(null);
    const rippleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    useEffect(() => () => { if (rippleTimer.current) clearTimeout(rippleTimer.current); }, []);

    const onConnect = useCallback(
        (params: Connection) => {
            if (!connect(params)) return;

            // Find the actual handle element in the DOM to get its exact position
            const handleSelector = params.targetHandle
                ? `[data-nodeid="${params.target}"][data-handleid="${params.targetHandle}"]`
                : `[data-nodeid="${params.target}"]`;

            const handleElement = document.querySelector(handleSelector);
            if (handleElement) {
                const rect = handleElement.getBoundingClientRect();
                setConnectionPoint({
                    x: rect.left + rect.width / 2,
                    y: rect.top + rect.height / 2
                });
                if (rippleTimer.current) clearTimeout(rippleTimer.current);
                rippleTimer.current = setTimeout(() => setConnectionPoint(null), 800);
            }
        },
        [connect],
    );

    const onDragOver = useCallback((event: DragEvent) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
    }, []);

    const onDrop = useCallback(
        (event: DragEvent) => {
            event.preventDefault();

            const type = event.dataTransfer.getData(DRAG_MIME);
            if (type !== NETWORK_NODE_CONFIG.type) return;

            const position = screenToFlowPosition({
                x: event.clientX,
                y: event.clientY,
            });
            addNode(position);
        },
        [screenToFlowPosition, addNode],
    );

    const onNodeClick = useCallback((_: React.MouseEvent, node: EditorNode) => {
        select({ kind: 'node', id: node.id });
    }, [select]);

    const onEdgeClick = useCallback((_: React.MouseEvent, edge: EditorLink) => {
        select({ kind: 'link', id: edge.id });
    }, [select]);

    const onPaneClick = useCallback(() => {
        select(null);
    }, [select]);

    const onMoveEnd = useCallback((_: unknown, viewport: Viewport) => setViewport(viewport), [setViewport]);

    return (
        <>
            <ReactFlow
                data-main-canvas
                nodes={nodes}
                edges={edges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={onConnect}
                defaultViewport={initialViewport}
                onMoveEnd={onMoveEnd}
                onDrop={onDrop}
                onDragOver={onDragOver}
                onNodeClick={onNodeClick}
                onEdgeClick={onEdgeClick}
                onPaneClick={onPaneClick}

                nodeTypes={nodeTypes}
                edgeTypes={edgeTypes}
                defaultEdgeOptions={{ type: 'link', interactionWidth: 20 }}
                connectionMode={ConnectionMode.Loose}
                isValidConnection={isValidConnection}

                selectionMode={SelectionMode.Partial}
                deleteKeyCode={['Backspace', 'Delete']}
                /* Desktop controls: middle/right-click pan, left-click drag-selects.
                   Space+drag: hold Space to pan with left-click. */
                panActivationKeyCode="Space"
                panOnDrag={[1, 2]}
                selectionOnDrag
                nodeDragThreshold={1}
                zoomOnPinch
                zoomOnDoubleClick
                onlyRenderVisibleElements
                minZoom={0.05}
                maxZoom={4}
                connectionRadius={20}
                proOptions={{ hideAttribution: true }}
            >
                <Background />
            </ReactFlow>

            {/* Connection Success Ripple */}
            <ConnectionRipple point={connectionPoint} />
        </>
    );
}
