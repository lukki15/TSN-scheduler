import { useCallback } from 'react';
import { ReactFlow, Background, SelectionMode, type Viewport } from '@xyflow/react';
import { useEditorStore } from '../store/editorStore';

const initialViewport = useEditorStore.getState().viewport;

export function EditorCanvas() {
    const nodes = useEditorStore((s) => s.nodes);
    const edges = useEditorStore((s) => s.edges);
    const onNodesChange = useEditorStore((s) => s.onNodesChange);
    const onEdgesChange = useEditorStore((s) => s.onEdgesChange);
    const setViewport = useEditorStore((s) => s.setViewport);
    const onMoveEnd = useCallback((_: unknown, viewport: Viewport) => setViewport(viewport), [setViewport]);

    return (
        <ReactFlow
            data-main-canvas
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            defaultViewport={initialViewport}
            onMoveEnd={onMoveEnd}
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
