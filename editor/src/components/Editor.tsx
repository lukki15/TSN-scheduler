import { useRef } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { usePersistence } from '../store/usePersistence';
import { EditorCanvas } from './EditorCanvas';
import { PacketLayerPixi } from './PacketLayerPixi';
import { Sidebar } from './Sidebar';
import { StreamsPanel } from './StreamsPanel';
import { Inspector } from './inspector/Inspector';
import { TimelineDock } from './timeline/TimelineDock';

export function Editor() {
    usePersistence();
    const canvasWrapperRef = useRef<HTMLDivElement>(null);

    return (
        <main className="flex flex-col h-screen w-screen bg-transparent">
            <h1 className="sr-only">TSN Network Editor</h1>
            <ReactFlowProvider>
                {/* Canvas area: everything floats inside this relative wrapper */}
                <div className="flex-1 min-h-0 relative" ref={canvasWrapperRef}>
                    <Sidebar />

                    {/* Inspector */}
                    <Inspector />

                    <EditorCanvas />

                    {/* Packet animation layer (GPU) */}
                    <PacketLayerPixi resizeTo={canvasWrapperRef} />

                    {/* Streams */}
                    <StreamsPanel />
                </div>
            </ReactFlowProvider>

            {/* Timeline dock with the playback controls */}
            <TimelineDock />
        </main>
    );
}
