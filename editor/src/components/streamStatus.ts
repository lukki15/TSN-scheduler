import type { RouteStatus } from '../model/types';

/** User-facing text for each route status. */
export const STATUS_TEXT: Record<RouteStatus, string> = {
    ok: 'routed',
    'missing-endpoint': 'select start and end node',
    'same-endpoint': 'start and end must differ',
    unreachable: 'no path between start and end',
};
