import { useShallow } from 'zustand/react/shallow';
import { selectedStream } from '../../model/streams';
import { useEditorStore } from '../../store/editorStore';
import { LinkForm } from './LinkForm';
import { NodeForm } from './NodeForm';
import { StreamForm } from './StreamForm';

/** Shows the form for the current selection. Each kind remounts the shell so its size resets. */
export function Inspector() {
    const selection = useEditorStore((s) => s.selection);
    // Only key and data: the node object itself is replaced on every drag step
    const node = useEditorStore(
        useShallow((s) => {
            const n = selection?.kind === 'node' ? s.nodes.find((n) => n.id === selection.id) : undefined;
            return n ? { id: n.id, data: n.data } : undefined;
        }),
    );
    const link = useEditorStore((s) => (selection?.kind === 'link' ? s.edges.find((e) => e.id === selection.id) : undefined));
    const stream = useEditorStore((s) => selectedStream(selection, s.streams));

    if (node) return <NodeForm key={`node:${node.id}`} nodeKey={node.id} data={node.data} />;
    if (link) return <LinkForm key={`link:${link.id}`} link={link} />;
    if (stream) return <StreamForm key={`stream:${stream.id}`} stream={stream} />;
    return null;
}
