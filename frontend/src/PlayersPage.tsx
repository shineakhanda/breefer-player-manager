import React from 'react';
import {
    Alert, Badge, Button, Card, ConfirmButton, Empty, Field, Input, Loading, Modal, Page, Select, Tabs,
    api, getServerId, timeAgo, toastErr, toastOk,
} from './breefer-ui.js';
import InventoryManager from './InventoryManager.js';

const { useState, useEffect, useMemo } = React;

interface Player {
    uuid: string | null;
    name: string | null;
    online: boolean;
    op: number | null;
    whitelisted: boolean;
    banned: null | { reason: string | null; source: string | null; expires: string };
    last_seen: string | null;
    has_data: boolean;
}
interface Overview {
    status: { reachable: boolean; error?: string; online: number; max: number; version?: string; motd?: string; latency?: number; favicon?: string | null; full_list?: boolean };
    address: string;
    properties: { whitelist: boolean; online_mode: boolean; max_players: number; gamemode: string | null; difficulty: string | null; pvp: boolean; query: boolean };
    world: string;
    can_console: boolean;
    can_delete: boolean;
    can_update?: boolean;
    allow?: Record<string, boolean>;
}
interface Item {
    slot: number | null;
    id: string;
    count: number;
    name: string | null;
    enchantments: Array<{ id: string; level: number }>;
    damage: number | null;
}
interface Details {
    uuid: string;
    error: string | null;
    summary: null | {
        health: number | null; food: number | null; saturation: number | null; xp_level: number | null; xp_progress: number | null;
        gamemode: string | null; dimension: string | null; position: number[] | null; flying: boolean;
        effects: Array<{ id: string; amplifier: number; duration: number }>;
    };
    inventory: Item[];
    equipment: Record<string, Item>;
    ender_chest: Item[];
    stats: null | Record<string, any>;
    inventory_hidden?: boolean;
}

const base = () => `/api/client/extensions/breefer-player-manager/servers/${getServerId()}`;
// 3D isometric player heads
const avatar = (p: { uuid: string | null; name: string | null }, size = 32) => `https://mc-heads.net/head/${encodeURIComponent(p.uuid ?? p.name ?? 'MHF_Steve')}/${size * 2}`;
const pretty = (id: string) => id.replace(/^minecraft:/, '').replace(/_/g, ' ');

function PlayerModal(props: { player: Player; overview: Overview; online: string[]; onClose: () => void; onChanged: () => void }) {
    const p = props.player;
    const [details, setDetails] = useState<Details | null>(null);
    const [tab, setTab] = useState('overview');
    const [reason, setReason] = useState('');
    const [item, setItem] = useState('minecraft:diamond');
    const [amount, setAmount] = useState('1');
    const [effect, setEffect] = useState('minecraft:speed');
    const [duration, setDuration] = useState('60');
    const [amplifier, setAmplifier] = useState('0');
    const [message, setMessage] = useState('');
    const [busy, setBusy] = useState<string | null>(null);
    const [tpTarget, setTpTarget] = useState('');
    const [tp, setTp] = useState({ x: '', y: '', z: '' });
    const [xp, setXp] = useState('');
    const [title, setTitle] = useState('');
    const [subtitle, setSubtitle] = useState('');

    const [reloading, setReloading] = useState(false);
    // Online players: the server saves its player data first, so inventory and position are current.
    const loadDetails = (fresh: boolean) => {
        if (!p.uuid) return Promise.resolve();
        setReloading(true);
        return api<Details>('GET', `${base()}/players/${p.uuid}${fresh ? '?fresh=1' : ''}`)
            .then(setDetails)
            .catch((e) => toastErr(e.message))
            .finally(() => setReloading(false));
    };

    useEffect(() => {
        loadDetails(p.online && props.overview.can_console);
    }, [p.uuid]);

    const run = async (action: string, extra: Record<string, any> = {}, success?: string) => {
        setBusy(action);
        try {
            const r: any = await api('POST', base() + '/action', { action, name: p.name, ...extra });
            toastOk(r?.offline ? r.message : success ?? `Sent: ${action.replace('_', ' ')} ${p.name}`);
            props.onChanged();
        } catch (e: any) {
            toastErr(e.message);
        } finally {
            setBusy(null);
        }
    };

    const wipe = async () => {
        try {
            const r: any = await api('POST', `${base()}/players/${p.uuid}/wipe`);
            toastOk(`Deleted ${r.deleted.length} file(s) for ${p.name ?? p.uuid}.`);
            props.onChanged();
            props.onClose();
        } catch (e: any) {
            toastErr(e.message);
        }
    };

    const s = details?.summary;
    const can = (k: string) => props.overview.allow?.[k] !== false;
    const canAct = props.overview.can_console && !!p.name;
    // Live edits need the console (and a name for the commands); offline edits change the player file.
    const editable = can('allow_inventory_edit') && (p.online ? props.overview.can_console && !!p.name : props.overview.can_update !== false);
    const editHint = !can('allow_inventory_edit')
        ? 'Inventory editing is disabled by the administrator.'
        : p.online
          ? 'Editing an online player needs the console permission.'
          : 'Editing an offline player needs the file update permission.';

    return (
        <Modal open onClose={props.onClose} width={760}>
            <div className='brf-row' style={{ gap: 14, marginBottom: 14 }}>
                <img src={avatar(p, 64)} width={56} height={56} style={{ borderRadius: 8, imageRendering: 'pixelated' }} alt='' />
                <div className='brf-grow'>
                    <h3 style={{ margin: 0 }}>{p.name ?? 'Unknown player'}</h3>
                    <span className='brf-muted brf-mono'>{p.uuid}</span>
                    <div className='brf-row' style={{ gap: 6, marginTop: 4 }}>
                        {p.online ? <Badge kind='ok'>online</Badge> : <Badge>offline</Badge>}
                        {p.op ? <Badge kind='pri'>op {p.op}</Badge> : null}
                        {p.whitelisted ? <Badge kind='ok'>whitelisted</Badge> : null}
                        {p.banned ? <Badge kind='err'>banned</Badge> : null}
                        {s?.gamemode ? <Badge>{s.gamemode}</Badge> : null}
                    </div>
                </div>
                {p.uuid ? (
                    <Button size='sm' variant='ghost' loading={reloading} onClick={() => loadDetails(p.online && props.overview.can_console)} title='Reload the saved player data'>
                        Reload
                    </Button>
                ) : null}
            </div>
            <Tabs
                value={tab}
                onValue={setTab}
                tabs={[
                    { key: 'overview', label: 'Overview' },
                    { key: 'inventory', label: 'Inventory' },
                    { key: 'stats', label: 'Statistics' },
                    { key: 'actions', label: 'Actions' },
                ]}
            />
            {!p.uuid ? <Alert kind='info'>This player has no UUID on record yet, so saved data is unavailable.</Alert> : null}
            {p.uuid && !details && tab !== 'actions' ? <Loading /> : null}
            {details?.error && tab !== 'actions' && tab !== 'stats' ? <Alert kind='info'>{details.error}</Alert> : null}

            {tab === 'overview' && s ? (
                <div className='brf-col'>
                    <div className='brf-grid' style={{ ['--brf-min' as any]: '150px' }}>
                        <div className='brf-stat'>
                            <span>Health</span>
                            <b>❤ {s.health ?? '—'} / 20</b>
                        </div>
                        <div className='brf-stat'>
                            <span>Food</span>
                            <b>🍗 {s.food ?? '—'} / 20</b>
                        </div>
                        <div className='brf-stat'>
                            <span>Experience</span>
                            <b>Lvl {s.xp_level ?? 0}</b>
                        </div>
                        <div className='brf-stat'>
                            <span>Location</span>
                            <b style={{ fontSize: 15 }}>{s.position ? s.position.join(', ') : '—'}</b>
                            <span>{s.dimension ? pretty(s.dimension) : ''}</span>
                        </div>
                    </div>
                    {s.effects.length ? (
                        <div className='brf-row'>
                            {s.effects.map((e, i) => (
                                <Badge key={i} kind='pri'>
                                    {pretty(String(e.id))} {e.amplifier + 1} · {Math.round(e.duration / 20)}s
                                </Badge>
                            ))}
                        </div>
                    ) : (
                        <span className='brf-muted'>No active effects.</span>
                    )}
                    {p.banned ? (
                        <Alert kind='err' style={{ marginBottom: 0 }}>
                            Banned by {p.banned.source ?? 'Server'}: {p.banned.reason ?? 'no reason'} (expires {p.banned.expires})
                        </Alert>
                    ) : null}
                </div>
            ) : null}

            {tab === 'inventory' && details?.inventory_hidden ? <Alert kind='info'>Inventory viewing is disabled by the administrator.</Alert> : null}
            {tab === 'inventory' && details && !details.error && !details.inventory_hidden && p.uuid ? (
                <InventoryManager
                    uuid={p.uuid}
                    name={p.name}
                    online={p.online}
                    inventory={details.inventory}
                    ender={details.ender_chest}
                    equipment={details.equipment}
                    canEdit={editable}
                    editHint={editHint}
                    onChanged={() => loadDetails(p.online && props.overview.can_console)}
                />
            ) : null}

            {tab === 'stats' && details ? (
                details.stats ? (
                    <div className='brf-col'>
                        <div className='brf-grid' style={{ ['--brf-min' as any]: '140px' }}>
                            {[
                                ['Play time', details.stats.play_time_hours + ' h'],
                                ['Deaths', details.stats.deaths],
                                ['Mob kills', details.stats.mob_kills],
                                ['Player kills', details.stats.player_kills],
                                ['Distance', details.stats.distance_km + ' km'],
                                ['Jumps', details.stats.jumps],
                                ['Blocks mined', details.stats.blocks_mined],
                                ['Items crafted', details.stats.items_crafted],
                            ].map(([label, value]) => (
                                <div key={String(label)} className='brf-stat'>
                                    <span>{label}</span>
                                    <b>{String(value)}</b>
                                </div>
                            ))}
                        </div>
                        <div className='brf-grid' style={{ ['--brf-min' as any]: '260px' }}>
                            {[
                                ['Most mined', details.stats.top_mined],
                                ['Most killed', details.stats.top_killed],
                            ].map(([label, list]: any) => (
                                <div key={label}>
                                    <b>{label}</b>
                                    {list.length === 0 ? (
                                        <div className='brf-muted'>Nothing yet.</div>
                                    ) : (
                                        list.map((e: any) => (
                                            <div key={e.id} className='brf-row brf-between'>
                                                <span>{pretty(e.id)}</span>
                                                <span className='brf-muted'>{e.count}</span>
                                            </div>
                                        ))
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                ) : (
                    <Empty title='No statistics' text='Stats are written when the player has played on this world.' />
                )
            ) : null}

            {tab === 'actions' ? (
                !canAct ? (
                    <Alert kind='warn'>You need console permission (and a known player name) to run actions.</Alert>
                ) : (
                    <div className='brf-col'>
                        {!props.overview.status.reachable ? (
                            <Alert kind='info' style={{ marginBottom: 0 }}>
                                The server looks stopped. Whitelist, operator and ban changes are written to the server files and apply on the next start; the other actions need the server running.
                            </Alert>
                        ) : !p.online ? (
                            <Alert kind='info' style={{ marginBottom: 0 }}>
                                {p.name} is offline. Whitelist, operator and ban actions work; in-game actions (teleport, items, effects, messages) need the player online.
                            </Alert>
                        ) : null}
                        <div className='brf-row'>
                            {can('allow_whitelist') ? <Button size='sm' variant='sec' loading={busy === (p.whitelisted ? 'whitelist_remove' : 'whitelist_add')} onClick={() => run(p.whitelisted ? 'whitelist_remove' : 'whitelist_add')}>
                                {p.whitelisted ? 'Remove from whitelist' : 'Add to whitelist'}
                            </Button> : null}
                            {can('allow_op') ? <Button size='sm' variant='sec' loading={busy === (p.op ? 'deop' : 'op')} onClick={() => run(p.op ? 'deop' : 'op')}>
                                {p.op ? 'Remove operator' : 'Make operator'}
                            </Button> : null}
                            {can('allow_gamemode') && ['survival', 'creative', 'adventure', 'spectator'].map((g) => (
                                <Button key={g} size='sm' variant={s?.gamemode === g ? 'primary' : 'ghost'} onClick={() => run('gamemode', { gamemode: g }, `${p.name} is now in ${g}`)}>
                                    {g}
                                </Button>
                            ))}
                        </div>
                        <div className='brf-row'>
                            {can('allow_effects') ? <>
                            <Button size='sm' variant='ghost' onClick={() => run('heal', {}, `Healed ${p.name}`)}>Heal</Button>
                            <Button size='sm' variant='ghost' onClick={() => run('feed', {}, `Fed ${p.name}`)}>Feed</Button>
                            <Button size='sm' variant='ghost' onClick={() => run('effect_clear', {}, `Cleared effects of ${p.name}`)}>Clear effects</Button>
                            </> : null}
                            {can('allow_destructive') ? <>
                            <ConfirmButton size='sm' variant='ghost' title='Clear inventory?' message={`Everything in ${p.name}'s inventory will be removed.`} confirmText='Clear' onConfirm={() => run('clear')}>
                                Clear inventory
                            </ConfirmButton>
                            <ConfirmButton size='sm' variant='ghost' title='Kill player?' message={`${p.name} will be killed in-game.`} confirmText='Kill' onConfirm={() => run('kill')}>
                                Kill
                            </ConfirmButton>
                            </> : null}
                        </div>
                        {can('allow_give') ? <Card title='Give item'>
                            <div className='brf-row'>
                                <Input style={{ flex: 2 }} value={item} onValue={setItem} placeholder='minecraft:diamond' />
                                <Input style={{ width: 90 }} value={amount} onValue={(v: string) => setAmount(v.replace(/\D/g, ''))} />
                                <Button size='sm' onClick={() => run('give', { item: item.trim(), amount: Number(amount || 1) }, `Gave ${amount} ${pretty(item)} to ${p.name}`)}>
                                    Give
                                </Button>
                            </div>
                        </Card> : null}
                        {can('allow_effects') ? <Card title='Apply effect'>
                            <div className='brf-row'>
                                <Input style={{ flex: 2 }} value={effect} onValue={setEffect} placeholder='minecraft:speed' />
                                <Field label='Seconds' style={{ width: 90 }}>
                                    <Input value={duration} onValue={(v: string) => setDuration(v.replace(/\D/g, ''))} />
                                </Field>
                                <Field label='Level' style={{ width: 80 }}>
                                    <Input value={amplifier} onValue={(v: string) => setAmplifier(v.replace(/\D/g, ''))} />
                                </Field>
                                <Button size='sm' onClick={() => run('effect', { effect: effect.trim(), duration: Number(duration || 30), amplifier: Number(amplifier || 0) })}>Apply</Button>
                            </div>
                        </Card> : null}
                        {can('allow_teleport') ? <Card title='Teleport' subtitle='The player must be online.'>
                            <div className='brf-row'>
                                <Select
                                    style={{ minWidth: 160 }}
                                    value={tpTarget}
                                    onValue={setTpTarget}
                                    options={[{ value: '', label: 'To coordinates…' }, ...props.online.filter((n) => n !== p.name).map((n) => ({ value: n, label: `To ${n}` }))]}
                                />
                                {tpTarget === '' ? (
                                    <>
                                        {(['x', 'y', 'z'] as const).map((axis) => (
                                            <Input key={axis} style={{ width: 90 }} value={tp[axis]} placeholder={axis.toUpperCase()}
                                                onValue={(v: string) => setTp({ ...tp, [axis]: v.replace(/[^0-9.\-]/g, '') })} />
                                        ))}
                                        {s?.position ? (
                                            <Button size='sm' variant='ghost' onClick={() => setTp({ x: String(s.position![0]), y: String(s.position![1]), z: String(s.position![2]) })}>
                                                Use last position
                                            </Button>
                                        ) : null}
                                    </>
                                ) : null}
                                <Button
                                    size='sm'
                                    disabled={!p.online || (tpTarget === '' && (tp.x === '' || tp.y === '' || tp.z === ''))}
                                    loading={busy === 'teleport'}
                                    onClick={() => run('teleport', tpTarget ? { target: tpTarget } : { x: Number(tp.x), y: Number(tp.y), z: Number(tp.z) }, `Teleported ${p.name}`)}
                                >
                                    Teleport
                                </Button>
                            </div>
                        </Card> : null}
                        {can('allow_give') ? <Card title='Experience'>
                            <div className='brf-row'>
                                <Input style={{ width: 110 }} value={xp} onValue={(v: string) => setXp(v.replace(/\D/g, ''))} placeholder='Levels' />
                                <Button size='sm' variant='sec' disabled={!xp} onClick={() => run('xp', { amount: Number(xp) }, `Gave ${xp} levels to ${p.name}`)}>Add levels</Button>
                                <Button size='sm' variant='sec' disabled={xp === ''} onClick={() => run('xp_set', { amount: Number(xp) }, `${p.name} is now level ${xp}`)}>Set level</Button>
                                <Button size='sm' variant='ghost' onClick={() => run('xp_set', { amount: 0 }, `Reset ${p.name}'s experience`)}>Reset</Button>
                            </div>
                        </Card> : null}
                        {can('allow_message') ? <Card title='On-screen title'>
                            <div className='brf-row'>
                                <Input style={{ flex: 1, minWidth: 140 }} value={title} onValue={setTitle} maxLength={120} placeholder='Title' />
                                <Input style={{ flex: 1, minWidth: 140 }} value={subtitle} onValue={setSubtitle} maxLength={120} placeholder='Subtitle (optional)' />
                                <Button size='sm' disabled={!title.trim() || !p.online} onClick={() => run('title', { message: title, subtitle }, 'Title shown')}>
                                    Show
                                </Button>
                            </div>
                        </Card> : null}
                        {can('allow_message') ? <Card title='Message'>
                            <div className='brf-row'>
                                <Input style={{ flex: 1 }} value={message} onValue={setMessage} maxLength={256} placeholder='Private message…' />
                                <Button size='sm' disabled={!message.trim()} onClick={() => run('tell', { message }, 'Message sent').then(() => setMessage(''))}>
                                    Send
                                </Button>
                            </div>
                        </Card> : null}
                        {can('allow_moderation') || props.overview.can_delete ? <Card title='Moderation'>
                            <div className='brf-col'>
                                <Input value={reason} onValue={setReason} maxLength={200} placeholder='Reason (optional)' />
                                <div className='brf-row'>
                                    {can('allow_moderation') ? <>
                                    <Button size='sm' variant='sec' disabled={!p.online} onClick={() => run('kick', { reason })}>Kick</Button>
                                    {p.banned ? (
                                        <Button size='sm' variant='ok' onClick={() => run('pardon')}>Unban</Button>
                                    ) : (
                                        <ConfirmButton size='sm' variant='danger' title={`Ban ${p.name}?`} message='The player is banned until you unban them.' confirmText='Ban' onConfirm={() => run('ban', { reason })}>
                                            Ban
                                        </ConfirmButton>
                                    )}
                                    {p.online ? (
                                        <ConfirmButton size='sm' variant='danger' title={`IP-ban ${p.name}?`} message='Bans the IP address the player is currently connected from.' confirmText='IP ban' onConfirm={() => run('ban_ip', { reason })}>
                                            IP ban
                                        </ConfirmButton>
                                    ) : null}
                                    </> : null}
                                    {props.overview.can_delete && p.uuid ? (
                                        <ConfirmButton
                                            size='sm'
                                            variant='danger'
                                            title='Wipe player data?'
                                            message='Deletes the player’s inventory, position, stats and advancements. The player should be offline. This cannot be undone.'
                                            confirmText='Wipe data'
                                            onConfirm={wipe}
                                        >
                                            Wipe data
                                        </ConfirmButton>
                                    ) : null}
                                </div>
                            </div>
                        </Card> : null}
                    </div>
                )
            ) : null}
        </Modal>
    );
}

const GAMERULE_LABELS: Record<string, string> = {
    keepInventory: 'Keep inventory on death',
    doDaylightCycle: 'Daylight cycle',
    doWeatherCycle: 'Weather cycle',
    mobGriefing: 'Mob griefing',
    doMobSpawning: 'Mob spawning',
    doInsomnia: 'Phantoms (insomnia)',
    announceAdvancements: 'Announce advancements',
    showDeathMessages: 'Death messages',
    doImmediateRespawn: 'Immediate respawn',
    naturalRegeneration: 'Natural regeneration',
};

function ServerTools(props: { overview: Overview; onChanged: () => void }) {
    const [broadcast, setBroadcast] = useState('');
    const [reason, setReason] = useState('');
    const [busy, setBusy] = useState<string | null>(null);
    const can = (k: string) => props.overview.allow?.[k] !== false;
    const online = props.overview.status.reachable;

    const send = async (key: string, action: string, extra: Record<string, any>, ok: string) => {
        setBusy(key);
        try {
            const r: any = await api('POST', base() + '/action', { action, ...extra });
            toastOk(r?.offline ? r.message : ok);
            props.onChanged();
        } catch (e: any) {
            toastErr(e.message);
        } finally {
            setBusy(null);
        }
    };

    if (!props.overview.can_console) {
        return <Alert kind='warn'>You need the console permission to use server tools.</Alert>;
    }
    if (!can('allow_world') && !can('allow_moderation')) {
        return <Alert kind='info'>Server tools are disabled by the administrator.</Alert>;
    }

    return (
        <div className='brf-col'>
            {!online ? <Alert kind='warn'>The server looks offline. Commands only work while it is running.</Alert> : null}
            {can('allow_world') ? (
                <>
                    <Card title='Broadcast' subtitle='Sends a chat message to every player (/say).'>
                        <div className='brf-row'>
                            <Input style={{ flex: 1, minWidth: 200 }} value={broadcast} onValue={setBroadcast} maxLength={256} placeholder='Message to everyone…' />
                            <Button size='sm' disabled={!broadcast.trim()} loading={busy === 'say'}
                                onClick={() => send('say', 'broadcast', { message: broadcast }, 'Broadcast sent').then(() => setBroadcast(''))}>
                                Send
                            </Button>
                        </div>
                    </Card>
                    <div className='brf-grid' style={{ ['--brf-min' as any]: '240px' }}>
                        <Card title='Weather'>
                            <div className='brf-row'>
                                {[['clear', '☀ Clear'], ['rain', '🌧 Rain'], ['thunder', '⛈ Thunder']].map(([v, l]) => (
                                    <Button key={v} size='sm' variant='sec' loading={busy === 'w' + v} onClick={() => send('w' + v, 'weather', { weather: v }, `Weather set to ${v}`)}>{l}</Button>
                                ))}
                            </div>
                        </Card>
                        <Card title='Time'>
                            <div className='brf-row'>
                                {['day', 'noon', 'night', 'midnight'].map((v) => (
                                    <Button key={v} size='sm' variant='sec' loading={busy === 't' + v} onClick={() => send('t' + v, 'time', { time: v }, `Time set to ${v}`)}>{v}</Button>
                                ))}
                            </div>
                        </Card>
                        <Card title='Difficulty'>
                            <div className='brf-row'>
                                {['peaceful', 'easy', 'normal', 'hard'].map((v) => (
                                    <Button key={v} size='sm' variant={props.overview.properties.difficulty === v ? 'primary' : 'sec'} loading={busy === 'd' + v}
                                        onClick={() => send('d' + v, 'difficulty', { difficulty: v }, `Difficulty set to ${v}`)}>{v}</Button>
                                ))}
                            </div>
                        </Card>
                        <Card title='World'>
                            <div className='brf-row'>
                                <Button size='sm' variant='sec' loading={busy === 'save'} onClick={() => send('save', 'save_all', {}, 'World saved')}>Save world now</Button>
                            </div>
                        </Card>
                    </div>
                    <Card title='Game rules' subtitle='Applied immediately to the running world.'>
                        <div className='brf-list'>
                            {Object.keys(GAMERULE_LABELS).map((rule) => (
                                <div key={rule} className='brf-item'>
                                    <div className='brf-grow'>
                                        <p className='brf-title'>{GAMERULE_LABELS[rule]}</p>
                                        <span className='brf-muted brf-mono'>{rule}</span>
                                    </div>
                                    <Button size='sm' variant='sec' loading={busy === rule + '1'} onClick={() => send(rule + '1', 'gamerule', { rule, value: true }, `${GAMERULE_LABELS[rule]}: on`)}>On</Button>
                                    <Button size='sm' variant='ghost' loading={busy === rule + '0'} onClick={() => send(rule + '0', 'gamerule', { rule, value: false }, `${GAMERULE_LABELS[rule]}: off`)}>Off</Button>
                                </div>
                            ))}
                        </div>
                    </Card>
                </>
            ) : null}
            {can('allow_moderation') ? (
                <Card title='Kick everyone'>
                    <div className='brf-row'>
                        <Input style={{ flex: 1, minWidth: 200 }} value={reason} onValue={setReason} maxLength={200} placeholder='Reason (optional)' />
                        <ConfirmButton size='sm' variant='danger' title='Kick all players?' message='Every online player is disconnected.' confirmText='Kick all'
                            onConfirm={() => send('kickall', 'kick_all', { reason }, 'All players kicked')}>
                            Kick all
                        </ConfirmButton>
                    </div>
                </Card>
            ) : null}
        </div>
    );
}

interface PropsData {
    properties: Record<string, { type: string; value: string | null }>;
    can_edit: boolean;
}

const PROPERTY_LABELS: Record<string, string> = {
    motd: 'Message of the day (MOTD)',
    'max-players': 'Max players',
    difficulty: 'Difficulty',
    gamemode: 'Default gamemode',
    pvp: 'PvP',
    hardcore: 'Hardcore',
    'white-list': 'Whitelist',
    'enforce-whitelist': 'Enforce whitelist (kick non-whitelisted players)',
    'enable-query': 'Query (full online player list)',
    'allow-flight': 'Allow flight',
    'allow-nether': 'Allow the Nether',
    'spawn-monsters': 'Spawn monsters',
    'spawn-protection': 'Spawn protection radius',
    'view-distance': 'View distance (chunks)',
    'simulation-distance': 'Simulation distance (chunks)',
    'online-mode': 'Online mode (check Mojang accounts; off = offline/cracked mode)',
};

function PropertiesEditor() {
    const [data, setData] = useState<PropsData | null>(null);
    const [values, setValues] = useState<Record<string, string>>({});
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const load = () =>
        api<PropsData>('GET', base() + '/properties')
            .then((d) => {
                setData(d);
                setValues(Object.fromEntries(Object.entries(d.properties).map(([k, v]) => [k, v.value ?? ''])));
            })
            .catch((e) => setError(e.message));

    useEffect(() => {
        load();
    }, []);

    if (error) return <Alert kind='err'>{error}</Alert>;
    if (!data) return <Loading />;

    const changed = Object.keys(values).filter((k) => (data.properties[k]?.value ?? '') !== values[k]);

    const save = async () => {
        setSaving(true);
        try {
            await api('POST', base() + '/properties', { properties: Object.fromEntries(changed.map((k) => [k, values[k]])) });
            toastOk('server.properties saved. Restart the server to apply the changes.');
            await load();
        } catch (e: any) {
            toastErr(e.message);
        } finally {
            setSaving(false);
        }
    };

    return (
        <Card
            title='server.properties'
            subtitle='Most changes apply after the next restart.'
            actions={
                data.can_edit ? (
                    <Button size='sm' disabled={changed.length === 0} loading={saving} onClick={save}>
                        Save {changed.length ? `(${changed.length})` : ''}
                    </Button>
                ) : (
                    <Badge kind='warn'>Read only</Badge>
                )
            }
        >
            <div className='brf-grid' style={{ ['--brf-min' as any]: '260px' }}>
                {/* Keys missing from the file are not used by this Minecraft version (e.g. pvp moved to a game rule). */}
                {Object.entries(data.properties).filter(([, def]) => def.value !== null).map(([key, def]) => {
                    const [type, a] = def.type.split(':');
                    const label = PROPERTY_LABELS[key] ?? key;
                    const set = (v: string) => setValues({ ...values, [key]: v });
                    if (type === 'bool') {
                        return (
                            <Field key={key} label={label} hint={key}>
                                <Select disabled={!data.can_edit} value={values[key] || 'false'} onValue={set} options={[{ value: 'true', label: 'On' }, { value: 'false', label: 'Off' }]} />
                            </Field>
                        );
                    }
                    if (type === 'enum') {
                        return (
                            <Field key={key} label={label} hint={key}>
                                <Select disabled={!data.can_edit} value={values[key]} onValue={set} options={a.split(',')} />
                            </Field>
                        );
                    }
                    return (
                        <Field key={key} label={label} hint={key}>
                            <Input disabled={!data.can_edit} value={values[key]} maxLength={type === 'string' ? 200 : 6}
                                onValue={(v: string) => set(type === 'int' ? v.replace(/\D/g, '') : v)} />
                        </Field>
                    );
                })}
            </div>
        </Card>
    );
}

export default function PlayersPage() {
    const [view, setView] = useState('players');
    const [overview, setOverview] = useState<Overview | null>(null);
    const [players, setPlayers] = useState<{ players: Player[]; banned_ips: any[]; full_list: boolean } | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [filter, setFilter] = useState('all');
    const [search, setSearch] = useState('');
    const [selected, setSelected] = useState<Player | null>(null);
    const [addName, setAddName] = useState('');
    const [ip, setIp] = useState('');

    const load = () => {
        api<Overview>('GET', base() + '/overview')
            .then(setOverview)
            .catch((e) => setError(e.message));
        api('GET', base() + '/players')
            .then(setPlayers)
            .catch((e) => toastErr(e.message));
    };

    useEffect(() => {
        load();
        const t = setInterval(load, 30000);
        return () => clearInterval(t);
    }, []);

    const refreshSoon = () => setTimeout(load, 1500);

    const command = async (action: string, extra: Record<string, any>, ok: string) => {
        try {
            const r: any = await api('POST', base() + '/action', { action, ...extra });
            toastOk(r?.offline ? r.message : ok);
            refreshSoon();
        } catch (e: any) {
            toastErr(e.message);
        }
    };

    const shown = useMemo(() => {
        if (!players) return [];
        const q = search.trim().toLowerCase();
        return players.players.filter((p) => {
            if (q && !(p.name ?? '').toLowerCase().includes(q) && !(p.uuid ?? '').includes(q)) return false;
            switch (filter) {
                case 'online': return p.online;
                case 'ops': return !!p.op;
                case 'whitelist': return p.whitelisted;
                case 'banned': return !!p.banned;
                default: return true;
            }
        });
    }, [players, filter, search]);

    const counts = players
        ? {
              all: players.players.length,
              online: players.players.filter((p) => p.online).length,
              ops: players.players.filter((p) => p.op).length,
              whitelist: players.players.filter((p) => p.whitelisted).length,
              banned: players.players.filter((p) => p.banned).length,
          }
        : null;

    const st = overview?.status;

    return (
        <Page
            title='Players'
            subtitle='Online players, inventories, statistics and moderation.'
            letter='P'
            actions={
                <Button variant='sec' size='sm' onClick={load}>
                    Refresh
                </Button>
            }
        >
            {error ? <Alert kind='err'>{error}</Alert> : null}
            {!overview && !error ? <Loading /> : null}
            {overview && st ? (
                <>
                    <div className='brf-grid' style={{ ['--brf-min' as any]: '180px', marginBottom: 14 }}>
                        <div className='brf-stat'>
                            <span>Status</span>
                            <b style={{ color: st.reachable ? 'var(--brf-ok)' : 'var(--brf-err)' }}>{st.reachable ? 'Online' : 'Offline'}</b>
                            <span>{st.reachable ? `${st.latency} ms · ${st.version ?? ''}` : st.error}</span>
                        </div>
                        <div className='brf-stat'>
                            <span>Players online</span>
                            <b>
                                {st.online} / {st.max || overview.properties.max_players}
                            </b>
                            <span>{st.reachable && !st.full_list && st.online > 12 ? 'Enable query for the full list' : overview.address}</span>
                        </div>
                        <div className='brf-stat'>
                            <span>Whitelist</span>
                            <b>{overview.properties.whitelist ? 'On' : 'Off'}</b>
                            {overview.can_console ? (
                                <span>
                                    <a
                                        href='#'
                                        onClick={(e: any) => {
                                            e.preventDefault();
                                            command(overview.properties.whitelist ? 'whitelist_off' : 'whitelist_on', {}, `Whitelist turned ${overview.properties.whitelist ? 'off' : 'on'}`);
                                        }}
                                    >
                                        Turn {overview.properties.whitelist ? 'off' : 'on'}
                                    </a>
                                </span>
                            ) : null}
                        </div>
                        <div className='brf-stat'>
                            <span>World</span>
                            <b style={{ fontSize: 16 }}>{overview.world}</b>
                            <span>
                                {overview.properties.gamemode ?? ''} · {overview.properties.difficulty ?? ''} · {overview.properties.online_mode ? 'online mode' : 'offline mode'}
                            </span>
                            {overview.can_update && overview.allow?.allow_properties !== false ? (
                                <span>
                                    <ConfirmButton
                                        size='sm'
                                        variant='ghost'
                                        title={overview.properties.online_mode ? 'Turn offline mode on?' : 'Turn online mode back on?'}
                                        message={overview.properties.online_mode
                                            ? 'Players will no longer be checked against Mojang accounts (cracked clients can join). Player UUIDs change, so existing players start with new inventories, op and whitelist entries. Restart the server to apply.'
                                            : 'Only real Minecraft accounts can join again. Offline-mode player data is kept but belongs to different UUIDs. Restart the server to apply.'}
                                        confirmText={overview.properties.online_mode ? 'Turn offline mode on' : 'Turn online mode on'}
                                        onConfirm={async () => {
                                            try {
                                                await api('POST', base() + '/properties', { properties: { 'online-mode': overview.properties.online_mode ? 'false' : 'true' } });
                                                toastOk(`Online mode ${overview.properties.online_mode ? 'off' : 'on'}. Restart the server to apply.`);
                                                load();
                                            } catch (e: any) {
                                                toastErr(e.message);
                                            }
                                        }}
                                    >
                                        {overview.properties.online_mode ? 'Offline mode: turn on' : 'Online mode: turn on'}
                                    </ConfirmButton>
                                </span>
                            ) : null}
                        </div>
                    </div>
                    {st.motd ? <Alert kind='info'>{st.motd}</Alert> : null}

                    <Tabs
                        value={view}
                        onValue={setView}
                        tabs={[
                            { key: 'players', label: 'Players' },
                            { key: 'tools', label: 'Server tools' },
                            { key: 'properties', label: 'Server settings' },
                        ]}
                    />
                    {view === 'tools' ? <ServerTools overview={overview} onChanged={refreshSoon} /> : null}
                    {view === 'properties' ? <PropertiesEditor /> : null}

                    {view === 'players' ? <>
                    {overview.can_console ? (
                        <Card style={{ marginBottom: 14 }}>
                            <div className='brf-row'>
                                <Input style={{ flex: 1, minWidth: 160 }} value={addName} onValue={setAddName} placeholder='Player name' maxLength={32} />
                                <Button size='sm' variant='sec' disabled={!addName} onClick={() => command('whitelist_add', { name: addName.trim() }, `${addName} whitelisted`)}>Whitelist</Button>
                                <Button size='sm' variant='sec' disabled={!addName} onClick={() => command('op', { name: addName.trim() }, `${addName} is now an operator`)}>Op</Button>
                                <Button size='sm' variant='danger' disabled={!addName} onClick={() => command('ban', { name: addName.trim() }, `${addName} banned`)}>Ban</Button>
                                <Input style={{ width: 170 }} value={ip} onValue={setIp} placeholder='IP address' />
                                <Button size='sm' variant='danger' disabled={!ip} onClick={() => command('ban_ip', { ip: ip.trim() }, `${ip} banned`)}>Ban IP</Button>
                            </div>
                        </Card>
                    ) : null}

                    <Tabs
                        value={filter}
                        onValue={setFilter}
                        tabs={[
                            { key: 'all', label: `All (${counts?.all ?? 0})` },
                            { key: 'online', label: `Online (${counts?.online ?? 0})` },
                            { key: 'ops', label: `Operators (${counts?.ops ?? 0})` },
                            { key: 'whitelist', label: `Whitelisted (${counts?.whitelist ?? 0})` },
                            { key: 'banned', label: `Banned (${counts?.banned ?? 0})` },
                            { key: 'ips', label: `Banned IPs (${players?.banned_ips.length ?? 0})` },
                        ]}
                    />

                    {filter === 'ips' ? (
                        !players || players.banned_ips.length === 0 ? (
                            <Empty title='No banned IPs' />
                        ) : (
                            <div className='brf-list'>
                                {players.banned_ips.map((b) => (
                                    <div key={b.ip} className='brf-item'>
                                        <div className='brf-grow'>
                                            <p className='brf-title brf-mono'>{b.ip}</p>
                                            <span className='brf-muted'>
                                                {b.reason ?? 'No reason'} · by {b.source ?? 'Server'} · expires {b.expires}
                                            </span>
                                        </div>
                                        {overview.can_console ? (
                                            <Button size='sm' variant='ok' onClick={() => command('pardon_ip', { ip: b.ip }, `${b.ip} unbanned`)}>
                                                Unban
                                            </Button>
                                        ) : null}
                                    </div>
                                ))}
                            </div>
                        )
                    ) : (
                        <>
                            <Input style={{ marginBottom: 12 }} value={search} onValue={setSearch} placeholder='Search players…' />
                            {!players ? (
                                <Loading />
                            ) : shown.length === 0 ? (
                                <Empty title='No players' text='Players appear here after they join the server.' />
                            ) : (
                                <div className='brf-list'>
                                    {shown.map((p) => (
                                        <div key={(p.uuid ?? '') + (p.name ?? '')} className='brf-item brf-click' onClick={() => setSelected(p)}>
                                            <img src={avatar(p)} width={32} height={32} style={{ borderRadius: 6, imageRendering: 'pixelated' }} alt='' loading='lazy' />
                                            <div className='brf-grow'>
                                                <p className='brf-title'>{p.name ?? p.uuid}</p>
                                                <span className='brf-muted'>{p.online ? 'Playing now' : p.last_seen ? 'Last seen ' + timeAgo(p.last_seen) : 'Never seen'}</span>
                                            </div>
                                            {p.online ? <Badge kind='ok'>online</Badge> : null}
                                            {p.op ? <Badge kind='pri'>op</Badge> : null}
                                            {p.whitelisted ? <Badge>whitelist</Badge> : null}
                                            {p.banned ? <Badge kind='err'>banned</Badge> : null}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </>
                    )}
                    </> : null}
                </>
            ) : null}
            {selected && overview ? (
                <PlayerModal
                    player={selected}
                    overview={overview}
                    online={(players?.players ?? []).filter((x) => x.online && x.name).map((x) => x.name as string)}
                    onClose={() => setSelected(null)}
                    onChanged={refreshSoon}
                />
            ) : null}
        </Page>
    );
}
