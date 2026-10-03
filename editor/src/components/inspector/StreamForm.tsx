import { useMemo } from 'react';
import { Waypoints } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { UNITS } from '../../model/defaults';
import { displayId, nodeDisplayIds } from '../../model/graph';
import type { Stream } from '../../model/types';
import { useEditorStore } from '../../store/editorStore';
import { STATUS_TEXT } from '../streamStatus';
import { InspectorShell } from './InspectorShell';
import { AttributeRow, DeleteButton, ErrorText, NumberField, SelectField, TitleInput } from './fields';

export function StreamForm({ stream }: { stream: Stream }) {
    const updateStream = useEditorStore((s) => s.updateStream);
    const removeStream = useEditorStore((s) => s.removeStream);
    const nodeIds = useEditorStore(useShallow((s) => nodeDisplayIds(s.nodes)));

    const options = useMemo(
        () =>
            Object.entries(nodeIds)
                .map(([value, label]) => ({ value, label }))
                .sort((a, b) => a.label.localeCompare(b.label)),
        [nodeIds],
    );

    const ok = stream.status === 'ok';
    const integerField = (field: 'message_size' | 'period_ns' | 'e2e_latency_ns' | 'max_jitter_ns', min: number) => (
        <NumberField
            value={stream[field]}
            onCommit={(v) => updateStream(stream.id, { [field]: v })}
            unit={UNITS[field]}
            min={min}
            step={1}
            integer
            widthClass="w-24"
            accentClass="text-indigo-600"
        />
    );

    return (
        <InspectorShell
            icon={<Waypoints size={18} />}
            title={<TitleInput value={stream.name} onChange={(name) => updateStream(stream.id, { name })} placeholder="Stream name" />}
            subtitle={ok ? stream.route.map((key) => displayId(nodeIds, key)).join(' → ') : <ErrorText>{STATUS_TEXT[stream.status]}</ErrorText>}
            defaultWidth={320}
        >
            <div className="space-y-3">
                <AttributeRow label="Start">
                    <SelectField
                        value={stream.start_node ?? ''}
                        onChange={(v) => updateStream(stream.id, { start_node: v || null })}
                        options={options}
                    />
                </AttributeRow>
                <AttributeRow label="End">
                    <SelectField
                        value={stream.end_node ?? ''}
                        onChange={(v) => updateStream(stream.id, { end_node: v || null })}
                        options={options}
                    />
                </AttributeRow>
            </div>

            <div className="space-y-3 pt-4 border-t border-slate-100">
                <AttributeRow label="Message Size">{integerField('message_size', 1)}</AttributeRow>
                <AttributeRow label="Period">{integerField('period_ns', 1)}</AttributeRow>
                <AttributeRow label="E2E Latency">{integerField('e2e_latency_ns', 0)}</AttributeRow>
                <AttributeRow label="Max Jitter">{integerField('max_jitter_ns', 0)}</AttributeRow>
            </div>

            <DeleteButton label="Delete Stream" onClick={() => removeStream(stream.id)} />
        </InspectorShell>
    );
}
