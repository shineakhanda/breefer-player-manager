const React = window.React;
if (!React) throw new Error('window.React is not available for extension module rendering.');
/*
 * Breefer UI kit — shared, dependency-free UI primitives for Breefer extensions.
 * Uses the panel's runtime React (window.React) and the panel theme CSS variables,
 * so it adapts to every Reviactyl theme without depending on Tailwind classes.
 */

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
export function useBreeferStyles() {
    if (typeof document === 'undefined')
        return;
    if (!document.getElementById(STYLE_ID)) {
        const el = document.createElement('style');
        el.id = STYLE_ID;
        el.textContent = CSS;
        document.head.appendChild(el);
    }
}
/* -------------------------------------------------------------------- http */
function readCookie(name) {
    const match = document.cookie.split('; ').find((row) => row.startsWith(name + '='));
    return match ? decodeURIComponent(match.split('=').slice(1).join('=')) : null;
}
export class ApiError extends Error {
    constructor(message, status) {
        super(message);
        this.status = status;
    }
}
function errorMessage(data, status) {
    if (data && typeof data === 'object') {
        if (Array.isArray(data.errors) && data.errors[0]?.detail)
            return data.errors[0].detail;
        if (typeof data.error === 'string')
            return data.error;
        if (typeof data.message === 'string' && data.message)
            return data.message;
        if (data.errors && typeof data.errors === 'object') {
            const first = Object.values(data.errors)[0];
            if (Array.isArray(first) && first[0])
                return String(first[0]);
        }
    }
    return `Request failed (HTTP ${status}).`;
}
export async function api(method, url, body, timeoutMs = 60000) {
    const headers = {
        Accept: 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
    };
    const xsrf = readCookie('XSRF-TOKEN');
    if (xsrf)
        headers['X-XSRF-TOKEN'] = xsrf;
    const init = { method, headers, credentials: 'same-origin' };
    if (body !== undefined) {
        headers['Content-Type'] = 'application/json';
        init.body = JSON.stringify(body);
    }
    const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    let timer;
    if (ctrl && timeoutMs > 0) {
        init.signal = ctrl.signal;
        timer = setTimeout(() => ctrl.abort(), timeoutMs);
    }
    let res;
    try {
        res = await fetch(url, init);
    }
    catch (e) {
        throw new ApiError(e?.name === 'AbortError' ? 'The request timed out.' : 'Network error, please try again.', 0);
    }
    finally {
        if (timer)
            clearTimeout(timer);
    }
    if (res.status === 401 && !window.location.pathname.startsWith('/auth')) {
        window.location.href = '/auth/login';
    }
    const text = await res.text();
    let data = null;
    if (text) {
        try {
            data = JSON.parse(text);
        }
        catch {
            data = text;
        }
    }
    if (!res.ok)
        throw new ApiError(errorMessage(data, res.status), res.status);
    return data;
}
/** Returns the server identifier from the current URL (/server/:id/...). */
export function getServerId() {
    const m = window.location.pathname.match(/\/server\/([^/]+)/);
    return m ? decodeURIComponent(m[1]) : null;
}
export function useServer() {
    const id = getServerId();
    const [server, setServer] = useState(null);
    const [error, setError] = useState(null);
    useEffect(() => {
        if (!id)
            return;
        let alive = true;
        api('GET', `/api/client/servers/${encodeURIComponent(id)}`)
            .then((d) => alive && setServer(d?.attributes ?? d))
            .catch((e) => alive && setError(e.message));
        return () => {
            alive = false;
        };
    }, [id]);
    return { id, server, error };
}
/** Small async-state helper. */
export function useAsync(fn, deps = []) {
    const [data, setData] = useState(null);
    const [error, setError] = useState(null);
    const [loading, setLoading] = useState(true);
    const run = useCallback(() => {
        setLoading(true);
        setError(null);
        return fn()
            .then((d) => {
            setData(d);
            return d;
        })
            .catch((e) => {
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
export function useDebounced(value, ms = 400) {
    const [v, setV] = useState(value);
    useEffect(() => {
        const t = setTimeout(() => setV(value), ms);
        return () => clearTimeout(t);
    }, [value, ms]);
    return v;
}
let toastSeq = 0;
let toastItems = [];
const toastSubs = new Set();
function emitToasts() {
    toastSubs.forEach((fn) => fn(toastItems));
}
export function toast(text, kind = 'info', ms = 4500) {
    const item = { id: ++toastSeq, kind, text };
    toastItems = [...toastItems, item];
    emitToasts();
    setTimeout(() => {
        toastItems = toastItems.filter((t) => t.id !== item.id);
        emitToasts();
    }, ms);
}
export const toastOk = (t) => toast(t, 'ok');
export const toastErr = (t) => toast(t, 'err', 7000);
function Toasts() {
    const [items, setItems] = useState(toastItems);
    useEffect(() => {
        toastSubs.add(setItems);
        return () => {
            toastSubs.delete(setItems);
        };
    }, []);
    if (!items.length)
        return null;
    return (React.createElement("div", { className: 'brf brf-toasts', style: { marginTop: 0 } }, items.map((t) => (React.createElement("div", { key: t.id, className: `brf-toast brf-${t.kind}` }, t.text)))));
}
export function Page(props) {
    useBreeferStyles();
    return (React.createElement("div", { className: 'brf' },
        React.createElement("div", { className: 'brf-head' },
            React.createElement("div", null,
                React.createElement("h1", null,
                    React.createElement("span", { className: 'brf-logo' }, props.letter ?? 'B'),
                    React.createElement("span", null, props.title),
                    props.badge ? React.createElement("span", { className: 'brf-badge brf-pri' }, props.badge) : null),
                props.subtitle ? React.createElement("p", null, props.subtitle) : null),
            props.actions ? React.createElement("div", { className: 'brf-row' }, props.actions) : null),
        props.children,
        React.createElement(Toasts, null)));
}
export function Card(props) {
    return (React.createElement("div", { className: 'brf-card ' + (props.className ?? ''), style: props.style },
        props.title || props.actions ? (React.createElement("div", { className: 'brf-row brf-between', style: { marginBottom: props.subtitle ? 0 : 12 } },
            props.title ? React.createElement("h2", null, props.title) : React.createElement("span", null),
            props.actions ? React.createElement("div", { className: 'brf-row' }, props.actions) : null)) : null,
        props.subtitle ? React.createElement("p", { className: 'brf-sub' }, props.subtitle) : null,
        props.children));
}
export function Button(props) {
    const cls = ['brf-btn'];
    if (props.variant && props.variant !== 'primary')
        cls.push('brf-' + props.variant);
    if (props.size)
        cls.push('brf-' + props.size);
    return (React.createElement("button", { type: props.type ?? 'button', className: cls.join(' '), onClick: props.onClick, disabled: props.disabled || props.loading, title: props.title, style: props.style },
        props.loading ? React.createElement("span", { className: 'brf-spin', style: { width: 13, height: 13 } }) : null,
        props.children));
}
export function Field(props) {
    return (React.createElement("label", { className: 'brf-field', style: props.style },
        props.label ? React.createElement("span", null, props.label) : null,
        props.children,
        props.hint ? React.createElement("small", null, props.hint) : null));
}
export function Input(props) {
    const { onValue, className, ...rest } = props;
    return (React.createElement("input", { className: 'brf-in ' + (className ?? ''), ...rest, onChange: (e) => {
            props.onChange?.(e);
            onValue?.(e.target.value);
        } }));
}
export function TextArea(props) {
    const { onValue, className, ...rest } = props;
    return (React.createElement("textarea", { className: 'brf-in ' + (className ?? ''), ...rest, onChange: (e) => {
            props.onChange?.(e);
            onValue?.(e.target.value);
        } }));
}
export function Select(props) {
    return (React.createElement("select", { className: 'brf-in', value: props.value ?? '', disabled: props.disabled, style: props.style, onChange: (e) => props.onValue(e.target.value) }, props.options.map((o) => typeof o === 'string' ? (React.createElement("option", { key: o, value: o }, o)) : (React.createElement("option", { key: String(o.value), value: o.value }, o.label)))));
}
export function Check(props) {
    return (React.createElement("label", { className: 'brf-check' },
        React.createElement("input", { type: 'checkbox', checked: props.checked, disabled: props.disabled, onChange: (e) => props.onValue(e.target.checked) }),
        props.label));
}
export function Badge(props) {
    return React.createElement("span", { className: 'brf-badge' + (props.kind ? ' brf-' + props.kind : '') }, props.children);
}
export function Alert(props) {
    return (React.createElement("div", { className: 'brf-alert brf-' + (props.kind ?? 'info'), style: props.style }, props.children));
}
export function Spinner(props) {
    return React.createElement("span", { className: 'brf-spin' + (props.large ? ' brf-lg' : '') });
}
export function Loading() {
    return (React.createElement("div", { className: 'brf-center' },
        React.createElement(Spinner, { large: true })));
}
export function Empty(props) {
    return (React.createElement("div", { className: 'brf-empty' },
        React.createElement("b", null, props.title),
        props.text,
        props.children ? React.createElement("div", { style: { marginTop: 12 } }, props.children) : null));
}
export function Tabs(props) {
    return (React.createElement("div", { className: 'brf-tabs' }, props.tabs.map((t) => (React.createElement("button", { key: t.key, type: 'button', className: 'brf-tab' + (t.key === props.value ? ' brf-on' : ''), onClick: () => props.onValue(t.key) }, t.label)))));
}
export function Modal(props) {
    useEffect(() => {
        if (!props.open)
            return;
        const onKey = (e) => e.key === 'Escape' && props.onClose();
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [props.open]);
    if (!props.open)
        return null;
    return (React.createElement("div", { className: 'brf brf-modal-bg', style: { marginTop: 0 }, onMouseDown: (e) => e.target === e.currentTarget && props.onClose() },
        React.createElement("div", { className: 'brf-modal', style: { ['--brf-mw']: (props.width ?? 560) + 'px' } },
            props.title ? React.createElement("h3", null, props.title) : null,
            props.children)));
}
/** A button that asks for confirmation in a modal before running `onConfirm`. */
export function ConfirmButton(props) {
    const [open, setOpen] = useState(false);
    const [busy, setBusy] = useState(false);
    return (React.createElement(React.Fragment, null,
        React.createElement(Button, { variant: props.variant, size: props.size, disabled: props.disabled, onClick: () => setOpen(true) }, props.children),
        React.createElement(Modal, { open: open, onClose: () => !busy && setOpen(false), title: props.title, width: 460 },
            React.createElement("div", { style: { color: 'var(--brf-tx2)', marginBottom: 18 } }, props.message),
            React.createElement("div", { className: 'brf-row brf-end' },
                React.createElement(Button, { variant: 'sec', disabled: busy, onClick: () => setOpen(false) }, "Cancel"),
                React.createElement(Button, { variant: props.variant === 'danger' ? 'danger' : 'primary', loading: busy, onClick: async () => {
                        setBusy(true);
                        try {
                            await props.onConfirm();
                            setOpen(false);
                        }
                        finally {
                            setBusy(false);
                        }
                    } }, props.confirmText ?? 'Confirm')))));
}
export function Pager(props) {
    if (props.pages <= 1)
        return null;
    return (React.createElement("div", { className: 'brf-pager' },
        React.createElement(Button, { variant: 'sec', size: 'sm', disabled: props.page <= 1, onClick: () => props.onPage(props.page - 1) }, "\u2039 Prev"),
        React.createElement("span", { className: 'brf-muted' },
            "Page ",
            props.page,
            " of ",
            props.pages),
        React.createElement(Button, { variant: 'sec', size: 'sm', disabled: props.page >= props.pages, onClick: () => props.onPage(props.page + 1) }, "Next \u203A")));
}
/* ----------------------------------------------------------------- helpers */
export function formatNumber(n) {
    if (n === null || n === undefined || isNaN(n))
        return '—';
    if (n >= 1e9)
        return (n / 1e9).toFixed(1) + 'B';
    if (n >= 1e6)
        return (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3)
        return (n / 1e3).toFixed(1) + 'K';
    return String(n);
}
export function formatBytes(b) {
    if (!b && b !== 0)
        return '—';
    const u = ['B', 'KB', 'MB', 'GB', 'TB'];
    let i = 0;
    let v = b;
    while (v >= 1024 && i < u.length - 1) {
        v /= 1024;
        i++;
    }
    return v.toFixed(i ? 1 : 0) + ' ' + u[i];
}
export function timeAgo(date) {
    if (!date)
        return '—';
    const t = typeof date === 'number' ? date : Date.parse(date);
    if (isNaN(t))
        return '—';
    const s = Math.round((Date.now() - t) / 1000);
    if (s < 60)
        return 'just now';
    const m = Math.round(s / 60);
    if (m < 60)
        return m + 'm ago';
    const h = Math.round(m / 60);
    if (h < 48)
        return h + 'h ago';
    const d = Math.round(h / 24);
    if (d < 60)
        return d + 'd ago';
    return new Date(t).toLocaleDateString();
}
export function usePrevious(value) {
    const ref = useRef();
    useEffect(() => {
        ref.current = value;
    });
    return ref.current;
}
export default Page;
