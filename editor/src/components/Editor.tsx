import { ReactFlowProvider } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { usePersistence } from '../store/usePersistence';
import { EditorCanvas } from './EditorCanvas';

export function Editor() {
    usePersistence();

    return (
        <main className="flex h-screen w-screen bg-transparent">
            <h1 className="sr-only">TSN Network Editor</h1>
            <ReactFlowProvider>
                <div className="flex-1 h-full relative">
                    <EditorCanvas />
                </div>
            </ReactFlowProvider>
        </main>
    );
}
