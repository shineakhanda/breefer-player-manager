/*
 * Breefer UI kit — shared, dependency-free UI primitives for Breefer extensions.
 * Uses the panel's runtime React (window.React) and the panel theme CSS variables,
 * so it adapts to every Reviactyl theme without depending on Tailwind classes.
 */
import React from 'react';

const { useState, useEffect, useCallback, useRef } = React;

/* ------------------------------------------------------------------ styles */

const STYLE_ID = 'breefer-ui-v1';

const CSS = `
.brf{--brf-bg:rgb(var(--color-900,17 24 39));--brf-bg2:rgb(var(--color-800,31 41 55));--brf-bg3:rgb(var(--color-700,55 65 81));
--brf-bd:rgb(var(--color-800,31 41 55));--brf-bd2:rgb(var(--color-700,55 65 81));--brf-tx:rgb(var(--color-50,249 250 251));
--brf-tx2:rgb(var(--color-300,209 213 219));--brf-mut:rgb(var(--color-400,156 163 175));--brf-pri:rgb(var(--color-primary,59 130 246));
--brf-on:rgb(var(--foreground-primary,255 255 255));--brf-ok:rgb(var(--color-success,34 197 94));--brf-warn:rgb(var(--color-warning,234 179 8));
--brf-err:rgb(var(--color-danger,239 68 68));--brf-r:var(--radius,0.6rem);color:var(--brf-tx);font-size:14px;line-height:1.5;margin-top:1rem}
.brf *{box-sizing:border-box}
.brf-head{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:12px;margin-bottom:16px}
.brf-head h1{font-size:20px;font-weight:700;margin:0;display:flex;align-items:center;gap:10px}
.brf-head p{margin:2px 0 0;color:var(--brf-mut);font-size:13px}
.brf-logo{width:34px;height:34px;border-radius:calc(var(--brf-r) * .8);display:inline-flex;align-items:center;justify-content:center;
background:color-mix(in srgb,var(--brf-pri) 18%,transparent);color:var(--brf-pri);font-weight:800;font-size:15px;flex:none}
.brf-card{background:var(--brf-bg);border:1px solid var(--brf-bd);border-radius:var(--brf-r);padding:18px}
.brf-card+.brf-card{margin-top:14px}
.brf-card h2{font-size:15px;font-weight:600;margin:0 0 4px}
.brf-card .brf-sub{color:var(--brf-mut);font-size:13px;margin:0 0 14px}
.brf-grid{display:grid;gap:14px;grid-template-columns:repeat(auto-fill,minmax(var(--brf-min,260px),1fr))}
.brf-row{display:flex;flex-wrap:wrap;gap:10px;align-items:center}
.brf-row.brf-end{justify-content:flex-end}.brf-row.brf-between{justify-content:space-between}
.brf-col{display:flex;flex-direction:column;gap:12px}
.brf-grow{flex:1 1 auto;min-width:0}
.brf-btn{appearance:none;border:1px solid transparent;border-radius:calc(var(--brf-r) * .8);padding:8px 14px;font-size:13px;font-weight:600;
cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:6px;transition:filter .15s,background .15s,opacity .15s;
background:var(--brf-pri);color:var(--brf-on);white-space:nowrap;line-height:1.2}
.brf-btn:hover{filter:brightness(1.1)}.brf-btn:disabled{opacity:.5;cursor:not-allowed;filter:none}
.brf-btn.brf-sec{background:var(--brf-bg2);color:var(--brf-tx);border-color:var(--brf-bd2)}
.brf-btn.brf-ghost{background:transparent;color:var(--brf-tx2);border-color:var(--brf-bd2)}
.brf-btn.brf-danger{background:var(--brf-err);color:#fff}
.brf-btn.brf-ok{background:var(--brf-ok);color:#fff}
.brf-btn.brf-sm{padding:5px 10px;font-size:12px}
.brf-field{display:flex;flex-direction:column;gap:5px;min-width:0}
.brf-field>span{font-size:12px;font-weight:600;color:var(--brf-tx2)}
.brf-field>small{font-size:12px;color:var(--brf-mut)}
.brf-in{width:100%;background:var(--brf-bg2);border:1px solid var(--brf-bd2);color:var(--brf-tx);border-radius:calc(var(--brf-r) * .8);
padding:8px 11px;font-size:13px;outline:none;font-family:inherit}
.brf-in:focus{border-color:var(--brf-pri);box-shadow:0 0 0 3px color-mix(in srgb,var(--brf-pri) 25%,transparent)}
textarea.brf-in{min-height:90px;resize:vertical;font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
select.brf-in{cursor:pointer}
.brf-check{display:inline-flex;align-items:center;gap:8px;cursor:pointer;font-size:13px;color:var(--brf-tx2);user-select:none}
.brf-check input{accent-color:var(--brf-pri);width:16px;height:16px}
.brf-badge{display:inline-flex;align-items:center;gap:4px;font-size:11px;font-weight:600;padding:2px 8px;border-radius:999px;
background:var(--brf-bg3);color:var(--brf-tx2);white-space:nowrap}
.brf-badge.brf-pri{background:color-mix(in srgb,var(--brf-pri) 20%,transparent);color:var(--brf-pri)}
.brf-badge.brf-ok{background:color-mix(in srgb,var(--brf-ok) 20%,transparent);color:var(--brf-ok)}
.brf-badge.brf-warn{background:color-mix(in srgb,var(--brf-warn) 20%,transparent);color:var(--brf-warn)}
.brf-badge.brf-err{background:color-mix(in srgb,var(--brf-err) 20%,transparent);color:var(--brf-err)}
.brf-alert{border-radius:calc(var(--brf-r) * .8);padding:10px 14px;font-size:13px;border:1px solid;margin-bottom:14px}
.brf-alert.brf-info{border-color:color-mix(in srgb,var(--brf-pri) 40%,transparent);background:color-mix(in srgb,var(--brf-pri) 10%,transparent)}
.brf-alert.brf-ok{border-color:color-mix(in srgb,var(--brf-ok) 40%,transparent);background:color-mix(in srgb,var(--brf-ok) 10%,transparent)}
.brf-alert.brf-warn{border-color:color-mix(in srgb,var(--brf-warn) 40%,transparent);background:color-mix(in srgb,var(--brf-warn) 10%,transparent)}
.brf-alert.brf-err{border-color:color-mix(in srgb,var(--brf-err) 40%,transparent);background:color-mix(in srgb,var(--brf-err) 10%,transparent)}
.brf-tabs{display:flex;gap:4px;border-bottom:1px solid var(--brf-bd);margin-bottom:16px;overflow-x:auto}
.brf-tab{background:none;border:none;color:var(--brf-mut);padding:9px 14px;font-size:13px;font-weight:600;cursor:pointer;border-bottom:2px solid transparent;white-space:nowrap}
.brf-tab:hover{color:var(--brf-tx)}.brf-tab.brf-on{color:var(--brf-pri);border-bottom-color:var(--brf-pri)}
.brf-list{display:flex;flex-direction:column;gap:8px}
.brf-item{display:flex;align-items:center;gap:12px;background:var(--brf-bg);border:1px solid var(--brf-bd);border-radius:var(--brf-r);padding:12px 14px}
.brf-item:hover{border-color:var(--brf-bd2)}
.brf-item.brf-click{cursor:pointer}
.brf-thumb{width:44px;height:44px;border-radius:calc(var(--brf-r) * .7);object-fit:cover;background:var(--brf-bg2);flex:none}
.brf-title{font-weight:600;font-size:14px;margin:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.brf-muted{color:var(--brf-mut);font-size:12px}
.brf-clamp{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.brf-mono{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px}
.brf-empty{text-align:center;padding:40px 16px;color:var(--brf-mut)}
.brf-empty b{display:block;color:var(--brf-tx2);font-size:15px;margin-bottom:4px}
.brf-spin{width:18px;height:18px;border:2px solid var(--brf-bd2);border-top-color:var(--brf-pri);border-radius:50%;animation:brfspin .7s linear infinite;display:inline-block}
.brf-spin.brf-lg{width:32px;height:32px;border-width:3px}
.brf-center{display:flex;align-items:center;justify-content:center;padding:40px}
@keyframes brfspin{to{transform:rotate(360deg)}}
.brf-modal-bg{position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:9998;display:flex;align-items:flex-start;justify-content:center;padding:6vh 16px;overflow:auto}
.brf-modal{background:var(--brf-bg);border:1px solid var(--brf-bd2);border-radius:var(--brf-r);width:100%;max-width:var(--brf-mw,560px);padding:20px;color:var(--brf-tx);box-shadow:0 20px 60px rgba(0,0,0,.5)}
.brf-modal h3{margin:0 0 12px;font-size:17px;font-weight:700}
.brf-toasts{position:fixed;right:16px;bottom:16px;z-index:9999;display:flex;flex-direction:column;gap:8px;max-width:min(380px,calc(100vw - 32px))}
.brf-toast{background:var(--brf-bg2);border:1px solid var(--brf-bd2);border-left:4px solid var(--brf-pri);color:var(--brf-tx);padding:10px 14px;border-radius:calc(var(--brf-r) * .8);font-size:13px;box-shadow:0 10px 30px rgba(0,0,0,.35)}
.brf-toast.brf-ok{border-left-color:var(--brf-ok)}.brf-toast.brf-err{border-left-color:var(--brf-err)}
.brf-table{width:100%;border-collapse:collapse;font-size:13px}
.brf-table th{text-align:left;color:var(--brf-mut);font-weight:600;font-size:12px;padding:8px 10px;border-bottom:1px solid var(--brf-bd)}
.brf-table td{padding:9px 10px;border-bottom:1px solid var(--brf-bd);vertical-align:middle}
.brf-scroll{overflow-x:auto}
.brf-stat{background:var(--brf-bg2);border-radius:calc(var(--brf-r) * .8);padding:12px 14px}
.brf-stat b{display:block;font-size:20px;font-weight:700}
.brf-stat span{font-size:12px;color:var(--brf-mut)}
.brf-bar{height:6px;border-radius:999px;background:var(--brf-bg3);overflow:hidden}
.brf-bar>i{display:block;height:100%;background:var(--brf-pri)}
.brf-pager{display:flex;align-items:center;justify-content:center;gap:8px;margin-top:14px}
.brf-drop{border:2px dashed var(--brf-bd2);border-radius:var(--brf-r);padding:28px;text-align:center;cursor:pointer;color:var(--brf-mut)}
.brf-drop.brf-on{border-color:var(--brf-pri);background:color-mix(in srgb,var(--brf-pri) 8%,transparent)}
.brf a{color:var(--brf-pri)}
@media (max-width:640px){.brf-item{flex-wrap:wrap}.brf-head h1{font-size:18px}}
`;

export function useBreeferStyles(): void {
    if (typeof document === 'undefined') return;
    if (!document.getElementById(STYLE_ID)) {
        const el = document.createElement('style');
        el.id = STYLE_ID;
        el.textContent = CSS;
        document.head.appendChild(el);
    }
}

/* -------------------------------------------------------------------- http */

function readCookie(name: string): string | null {
    const match = document.cookie.split('; ').find((row) => row.startsWith(name + '='));
    return match ? decodeURIComponent(match.split('=').slice(1).join('=')) : null;
}

export class ApiError extends Error {
    status: number;
    constructor(message: string, status: number) {
        super(message);
        this.status = status;
    }
}

function errorMessage(data: any, status: number): string {
    if (data && typeof data === 'object') {
        if (Array.isArray(data.errors) && data.errors[0]?.detail) return data.errors[0].detail;
        if (typeof data.error === 'string') return data.error;
        if (typeof data.message === 'string' && data.message) return data.message;
        if (data.errors && typeof data.errors === 'object') {
            const first = Object.values(data.errors)[0];
            if (Array.isArray(first) && first[0]) return String(first[0]);
        }
    }
    return `Request failed (HTTP ${status}).`;
}

export async function api<T = any>(method: string, url: string, body?: unknown, timeoutMs = 60000): Promise<T> {
    const headers: Record<string, string> = {
        Accept: 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
    };
    const xsrf = readCookie('XSRF-TOKEN');
    if (xsrf) headers['X-XSRF-TOKEN'] = xsrf;
    const init: RequestInit = { method, headers, credentials: 'same-origin' };
    if (body !== undefined) {
        headers['Content-Type'] = 'application/json';
        init.body = JSON.stringify(body);
    }
    const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    let timer: any;
    if (ctrl && timeoutMs > 0) {
        init.signal = ctrl.signal;
        timer = setTimeout(() => ctrl.abort(), timeoutMs);
    }
    let res: Response;
    try {
        res = await fetch(url, init);
    } catch (e: any) {
        throw new ApiError(e?.name === 'AbortError' ? 'The request timed out.' : 'Network error, please try again.', 0);
    } finally {
        if (timer) clearTimeout(timer);
    }
    if (res.status === 401 && !window.location.pathname.startsWith('/auth')) {
        window.location.href = '/auth/login';
    }
    const text = await res.text();
    let data: any = null;
    if (text) {
        try {
            data = JSON.parse(text);
        } catch {
            data = text;
        }
    }
    if (!res.ok) throw new ApiError(errorMessage(data, res.status), res.status);
    return data as T;
}

/** Returns the server identifier from the current URL (/server/:id/...). */
export function getServerId(): string | null {
    const m = window.location.pathname.match(/\/server\/([^/]+)/);
    return m ? decodeURIComponent(m[1]) : null;
}

export interface ServerInfo {
    identifier: string;
    uuid: string;
    name: string;
    is_owner?: boolean;
    egg?: string;
    egg_id?: number;
    nest_id?: number;
    limits?: { memory: number; disk: number; cpu: number; swap: number };
    [key: string]: any;
}

export function useServer(): { id: string | null; server: ServerInfo | null; error: string | null } {
    const id = getServerId();
    const [server, setServer] = useState<ServerInfo | null>(null);
    const [error, setError] = useState<string | null>(null);
    useEffect(() => {
        if (!id) return;
        let alive = true;
        api('GET', `/api/client/servers/${encodeURIComponent(id)}`)
            .then((d: any) => alive && setServer(d?.attributes ?? d))
            .catch((e: any) => alive && setError(e.message));
        return () => {
            alive = false;
        };
    }, [id]);
    return { id, server, error };
}

/** Small async-state helper. */
export function useAsync<T>(fn: () => Promise<T>, deps: any[] = []) {
    const [data, setData] = useState<T | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const run = useCallback(() => {
        setLoading(true);
        setError(null);
        return fn()
            .then((d) => {
                setData(d);
                return d;
            })
            .catch((e: any) => {
                setError(e?.message ?? String(e));
                return null;
            })
            .finally(() => setLoading(false));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, deps);
    useEffect(() => {
        run();
    }, [run]);
    return { data, error, loading, reload: run, setData };
}

export function useDebounced<T>(value: T, ms = 400): T {
    const [v, setV] = useState(value);
    useEffect(() => {
        const t = setTimeout(() => setV(value), ms);
        return () => clearTimeout(t);
    }, [value, ms]);
    return v;
}

/* ------------------------------------------------------------------ toasts */

type ToastKind = 'info' | 'ok' | 'err';
interface ToastItem {
    id: number;
    kind: ToastKind;
    text: string;
}
let toastSeq = 0;
let toastItems: ToastItem[] = [];
const toastSubs = new Set<(t: ToastItem[]) => void>();
function emitToasts() {
    toastSubs.forEach((fn) => fn(toastItems));
}
export function toast(text: string, kind: ToastKind = 'info', ms = 4500): void {
    const item = { id: ++toastSeq, kind, text };
    toastItems = [...toastItems, item];
    emitToasts();
    setTimeout(() => {
        toastItems = toastItems.filter((t) => t.id !== item.id);
        emitToasts();
    }, ms);
}
export const toastOk = (t: string) => toast(t, 'ok');
export const toastErr = (t: string) => toast(t, 'err', 7000);

function Toasts() {
    const [items, setItems] = useState<ToastItem[]>(toastItems);
    useEffect(() => {
        toastSubs.add(setItems);
        return () => {
            toastSubs.delete(setItems);
        };
    }, []);
    if (!items.length) return null;
    return (
        <div className='brf brf-toasts' style={{ marginTop: 0 }}>
            {items.map((t) => (
                <div key={t.id} className={`brf-toast brf-${t.kind}`}>
                    {t.text}
                </div>
            ))}
        </div>
    );
}

/* -------------------------------------------------------------- primitives */

type Children = { children?: any };

export function Page(props: Children & { title: string; subtitle?: string; badge?: string; actions?: any; letter?: string }) {
    useBreeferStyles();
    return (
        <div className='brf'>
            <div className='brf-head'>
                <div>
                    <h1>
                        <span className='brf-logo'>{props.letter ?? 'B'}</span>
                        <span>{props.title}</span>
                        {props.badge ? <span className='brf-badge brf-pri'>{props.badge}</span> : null}
                    </h1>
                    {props.subtitle ? <p>{props.subtitle}</p> : null}
                </div>
                {props.actions ? <div className='brf-row'>{props.actions}</div> : null}
            </div>
            {props.children}
            <Toasts />
        </div>
    );
}

export function Card(props: Children & { title?: string; subtitle?: string; actions?: any; style?: any; className?: string }) {
    return (
        <div className={'brf-card ' + (props.className ?? '')} style={props.style}>
            {props.title || props.actions ? (
                <div className='brf-row brf-between' style={{ marginBottom: props.subtitle ? 0 : 12 }}>
                    {props.title ? <h2>{props.title}</h2> : <span />}
                    {props.actions ? <div className='brf-row'>{props.actions}</div> : null}
                </div>
            ) : null}
            {props.subtitle ? <p className='brf-sub'>{props.subtitle}</p> : null}
            {props.children}
        </div>
    );
}

export function Button(
    props: Children & {
        onClick?: (e: any) => void;
        variant?: 'primary' | 'sec' | 'ghost' | 'danger' | 'ok';
        size?: 'sm';
        disabled?: boolean;
        loading?: boolean;
        type?: 'button' | 'submit';
        title?: string;
        style?: any;
    },
) {
    const cls = ['brf-btn'];
    if (props.variant && props.variant !== 'primary') cls.push('brf-' + props.variant);
    if (props.size) cls.push('brf-' + props.size);
    return (
        <button
            type={props.type ?? 'button'}
            className={cls.join(' ')}
            onClick={props.onClick}
            disabled={props.disabled || props.loading}
            title={props.title}
            style={props.style}
        >
            {props.loading ? <span className='brf-spin' style={{ width: 13, height: 13 }} /> : null}
            {props.children}
        </button>
    );
}

export function Field(props: Children & { label?: string; hint?: string; style?: any }) {
    return (
        <label className='brf-field' style={props.style}>
            {props.label ? <span>{props.label}</span> : null}
            {props.children}
            {props.hint ? <small>{props.hint}</small> : null}
        </label>
    );
}

export function Input(props: any) {
    const { onValue, className, ...rest } = props;
    return (
        <input
            className={'brf-in ' + (className ?? '')}
            {...rest}
            onChange={(e: any) => {
                props.onChange?.(e);
                onValue?.(e.target.value);
            }}
        />
    );
}

export function TextArea(props: any) {
    const { onValue, className, ...rest } = props;
    return (
        <textarea
            className={'brf-in ' + (className ?? '')}
            {...rest}
            onChange={(e: any) => {
                props.onChange?.(e);
                onValue?.(e.target.value);
            }}
        />
    );
}

export function Select(props: {
    value: any;
    onValue: (v: string) => void;
    options: Array<{ value: any; label: string } | string>;
    style?: any;
    disabled?: boolean;
}) {
    return (
        <select
            className='brf-in'
            value={props.value ?? ''}
            disabled={props.disabled}
            style={props.style}
            onChange={(e: any) => props.onValue(e.target.value)}
        >
            {props.options.map((o: any) =>
                typeof o === 'string' ? (
                    <option key={o} value={o}>
                        {o}
                    </option>
                ) : (
                    <option key={String(o.value)} value={o.value}>
                        {o.label}
                    </option>
                ),
            )}
        </select>
    );
}

export function Check(props: { checked: boolean; onValue: (v: boolean) => void; label: string; disabled?: boolean }) {
    return (
        <label className='brf-check'>
            <input
                type='checkbox'
                checked={props.checked}
                disabled={props.disabled}
                onChange={(e: any) => props.onValue(e.target.checked)}
            />
            {props.label}
        </label>
    );
}

export function Badge(props: Children & { kind?: 'pri' | 'ok' | 'warn' | 'err' }) {
    return <span className={'brf-badge' + (props.kind ? ' brf-' + props.kind : '')}>{props.children}</span>;
}

export function Alert(props: Children & { kind?: 'info' | 'ok' | 'warn' | 'err'; style?: any }) {
    return (
        <div className={'brf-alert brf-' + (props.kind ?? 'info')} style={props.style}>
            {props.children}
        </div>
    );
}

export function Spinner(props: { large?: boolean }) {
    return <span className={'brf-spin' + (props.large ? ' brf-lg' : '')} />;
}

export function Loading() {
    return (
        <div className='brf-center'>
            <Spinner large />
        </div>
    );
}

export function Empty(props: { title: string; text?: string; children?: any }) {
    return (
        <div className='brf-empty'>
            <b>{props.title}</b>
            {props.text}
            {props.children ? <div style={{ marginTop: 12 }}>{props.children}</div> : null}
        </div>
    );
}

export function Tabs(props: { tabs: Array<{ key: string; label: string }>; value: string; onValue: (k: string) => void }) {
    return (
        <div className='brf-tabs'>
            {props.tabs.map((t) => (
                <button
                    key={t.key}
                    type='button'
                    className={'brf-tab' + (t.key === props.value ? ' brf-on' : '')}
                    onClick={() => props.onValue(t.key)}
                >
                    {t.label}
                </button>
            ))}
        </div>
    );
}

export function Modal(props: Children & { open: boolean; onClose: () => void; title?: string; width?: number }) {
    useEffect(() => {
        if (!props.open) return;
        const onKey = (e: KeyboardEvent) => e.key === 'Escape' && props.onClose();
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [props.open]);
    if (!props.open) return null;
    return (
        <div className='brf brf-modal-bg' style={{ marginTop: 0 }} onMouseDown={(e: any) => e.target === e.currentTarget && props.onClose()}>
            <div className='brf-modal' style={{ ['--brf-mw' as any]: (props.width ?? 560) + 'px' }}>
                {props.title ? <h3>{props.title}</h3> : null}
                {props.children}
            </div>
        </div>
    );
}

/** A button that asks for confirmation in a modal before running `onConfirm`. */
export function ConfirmButton(
    props: Children & {
        title: string;
        message: any;
        confirmText?: string;
        onConfirm: () => Promise<any> | any;
        variant?: 'primary' | 'sec' | 'ghost' | 'danger' | 'ok';
        size?: 'sm';
        disabled?: boolean;
    },
) {
    const [open, setOpen] = useState(false);
    const [busy, setBusy] = useState(false);
    return (
        <>
            <Button variant={props.variant} size={props.size} disabled={props.disabled} onClick={() => setOpen(true)}>
                {props.children}
            </Button>
            <Modal open={open} onClose={() => !busy && setOpen(false)} title={props.title} width={460}>
                <div style={{ color: 'var(--brf-tx2)', marginBottom: 18 }}>{props.message}</div>
                <div className='brf-row brf-end'>
                    <Button variant='sec' disabled={busy} onClick={() => setOpen(false)}>
                        Cancel
                    </Button>
                    <Button
                        variant={props.variant === 'danger' ? 'danger' : 'primary'}
                        loading={busy}
                        onClick={async () => {
                            setBusy(true);
                            try {
                                await props.onConfirm();
                                setOpen(false);
                            } finally {
                                setBusy(false);
                            }
                        }}
                    >
                        {props.confirmText ?? 'Confirm'}
                    </Button>
                </div>
            </Modal>
        </>
    );
}

export function Pager(props: { page: number; pages: number; onPage: (p: number) => void }) {
    if (props.pages <= 1) return null;
    return (
        <div className='brf-pager'>
            <Button variant='sec' size='sm' disabled={props.page <= 1} onClick={() => props.onPage(props.page - 1)}>
                ‹ Prev
            </Button>
            <span className='brf-muted'>
                Page {props.page} of {props.pages}
            </span>
            <Button variant='sec' size='sm' disabled={props.page >= props.pages} onClick={() => props.onPage(props.page + 1)}>
                Next ›
            </Button>
        </div>
    );
}

/* ----------------------------------------------------------------- helpers */

export function formatNumber(n: number | null | undefined): string {
    if (n === null || n === undefined || isNaN(n as any)) return '—';
    if (n >= 1e9) return (n / 1e9).toFixed(1) + 'B';
    if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
    return String(n);
}

export function formatBytes(b: number | null | undefined): string {
    if (!b && b !== 0) return '—';
    const u = ['B', 'KB', 'MB', 'GB', 'TB'];
    let i = 0;
    let v = b;
    while (v >= 1024 && i < u.length - 1) {
        v /= 1024;
        i++;
    }
    return v.toFixed(i ? 1 : 0) + ' ' + u[i];
}

export function timeAgo(date: string | number | null | undefined): string {
    if (!date) return '—';
    const t = typeof date === 'number' ? date : Date.parse(date);
    if (isNaN(t)) return '—';
    const s = Math.round((Date.now() - t) / 1000);
    if (s < 60) return 'just now';
    const m = Math.round(s / 60);
    if (m < 60) return m + 'm ago';
    const h = Math.round(m / 60);
    if (h < 48) return h + 'h ago';
    const d = Math.round(h / 24);
    if (d < 60) return d + 'd ago';
    return new Date(t).toLocaleDateString();
}

export function usePrevious<T>(value: T): T | undefined {
    const ref = useRef<T>();
    useEffect(() => {
        ref.current = value;
    });
    return ref.current;
}

export default Page;
