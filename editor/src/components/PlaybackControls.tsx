import { useCallback, useRef } from 'react';
import { Pause, Play, Square } from 'lucide-react';
import { SPEEDS, formatSimTime, periodIndex } from '../model/playback';
import { selectedStream } from '../model/streams';
import { useEditorStore } from '../store/editorStore';
import { usePlaybackStore } from '../store/playbackStore';
import { usePlaybackFrame } from './usePlaybackFrame';

const PILL = 'flex items-center gap-2 px-3 py-1.5 rounded-full shadow-sm border transition-all duration-300';
const PILL_IDLE = 'bg-white/95 backdrop-blur-sm text-slate-600 border-slate-200 hover:border-slate-300 hover:bg-slate-50 hover:shadow-md hover:text-blue-600';
const PILL_RESUME = 'bg-white text-green-600 border-green-200 ring-4 ring-green-500/10 shadow-[0_0_20px_rgba(34,197,94,0.15)] animate-pulse';

/**
 * Transport controls in the style of ArchAlive's Pause button, sized for the
 * timeline dock toolbar: Play/Pause, Stop, speed steps and a simulation clock.
 * The clock is written straight into the DOM from the playback frame loop so
 * nothing re-renders per frame.
 */
export function PlaybackControls() {
    const status = usePlaybackStore((s) => s.status);
    const speed = usePlaybackStore((s) => s.speed);
    const toggle = usePlaybackStore((s) => s.toggle);
    const stop = usePlaybackStore((s) => s.stop);
    const setSpeed = usePlaybackStore((s) => s.setSpeed);
    // Period of the selected stream for the clock's period index; 0 when none is selected
    const selectedPeriodNs = useEditorStore((s) => selectedStream(s.selection, s.streams)?.period_ns ?? 0);

    const clockRef = useRef<HTMLSpanElement>(null);
    const lastText = useRef('');

    usePlaybackFrame(
        useCallback(
            (timeNs: number) => {
                const el = clockRef.current;
                if (!el) return;
                const base = formatSimTime(timeNs);
                const text = selectedPeriodNs > 0 ? `${base} · #${periodIndex(timeNs, selectedPeriodNs)}` : base;
                if (text === lastText.current) return;
                lastText.current = text;
                el.textContent = text;
            },
            [selectedPeriodNs],
        ),
    );

    const isPlaying = status === 'playing';
    const isPaused = status === 'paused';

    return (
        <div className="flex items-center gap-2">
            <button
                onClick={toggle}
                className={`${PILL} ${isPaused ? PILL_RESUME : PILL_IDLE}`}
                title={isPlaying ? 'Pause playback' : isPaused ? 'Resume playback' : 'Play schedule'}
            >
                {isPlaying ? <Pause size={14} /> : <Play size={14} className="fill-current" />}
                <span className="text-xs font-bold">{isPlaying ? 'Pause' : isPaused ? 'Resume' : 'Play'}</span>
            </button>

            <button
                onClick={stop}
                disabled={status === 'stopped'}
                className={`${PILL} ${PILL_IDLE} !px-2.5 disabled:opacity-50 disabled:cursor-default disabled:hover:text-slate-600 disabled:hover:border-slate-200 disabled:hover:bg-white/95 disabled:hover:shadow-sm`}
                title="Stop and reset to t = 0"
            >
                <Square size={14} className="fill-current" />
            </button>

            <div className="flex items-center p-0.5 rounded-full shadow-sm border border-slate-200 bg-white/95 backdrop-blur-sm">
                {SPEEDS.map((s) => (
                    <button
                        key={s}
                        onClick={() => setSpeed(s)}
                        aria-pressed={s === speed}
                        className={`px-2.5 py-1 rounded-full text-[10px] font-bold transition-colors ${s === speed ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-100'}`}
                        title={`Playback speed ${s}x`}
                    >
                        {s}x
                    </button>
                ))}
            </div>

            <div className="px-3 py-1.5 rounded-full shadow-sm border border-slate-200 bg-white/95 backdrop-blur-sm font-mono text-xs font-bold text-slate-700 tabular-nums min-w-[10rem] text-right">
                <span ref={clockRef} title="Simulation time · period index of the selected stream">{formatSimTime(0)}</span>
            </div>
        </div>
    );
}
