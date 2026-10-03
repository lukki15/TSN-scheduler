import { Network } from 'lucide-react';

/** The single node type offered by the palette. Class strings are literal so Tailwind can detect them. */
export const NETWORK_NODE_CONFIG = {
    type: 'network',
    label: 'Node',
    icon: Network,
    color: 'text-indigo-600',
} as const;

export const NODE_TYPES_CONFIG = [NETWORK_NODE_CONFIG];

/** MIME type used to carry the node type through HTML5 drag and drop. */
export const DRAG_MIME = 'application/reactflow';
