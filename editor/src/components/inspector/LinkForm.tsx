import { Cable } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { UNITS } from '../../model/defaults';
import { displayId, nodeDisplayIds } from '../../model/graph';
import { useEditorStore, type EditorLink } from '../../store/editorStore';
import { InspectorShell } from './InspectorShell';
import { AttributeRow, DeleteButton, NumberField } from './fields';

export function LinkForm({ link }: { link: EditorLink }) {
    const updateLink = useEditorStore((s) => s.updateLink);
    const removeLink = useEditorStore((s) => s.removeLink);
    const nodeIds = useEditorStore(useShallow((s) => nodeDisplayIds(s.nodes)));

    const { length, bandwidth } = link.data;

    return (
        <InspectorShell
            icon={<Cable size={18} />}
            title={<div className="text-sm font-bold text-slate-800">Link</div>}
            subtitle={`${displayId(nodeIds, link.source)} ↔ ${displayId(nodeIds, link.target)}`}
        >
            <AttributeRow label="Length">
                <NumberField value={length} onCommit={(v) => updateLink(link.id, { length: v })} unit={UNITS.length} />
            </AttributeRow>
            <AttributeRow label="Bandwidth">
                <NumberField value={bandwidth} onCommit={(v) => updateLink(link.id, { bandwidth: v })} unit={UNITS.bandwidth} exclusiveMin />
            </AttributeRow>

            <DeleteButton label="Delete Link" onClick={() => removeLink(link.id)} />
        </InspectorShell>
    );
}
