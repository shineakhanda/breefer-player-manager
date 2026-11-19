/*
 * Inventory + ender chest editor.
 * Online players are changed live (/item commands), offline players through their player file.
 * Click an item to select it, then click another slot to move / swap (or drag and drop).
 * Click an empty slot to add any game item from the item list.
 */
import React from 'react';
import { Alert, Badge, Button, Card, ConfirmButton, Input, Loading, api, getServerId, toastErr, toastOk } from './breefer-ui.js';

const { useState, useEffect, useMemo } = React;

export interface Item {
    slot: number | null;
    id: string;
    count: number;
    name: string | null;
    enchantments: Array<{ id: string; level: number }>;
    damage: number | null;
}

interface CatalogItem {
    id: string;
    name: string;
    stack: number;
}

type Container = 'inventory' | 'ender' | 'equipment';
interface SlotRef {
    container: Container;
    slot: string;
}

const base = () => `/api/client/extensions/breefer-player-manager/servers/${getServerId()}`;
const pretty = (id: string) => id.replace(/^minecraft:/, '').replace(/_/g, ' ');
const EQUIPMENT: Array<[string, string]> = [['head', 'Head'], ['chest', 'Chest'], ['legs', 'Legs'], ['feet', 'Feet'], ['offhand', 'Offhand']];

let assetVersion = '1.21.4';
const displayNames = new Map<string, string>();
let catalogPromise: Promise<{ version: string; items: CatalogItem[] }> | null = null;
export function loadCatalog() {
    catalogPromise ??= api<{ version: string; items: CatalogItem[] }>('GET', base() + '/items').then((r) => {
        assetVersion = r.version || assetVersion;
        r.items.forEach((i) => displayNames.set(i.id, i.name));
        return r;
    });
    catalogPromise.catch(() => (catalogPromise = null));
    return catalogPromise;
}

const wikiIcon = (name: string, ext = 'png') => `https://minecraft.wiki/images/Invicon_${encodeURIComponent(name.replace(/ /g, '_'))}.${ext}`;
const titleCase = (short: string) => short.split('_').map((w) => (['of', 'the', 'and', 'on', 'a'].includes(w) ? w : w.charAt(0).toUpperCase() + w.slice(1))).join(' ');

/** Which icon URL worked for an item ID (kept in the browser so lookups are not repeated). */
const resolved: Record<string, string> = (() => {
    try {
        return JSON.parse(localStorage.getItem('breefer-pm-icons') || '{}');
    } catch {
        return {};
    }
})();
let saveTimer: any = null;
function remember(id: string, url: string) {
    // Only once the item names are known, so a fallback picked too early is not kept.
    if (resolved[id] === url || displayNames.size === 0) return;
    resolved[id] = url;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
        try {
            localStorage.setItem('breefer-pm-icons', JSON.stringify(resolved));
        } catch {
            // storage unavailable
        }
    }, 500);
}

/**
 * Inventory icons as the game GUI shows them (blocks rendered in 3D) from the Minecraft Wiki,
 * trying the display name, the base block (waxed / infested variants), the item ID and animated
 * .gif icons, then the flat textures as a last resort.
 */
function textures(id: string): string[] {
    const [ns, short] = id.includes(':') ? id.split(':') : ['minecraft', id];
    if (ns !== 'minecraft') return [];
    const root = `https://assets.mcasset.cloud/${assetVersion}/assets/minecraft/textures`;
    const named = displayNames.get(`minecraft:${short}`);
    const names = [named, named?.replace(/^(Waxed|Infested|Petrified) /, '').replace(/ Block$/, ''), titleCase(short)].filter(Boolean) as string[];
    const wiki = [...new Set(names)].flatMap((n) => [wikiIcon(n), wikiIcon(n, 'gif')]);
    const flat = [`${root}/item/${short}.png`, `${root}/block/${short}.png`, `${root}/block/${short}_front.png`, `${root}/block/${short}_side.png`, `${root}/block/${short}_top.png`];
    if (short.endsWith('_arrow')) flat.push(`${root}/item/arrow.png`);
    const list = [...wiki, ...flat];
    return resolved[id] ? [resolved[id], ...list.filter((u) => u !== resolved[id])] : list;
}

export function ItemIcon(props: { id: string; size?: number }) {
    const [i, setI] = useState(0);
    const list = textures(props.id);
    const size = props.size ?? 32;
    const key = list.join('|');
    useEffect(() => setI(0), [key]);
    if (i >= list.length) {
        return <span style={{ fontSize: 9, lineHeight: 1.1, textAlign: 'center', padding: 2, wordBreak: 'break-word' }}>{pretty(props.id).slice(0, 14)}</span>;
    }
    return (
        <img
            src={list[i]}
            width={size}
            height={size}
            style={{ imageRendering: 'pixelated', objectFit: 'contain' }}
            alt=''
            loading='lazy'
            onLoad={() => remember(props.id, list[i])}
            onError={() => setI(i + 1)}
            draggable={false}
        />
    );
}

/** Minecraft GUI look: light panel, sunken grey slots. */
const MC_SLOT: any = {
    width: 40, height: 40, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
    background: '#8b8b8b', borderTop: '2px solid #373737', borderLeft: '2px solid #373737', borderBottom: '2px solid #fff', borderRight: '2px solid #fff',
    boxSizing: 'border-box',
};
const MC_PANEL: any = {
    background: '#c6c6c6', padding: 10, borderRadius: 4, border: '2px solid #000',
    boxShadow: 'inset 2px 2px 0 #fff, inset -2px -2px 0 #555', color: '#3f3f3f', display: 'inline-flex', flexDirection: 'column', gap: 6,
};
const MC_LABEL: any = { fontSize: 12, color: '#3f3f3f', fontWeight: 600 };

function Slot(props: {
    item?: Item;
    label?: string;
    selected?: boolean;
    editable: boolean;
    onClick?: () => void;
    onDropItem?: () => void;
    onDragStart?: () => void;
}) {
    const [over, setOver] = useState(false);
    const item = props.item;
    const title = item
        ? `${item.name ?? pretty(item.id)} ×${item.count}${item.enchantments.length ? '\n' + item.enchantments.map((e) => `${pretty(e.id)} ${e.level}`).join('\n') : ''}`
        : props.editable
          ? `${props.label ? props.label + ' – ' : ''}empty: click to add an item`
          : props.label ?? '';
    return (
        <div
            title={title}
            onClick={props.editable ? props.onClick : undefined}
            draggable={props.editable && !!item}
            onDragStart={(e: any) => {
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', 'breefer-slot');
                props.onDragStart?.();
            }}
            onDragOver={(e: any) => {
                if (!props.editable) return;
                e.preventDefault();
                setOver(true);
            }}
            onDragLeave={() => setOver(false)}
            onDrop={(e: any) => {
                e.preventDefault();
                setOver(false);
                props.onDropItem?.();
            }}
            style={{
                ...MC_SLOT,
                cursor: props.editable ? 'pointer' : 'default',
                background: over ? '#a0a0ff' : props.selected ? '#c5c5ff' : MC_SLOT.background,
                outline: props.selected ? '2px solid #fff' : undefined,
                outlineOffset: -2,
                boxShadow: item?.enchantments.length ? 'inset 0 0 8px 1px rgba(168,85,247,.75)' : undefined,
            }}
        >
            {item ? <ItemIcon id={item.id} /> : <span style={{ color: '#5a5a5a', fontSize: 9 }}>{props.label}</span>}
            {item && item.count > 1 ? (
                <b style={{ position: 'absolute', right: 3, bottom: 1, fontSize: 11, color: '#fff', textShadow: '1px 1px 0 #000', pointerEvents: 'none' }}>{item.count}</b>
            ) : null}
        </div>
    );
}

function ItemPicker(props: { target: SlotRef; label: string; onPick: (id: string, count: number) => Promise<void>; onCancel: () => void }) {
    const [catalog, setCatalog] = useState<CatalogItem[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [q, setQ] = useState('');
    const [chosen, setChosen] = useState<CatalogItem | null>(null);
    const [custom, setCustom] = useState('');
    const [count, setCount] = useState('1');
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        loadCatalog()
            .then((r) => setCatalog(r.items))
            .catch((e) => setError(e.message));
    }, []);

    const shown = useMemo(() => {
        if (!catalog) return [];
        const s = q.trim().toLowerCase();
        const list = s ? catalog.filter((i) => i.name.toLowerCase().includes(s) || i.id.includes(s.replace(/ /g, '_'))) : catalog;
        return list.slice(0, 240);
    }, [catalog, q]);

    const id = chosen?.id ?? custom.trim().toLowerCase();
    const max = props.target.container === 'equipment' ? 1 : chosen?.stack ?? 99;
    const validId = /^[a-z0-9_.\-]+:[a-z0-9_.\-\/]+$/.test(id.includes(':') ? id : 'minecraft:' + id);

    const add = async () => {
        setBusy(true);
        try {
            await props.onPick(id.includes(':') ? id : 'minecraft:' + id, Math.max(1, Math.min(Number(count || 1), max)));
        } finally {
            setBusy(false);
        }
    };

    return (
        <Card title={`Add an item: ${props.label}`} actions={<Button size='sm' variant='ghost' onClick={props.onCancel}>Cancel</Button>}>
            {error ? <Alert kind='warn'>{error}</Alert> : null}
            <div className='brf-row' style={{ marginBottom: 10 }}>
                <Input style={{ flex: 1, minWidth: 180 }} value={q} onValue={(v: string) => { setQ(v); }} placeholder='Search all items…' autoFocus />
                <Input style={{ width: 220 }} value={custom} onValue={(v: string) => { setCustom(v); setChosen(null); }} placeholder='or item ID (e.g. mymod:ruby)' />
            </div>
            {!catalog && !error ? <Loading /> : null}
            {catalog ? (
                <div style={{ ...MC_PANEL, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, 40px)', gap: 0, maxHeight: 260, overflowY: 'auto', width: '100%' }}>
                    {shown.map((i) => (
                        <div
                            key={i.id}
                            title={`${i.name}\n${i.id}`}
                            onClick={() => { setChosen(i); setCustom(''); setCount(String(Math.min(Number(count) || 1, i.stack))); }}
                            onDoubleClick={() => { setChosen(i); }}
                            style={{ ...MC_SLOT, cursor: 'pointer', background: chosen?.id === i.id ? '#c5c5ff' : MC_SLOT.background, outline: chosen?.id === i.id ? '2px solid #fff' : undefined, outlineOffset: -2 }}
                        >
                            <ItemIcon id={i.id} />
                        </div>
                    ))}
                </div>
            ) : null}
            {catalog && shown.length === 240 ? <span className='brf-muted'>Showing the first 240 matches, search to narrow down.</span> : null}
            <div className='brf-row brf-between' style={{ marginTop: 12 }}>
                <div className='brf-row'>
                    {id ? <ItemIcon id={id.includes(':') ? id : 'minecraft:' + id} /> : null}
                    <b>{chosen?.name ?? (id ? pretty(id) : 'Pick an item')}</b>
                    {chosen ? <span className='brf-muted brf-mono'>{chosen.id}</span> : null}
                </div>
                <div className='brf-row'>
                    <span className='brf-muted'>Amount</span>
                    <Input style={{ width: 80 }} value={count} onValue={(v: string) => setCount(v.replace(/\D/g, '').slice(0, 2))} disabled={max === 1} />
                    <span className='brf-muted'>max {max}</span>
                    <Button size='sm' disabled={!id || !validId} loading={busy} onClick={add}>Add to slot</Button>
                </div>
            </div>
        </Card>
    );
}

export default function InventoryManager(props: {
    uuid: string;
    name: string | null;
    online: boolean;
    inventory: Item[];
    ender: Item[];
    equipment: Record<string, Item>;
    canEdit: boolean;
    editHint: string | null;
    onChanged: () => Promise<void> | void;
}) {
    const [selected, setSelected] = useState<SlotRef | null>(null);
    const [picker, setPicker] = useState<SlotRef | null>(null);
    const [busy, setBusy] = useState(false);
    const [count, setCount] = useState('');
    const [dragFrom, setDragFrom] = useState<SlotRef | null>(null);
    const [, setCatalogReady] = useState(false);
    useEffect(() => {
        loadCatalog().then(() => setCatalogReady(true)).catch(() => undefined);
    }, []);

    const byInv = useMemo(() => new Map(props.inventory.map((i) => [String(i.slot), i])), [props.inventory]);
    const byEnder = useMemo(() => new Map(props.ender.map((i) => [String(i.slot), i])), [props.ender]);
    const itemAt = (r: SlotRef | null): Item | undefined =>
        !r ? undefined : r.container === 'inventory' ? byInv.get(r.slot) : r.container === 'ender' ? byEnder.get(r.slot) : props.equipment[r.slot];
    const label = (r: SlotRef) =>
        r.container === 'equipment' ? `${r.slot} slot` : r.container === 'ender' ? `ender chest slot ${Number(r.slot) + 1}` : Number(r.slot) < 9 ? `hotbar slot ${Number(r.slot) + 1}` : `inventory slot ${Number(r.slot) - 8}`;
    const same = (a: SlotRef | null, b: SlotRef | null) => !!a && !!b && a.container === b.container && a.slot === b.slot;

    useEffect(() => {
        const it = itemAt(selected);
        setCount(it ? String(it.count) : '');
    }, [selected?.container, selected?.slot, props.inventory, props.ender]);

    const send = async (body: Record<string, any>, ok?: string) => {
        setBusy(true);
        try {
            const r: any = await api('POST', `${base()}/players/${props.uuid}/inventory`, { name: props.name, ...body });
            toastOk(ok ? `${ok}. ${r.message}` : r.message);
            setSelected(null);
            setPicker(null);
            await props.onChanged();
        } catch (e: any) {
            toastErr(e.message);
        } finally {
            setBusy(false);
        }
    };

    const move = (from: SlotRef, to: SlotRef) => {
        if (same(from, to)) return;
        const what = itemAt(from);
        send({ op: 'move', from, to }, what ? `Moved ${what.name ?? pretty(what.id)} to ${label(to)}` : undefined);
    };

    const click = (r: SlotRef) => {
        if (!props.canEdit || busy) return;
        if (selected) {
            if (same(selected, r)) setSelected(null);
            else move(selected, r);
            return;
        }
        if (itemAt(r)) {
            setSelected(r);
            setPicker(null);
        } else {
            setPicker(r);
        }
    };

    const slot = (r: SlotRef, labelText?: string) => (
        <Slot
            key={r.container + r.slot}
            item={itemAt(r)}
            label={labelText}
            selected={same(selected, r) || same(picker, r)}
            editable={props.canEdit && !busy}
            onClick={() => click(r)}
            onDragStart={() => { setDragFrom(r); setSelected(null); }}
            onDropItem={() => { if (dragFrom) move(dragFrom, r); setDragFrom(null); }}
        />
    );
    const grid = (container: Container, from: number, n: number) => (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(9, 40px)', gap: 0 }}>
            {Array.from({ length: n }, (_, i) => slot({ container, slot: String(from + i) }))}
        </div>
    );

    const sel = itemAt(selected);

    return (
        <div className='brf-col'>
            {props.canEdit ? (
                <Alert kind={props.online ? 'ok' : 'info'} style={{ marginBottom: 0 }}>
                    {props.online
                        ? 'Live editing: the player is online, changes apply in game immediately.'
                        : 'The player is offline: changes are saved to their player file and load the next time they join (no restart needed).'}{' '}
                    Click an item, then another slot to move or swap it (or drag it). Click an empty slot to add an item.
                </Alert>
            ) : props.editHint ? (
                <Alert kind='info' style={{ marginBottom: 0 }}>{props.editHint}</Alert>
            ) : null}

            {selected && sel ? (
                <Card>
                    <div className='brf-row brf-between'>
                        <div className='brf-row'>
                            <ItemIcon id={sel.id} />
                            <div>
                                <b>{sel.name ?? pretty(sel.id)}</b>
                                <div className='brf-muted' style={{ fontSize: 12 }}>
                                    {label(selected)} · <span className='brf-mono'>{sel.id}</span>
                                    {sel.enchantments.length ? ' · ' + sel.enchantments.map((e) => `${pretty(e.id)} ${e.level}`).join(', ') : ''}
                                </div>
                            </div>
                        </div>
                        <div className='brf-row'>
                            <Badge kind='pri'>Click a slot to move it</Badge>
                            <Input style={{ width: 70 }} value={count} onValue={(v: string) => setCount(v.replace(/\D/g, '').slice(0, 2))} />
                            <Button size='sm' variant='sec' disabled={!count || Number(count) === sel.count || Number(count) < 1} loading={busy}
                                onClick={() => send({ op: 'count', container: selected.container, slot: selected.slot, count: Number(count), id: sel.id }, `Amount set to ${count}`)}>
                                Set amount
                            </Button>
                            <Button size='sm' variant='sec' onClick={() => { setPicker(selected); setSelected(null); }}>Replace…</Button>
                            <ConfirmButton size='sm' variant='danger' title='Remove this item?' message={`${sel.name ?? pretty(sel.id)} ×${sel.count} will be deleted from ${label(selected)}.`}
                                confirmText='Remove' onConfirm={() => send({ op: 'remove', container: selected.container, slot: selected.slot }, `Removed ${sel.name ?? pretty(sel.id)}`)}>
                                Remove
                            </ConfirmButton>
                            <Button size='sm' variant='ghost' onClick={() => setSelected(null)}>Cancel</Button>
                        </div>
                    </div>
                </Card>
            ) : null}

            {picker ? (
                <ItemPicker
                    target={picker}
                    label={label(picker)}
                    onCancel={() => setPicker(null)}
                    onPick={(id, n) => send({ op: 'set', container: picker.container, slot: picker.slot, id, count: n }, `Added ${n} ${pretty(id)} to ${label(picker)}`)}
                />
            ) : null}

            <div className='brf-row' style={{ alignItems: 'flex-start', gap: 14, flexWrap: 'wrap' }}>
                <div style={MC_PANEL}>
                    <div className='brf-row' style={{ alignItems: 'flex-start', gap: 12 }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                            <span style={MC_LABEL}>Armor</span>
                            {EQUIPMENT.map(([key, text]) => slot({ container: 'equipment', slot: key }, text))}
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            <span style={MC_LABEL}>Inventory</span>
                            {grid('inventory', 9, 27)}
                            <div style={{ height: 6 }} />
                            {grid('inventory', 0, 9)}
                        </div>
                    </div>
                </div>
                <div style={MC_PANEL}>
                    <span style={MC_LABEL}>Ender Chest</span>
                    {grid('ender', 0, 27)}
                </div>
            </div>
            {busy ? <span className='brf-muted'>Applying…</span> : null}
        </div>
    );
}
