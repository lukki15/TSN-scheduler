import { ReactFlowProvider } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { usePersistence } from '../store/usePersistence';
import { EditorCanvas } from './EditorCanvas';
import { Sidebar } from './Sidebar';
import { StreamsPanel } from './StreamsPanel';
import { Inspector } from './inspector/Inspector';

export function Editor() {
    usePersistence();

    return (
        <main className="flex h-screen w-screen bg-transparent">
            <h1 className="sr-only">TSN Network Editor</h1>
            <ReactFlowProvider>
                <Sidebar />
                <div className="flex-1 h-full relative">
                    {/* Inspector */}
                    <Inspector />

                    <EditorCanvas />

                    {/* Streams */}
                    <StreamsPanel />
                </div>
            </ReactFlowProvider>
        </main>
    );
}
