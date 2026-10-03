import { useState, type ReactNode } from 'react';
import { Trash2 } from 'lucide-react';

/** Label on the left, boxed control on the right (ArchAlive's "Buffer Capacity" row). */
export function AttributeRow({ label, children }: { label: string; children: ReactNode }) {
    return (
        <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider whitespace-nowrap">{label}</span>
            {children}
        </div>
    );
}

interface NumberFieldProps {
    value: number;
    onCommit: (value: number) => void;
    unit?: string;
    min?: number;
    /** Reject `min` itself, for quantities that must be strictly positive (a 0 Mbit/s link has no meaning). */
    exclusiveMin?: boolean;
    step?: number | 'any';
    integer?: boolean;
    widthClass?: string;
    accentClass?: string;
}

/**
 * Number input that keeps a string draft so partial input ("1.", "") does not
 * write NaN into the model. Only finite values within bounds are committed.
 */
export function NumberField({
    value,
    onCommit,
    unit,
    min = 0,
    exclusiveMin = false,
    step = 'any',
    integer = false,
    widthClass = 'w-20',
    accentClass = 'text-blue-600',
}: NumberFieldProps) {
    const [draft, setDraft] = useState(String(value));
    const [syncedValue, setSyncedValue] = useState(value);

    // Adjust the draft when the model value changes from outside this field
    // (React's "adjusting state during render" pattern, no effect needed).
    if (value !== syncedValue) {
        setSyncedValue(value);
        if (Number(draft) !== value) setDraft(String(value));
    }

    const handleChange = (raw: string) => {
        setDraft(raw);
        if (raw.trim() === '') return;
        const parsed = Number(raw);
        if (!Number.isFinite(parsed) || parsed < min || (exclusiveMin && parsed <= min)) return;
        if (integer && !Number.isInteger(parsed)) return;
        if (parsed !== value) onCommit(parsed);
    };

    return (
        <div className="flex items-center bg-slate-100/50 border border-slate-200 rounded-md px-2 py-0.5 focus-within:ring-2 focus-within:ring-blue-400 focus-within:border-transparent transition-all">
            <input
                type="number"
                inputMode={integer ? 'numeric' : 'decimal'}
                min={min}
                step={step}
                value={draft}
                onChange={(e) => handleChange(e.target.value)}
                className={`${widthClass} text-xs font-bold font-mono ${accentClass} bg-transparent outline-none text-right`}
            />
            {unit && <span className="text-[10px] font-bold text-slate-400 ml-1">{unit}</span>}
        </div>
    );
}

interface SelectFieldProps {
    value: string;
    onChange: (value: string) => void;
    options: { value: string; label: string }[];
    placeholder?: string;
}

export function SelectField({ value, onChange, options, placeholder = '— choose —' }: SelectFieldProps) {
    return (
        <select
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="bg-slate-50 border border-slate-200 text-xs text-slate-700 font-mono rounded-md px-2 py-1 focus:outline-none focus:border-blue-400 transition-all max-w-[160px]"
        >
            <option value="">{placeholder}</option>
            {options.map((o) => (
                <option key={o.value} value={o.value}>
                    {o.label}
                </option>
            ))}
        </select>
    );
}

interface DangerButtonProps {
    onClick: () => void;
    children: ReactNode;
    /** Sizing classes; defaults to a full-width inspector button. */
    className?: string;
    title?: string;
    /** Solid, pulsing look while waiting for a confirming second click. */
    armed?: boolean;
}

/** Destructive action button (Clear Canvas, Delete …). */
export function DangerButton({ onClick, children, className = 'w-full p-2 px-3', title, armed = false }: DangerButtonProps) {
    const look = armed
        ? 'bg-red-600 text-white border-red-600 ring-4 ring-red-500/20 animate-pulse'
        : 'bg-red-50 text-red-600 border-red-100 hover:bg-red-100';
    return (
        <button
            onClick={onClick}
            title={title}
            className={`${className} ${look} border rounded-xl transition-colors text-sm font-bold flex items-center justify-center gap-2`}
        >
            {children}
        </button>
    );
}

/** "Delete X" button at the bottom of an inspector form. */
export function DeleteButton({ label, onClick }: { label: string; onClick: () => void }) {
    return (
        <DangerButton onClick={onClick}>
            <Trash2 size={16} />
            <span>{label}</span>
        </DangerButton>
    );
}

/** Editable inspector title: a borderless input in the header's bold text style. */
export function TitleInput({ value, onChange, placeholder, invalid = false }: { value: string; onChange: (value: string) => void; placeholder: string; invalid?: boolean }) {
    return (
        <input
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className={`w-full bg-transparent border-none p-0 text-sm font-bold text-slate-800 focus:ring-0 placeholder-slate-400 outline-none ${invalid ? 'text-rose-600' : ''}`}
            placeholder={placeholder}
            spellCheck={false}
        />
    );
}

/** Small uppercase error line, used in inspector subtitles. */
export function ErrorText({ children }: { children: ReactNode }) {
    return <span className="text-[9px] font-bold uppercase tracking-wider text-rose-500">{children}</span>;
}
