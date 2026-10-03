import { useRef } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { usePersistence } from '../store/usePersistence';
import { EditorCanvas } from './EditorCanvas';
import { PacketLayerPixi } from './PacketLayerPixi';
import { PlaybackControls } from './PlaybackControls';
import { Sidebar } from './Sidebar';
import { StreamsPanel } from './StreamsPanel';
import { Inspector } from './inspector/Inspector';

export function Editor() {
    usePersistence();
    const canvasWrapperRef = useRef<HTMLDivElement>(null);

    return (
        <main className="flex h-screen w-screen bg-transparent">
            <h1 className="sr-only">TSN Network Editor</h1>
            <ReactFlowProvider>
                <Sidebar />
                <div className="flex-1 h-full relative" ref={canvasWrapperRef}>
                    {/* Inspector */}
                    <Inspector />

                    <EditorCanvas />

                    {/* Packet animation layer (GPU) */}
                    <PacketLayerPixi resizeTo={canvasWrapperRef} />

                    {/* Streams */}
                    <StreamsPanel />

                    {/* Playback controls — bottom left */}
                    <PlaybackControls />
                </div>
            </ReactFlowProvider>
        </main>
    );
}
