/** Green ripple shown at the handle a connection was just made on (ArchAlive's connection-success-ripple). */
export function ConnectionRipple({ point }: { point: { x: number; y: number } | null }) {
    if (!point) return null;
    return (
        <div
            className="connection-success-ripple"
            style={{
                left: point.x,
                top: point.y
            }}
        />
    );
}
