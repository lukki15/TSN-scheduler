import { useState } from 'react';
import type { NodeData, NodeKey } from '../../model/types';
import { useEditorStore } from '../../store/editorStore';
import { NETWORK_NODE_CONFIG } from '../node-types';
import { InspectorShell } from './InspectorShell';
import { AttributeRow, DeleteButton, ErrorText, NumberField, TitleInput } from './fields';

const REASON_TEXT = {
    empty: 'id must not be empty',
    duplicate: 'id already in use',
} as const;

export function NodeForm({ nodeKey, data }: { nodeKey: NodeKey; data: NodeData }) {
    const renameNode = useEditorStore((s) => s.renameNode);
    const updateNodeData = useEditorStore((s) => s.updateNodeData);
    const removeNode = useEditorStore((s) => s.removeNode);

    // Local mirror of the id so the user can keep typing through an invalid draft.
    // The form is keyed by node, so a remount resets it when another node is selected.
    const [draftId, setDraftId] = useState(data.id);
    const [error, setError] = useState<keyof typeof REASON_TEXT | null>(null);

    const handleIdChange = (value: string) => {
        setDraftId(value);
        const result = renameNode(nodeKey, value);
        setError(result.ok ? null : result.reason);
    };

    const Icon = NETWORK_NODE_CONFIG.icon;

    return (
        <InspectorShell
            icon={<Icon size={18} />}
            title={<TitleInput value={draftId} onChange={handleIdChange} placeholder="Node id" invalid={error !== null} />}
            subtitle={error ? <ErrorText>{REASON_TEXT[error]}</ErrorText> : NETWORK_NODE_CONFIG.label}
        >
            <AttributeRow label="Precision">
                <NumberField
                    value={data.precision}
                    onCommit={(precision) => updateNodeData(nodeKey, { precision })}
                    widthClass="w-20"
                />
            </AttributeRow>

            <DeleteButton label="Delete Node" onClick={() => removeNode(nodeKey)} />
        </InspectorShell>
    );
}
