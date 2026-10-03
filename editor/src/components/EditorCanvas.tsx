import {
    ReactFlow,
    Background,
    SelectionMode,
    useNodesState,
    useEdgesState,
    type Edge,
    type Node,
} from '@xyflow/react';

export function EditorCanvas() {
    const [nodes, , onNodesChange] = useNodesState<Node>([]);
    const [edges, , onEdgesChange] = useEdgesState<Edge>([]);

    return (
        <ReactFlow
            data-main-canvas
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            defaultViewport={{ x: 0, y: 0, zoom: 0.8 }}
            defaultEdgeOptions={{ interactionWidth: 20 }}
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
    );
}
