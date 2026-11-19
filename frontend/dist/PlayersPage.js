const React = window.React;
if (!React) throw new Error('window.React is not available for extension module rendering.');

import { Alert, Badge, Button, Card, ConfirmButton, Empty, Field, Input, Loading, Modal, Page, Select, Tabs, api, getServerId, timeAgo, toastErr, toastOk, } from './breefer-ui.js';
import InventoryManager from './InventoryManager.js';
const { useState, useEffect, useMemo } = React;
const base = () => `/api/client/extensions/breefer-player-manager/servers/${getServerId()}`;
// 3D isometric player heads
const avatar = (p, size = 32) => `https://mc-heads.net/head/${encodeURIComponent(p.uuid ?? p.name ?? 'MHF_Steve')}/${size * 2}`;
const pretty = (id) => id.replace(/^minecraft:/, '').replace(/_/g, ' ');
function PlayerModal(props) {
    const p = props.player;
    const [details, setDetails] = useState(null);
    const [tab, setTab] = useState('overview');
    const [reason, setReason] = useState('');
    const [item, setItem] = useState('minecraft:diamond');
    const [amount, setAmount] = useState('1');
    const [effect, setEffect] = useState('minecraft:speed');
    const [duration, setDuration] = useState('60');
    const [amplifier, setAmplifier] = useState('0');
    const [message, setMessage] = useState('');
    const [busy, setBusy] = useState(null);
    const [tpTarget, setTpTarget] = useState('');
    const [tp, setTp] = useState({ x: '', y: '', z: '' });
    const [xp, setXp] = useState('');
    const [title, setTitle] = useState('');
    const [subtitle, setSubtitle] = useState('');
    const [reloading, setReloading] = useState(false);
    // Online players: the server saves its player data first, so inventory and position are current.
    const loadDetails = (fresh) => {
        if (!p.uuid)
            return Promise.resolve();
        setReloading(true);
        return api('GET', `${base()}/players/${p.uuid}${fresh ? '?fresh=1' : ''}`)
            .then(setDetails)
            .catch((e) => toastErr(e.message))
            .finally(() => setReloading(false));
    };
    useEffect(() => {
        loadDetails(p.online && props.overview.can_console);
    }, [p.uuid]);
    const run = async (action, extra = {}, success) => {
        setBusy(action);
        try {
            const r = await api('POST', base() + '/action', { action, name: p.name, ...extra });
            toastOk(r?.offline ? r.message : success ?? `Sent: ${action.replace('_', ' ')} ${p.name}`);
            props.onChanged();
        }
        catch (e) {
            toastErr(e.message);
        }
        finally {
            setBusy(null);
        }
    };
    const wipe = async () => {
        try {
            const r = await api('POST', `${base()}/players/${p.uuid}/wipe`);
            toastOk(`Deleted ${r.deleted.length} file(s) for ${p.name ?? p.uuid}.`);
            props.onChanged();
            props.onClose();
        }
        catch (e) {
            toastErr(e.message);
        }
    };
    const s = details?.summary;
    const can = (k) => props.overview.allow?.[k] !== false;
    const canAct = props.overview.can_console && !!p.name;
    // Live edits need the console (and a name for the commands); offline edits change the player file.
    const editable = can('allow_inventory_edit') && (p.online ? props.overview.can_console && !!p.name : props.overview.can_update !== false);
    const editHint = !can('allow_inventory_edit')
        ? 'Inventory editing is disabled by the administrator.'
        : p.online
            ? 'Editing an online player needs the console permission.'
            : 'Editing an offline player needs the file update permission.';
    return (React.createElement(Modal, { open: true, onClose: props.onClose, width: 760 },
        React.createElement("div", { className: 'brf-row', style: { gap: 14, marginBottom: 14 } },
            React.createElement("img", { src: avatar(p, 64), width: 56, height: 56, style: { borderRadius: 8, imageRendering: 'pixelated' }, alt: '' }),
            React.createElement("div", { className: 'brf-grow' },
                React.createElement("h3", { style: { margin: 0 } }, p.name ?? 'Unknown player'),
                React.createElement("span", { className: 'brf-muted brf-mono' }, p.uuid),
                React.createElement("div", { className: 'brf-row', style: { gap: 6, marginTop: 4 } },
                    p.online ? React.createElement(Badge, { kind: 'ok' }, "online") : React.createElement(Badge, null, "offline"),
                    p.op ? React.createElement(Badge, { kind: 'pri' },
                        "op ",
                        p.op) : null,
                    p.whitelisted ? React.createElement(Badge, { kind: 'ok' }, "whitelisted") : null,
                    p.banned ? React.createElement(Badge, { kind: 'err' }, "banned") : null,
                    s?.gamemode ? React.createElement(Badge, null, s.gamemode) : null)),
            p.uuid ? (React.createElement(Button, { size: 'sm', variant: 'ghost', loading: reloading, onClick: () => loadDetails(p.online && props.overview.can_console), title: 'Reload the saved player data' }, "Reload")) : null),
        React.createElement(Tabs, { value: tab, onValue: setTab, tabs: [
                { key: 'overview', label: 'Overview' },
                { key: 'inventory', label: 'Inventory' },
                { key: 'stats', label: 'Statistics' },
                { key: 'actions', label: 'Actions' },
            ] }),
        !p.uuid ? React.createElement(Alert, { kind: 'info' }, "This player has no UUID on record yet, so saved data is unavailable.") : null,
        p.uuid && !details && tab !== 'actions' ? React.createElement(Loading, null) : null,
        details?.error && tab !== 'actions' && tab !== 'stats' ? React.createElement(Alert, { kind: 'info' }, details.error) : null,
        tab === 'overview' && s ? (React.createElement("div", { className: 'brf-col' },
            React.createElement("div", { className: 'brf-grid', style: { ['--brf-min']: '150px' } },
                React.createElement("div", { className: 'brf-stat' },
                    React.createElement("span", null, "Health"),
                    React.createElement("b", null,
                        "\u2764 ",
                        s.health ?? '—',
                        " / 20")),
                React.createElement("div", { className: 'brf-stat' },
                    React.createElement("span", null, "Food"),
                    React.createElement("b", null,
                        "\uD83C\uDF57 ",
                        s.food ?? '—',
                        " / 20")),
                React.createElement("div", { className: 'brf-stat' },
                    React.createElement("span", null, "Experience"),
                    React.createElement("b", null,
                        "Lvl ",
                        s.xp_level ?? 0)),
                React.createElement("div", { className: 'brf-stat' },
                    React.createElement("span", null, "Location"),
                    React.createElement("b", { style: { fontSize: 15 } }, s.position ? s.position.join(', ') : '—'),
                    React.createElement("span", null, s.dimension ? pretty(s.dimension) : ''))),
            s.effects.length ? (React.createElement("div", { className: 'brf-row' }, s.effects.map((e, i) => (React.createElement(Badge, { key: i, kind: 'pri' },
                pretty(String(e.id)),
                " ",
                e.amplifier + 1,
                " \u00B7 ",
                Math.round(e.duration / 20),
                "s"))))) : (React.createElement("span", { className: 'brf-muted' }, "No active effects.")),
            p.banned ? (React.createElement(Alert, { kind: 'err', style: { marginBottom: 0 } },
                "Banned by ",
                p.banned.source ?? 'Server',
                ": ",
                p.banned.reason ?? 'no reason',
                " (expires ",
                p.banned.expires,
                ")")) : null)) : null,
        tab === 'inventory' && details?.inventory_hidden ? React.createElement(Alert, { kind: 'info' }, "Inventory viewing is disabled by the administrator.") : null,
        tab === 'inventory' && details && !details.error && !details.inventory_hidden && p.uuid ? (React.createElement(InventoryManager, { uuid: p.uuid, name: p.name, online: p.online, inventory: details.inventory, ender: details.ender_chest, equipment: details.equipment, canEdit: editable, editHint: editHint, onChanged: () => loadDetails(p.online && props.overview.can_console) })) : null,
        tab === 'stats' && details ? (details.stats ? (React.createElement("div", { className: 'brf-col' },
            React.createElement("div", { className: 'brf-grid', style: { ['--brf-min']: '140px' } }, [
                ['Play time', details.stats.play_time_hours + ' h'],
                ['Deaths', details.stats.deaths],
                ['Mob kills', details.stats.mob_kills],
                ['Player kills', details.stats.player_kills],
                ['Distance', details.stats.distance_km + ' km'],
                ['Jumps', details.stats.jumps],
                ['Blocks mined', details.stats.blocks_mined],
                ['Items crafted', details.stats.items_crafted],
            ].map(([label, value]) => (React.createElement("div", { key: String(label), className: 'brf-stat' },
                React.createElement("span", null, label),
                React.createElement("b", null, String(value)))))),
            React.createElement("div", { className: 'brf-grid', style: { ['--brf-min']: '260px' } }, [
                ['Most mined', details.stats.top_mined],
                ['Most killed', details.stats.top_killed],
            ].map(([label, list]) => (React.createElement("div", { key: label },
                React.createElement("b", null, label),
                list.length === 0 ? (React.createElement("div", { className: 'brf-muted' }, "Nothing yet.")) : (list.map((e) => (React.createElement("div", { key: e.id, className: 'brf-row brf-between' },
                    React.createElement("span", null, pretty(e.id)),
                    React.createElement("span", { className: 'brf-muted' }, e.count))))))))))) : (React.createElement(Empty, { title: 'No statistics', text: 'Stats are written when the player has played on this world.' }))) : null,
        tab === 'actions' ? (!canAct ? (React.createElement(Alert, { kind: 'warn' }, "You need console permission (and a known player name) to run actions.")) : (React.createElement("div", { className: 'brf-col' },
            !props.overview.status.reachable ? (React.createElement(Alert, { kind: 'info', style: { marginBottom: 0 } }, "The server looks stopped. Whitelist, operator and ban changes are written to the server files and apply on the next start; the other actions need the server running.")) : !p.online ? (React.createElement(Alert, { kind: 'info', style: { marginBottom: 0 } },
                p.name,
                " is offline. Whitelist, operator and ban actions work; in-game actions (teleport, items, effects, messages) need the player online.")) : null,
            React.createElement("div", { className: 'brf-row' },
                can('allow_whitelist') ? React.createElement(Button, { size: 'sm', variant: 'sec', loading: busy === (p.whitelisted ? 'whitelist_remove' : 'whitelist_add'), onClick: () => run(p.whitelisted ? 'whitelist_remove' : 'whitelist_add') }, p.whitelisted ? 'Remove from whitelist' : 'Add to whitelist') : null,
                can('allow_op') ? React.createElement(Button, { size: 'sm', variant: 'sec', loading: busy === (p.op ? 'deop' : 'op'), onClick: () => run(p.op ? 'deop' : 'op') }, p.op ? 'Remove operator' : 'Make operator') : null,
                can('allow_gamemode') && ['survival', 'creative', 'adventure', 'spectator'].map((g) => (React.createElement(Button, { key: g, size: 'sm', variant: s?.gamemode === g ? 'primary' : 'ghost', onClick: () => run('gamemode', { gamemode: g }, `${p.name} is now in ${g}`) }, g)))),
            React.createElement("div", { className: 'brf-row' },
                can('allow_effects') ? React.createElement(React.Fragment, null,
                    React.createElement(Button, { size: 'sm', variant: 'ghost', onClick: () => run('heal', {}, `Healed ${p.name}`) }, "Heal"),
                    React.createElement(Button, { size: 'sm', variant: 'ghost', onClick: () => run('feed', {}, `Fed ${p.name}`) }, "Feed"),
                    React.createElement(Button, { size: 'sm', variant: 'ghost', onClick: () => run('effect_clear', {}, `Cleared effects of ${p.name}`) }, "Clear effects")) : null,
                can('allow_destructive') ? React.createElement(React.Fragment, null,
                    React.createElement(ConfirmButton, { size: 'sm', variant: 'ghost', title: 'Clear inventory?', message: `Everything in ${p.name}'s inventory will be removed.`, confirmText: 'Clear', onConfirm: () => run('clear') }, "Clear inventory"),
                    React.createElement(ConfirmButton, { size: 'sm', variant: 'ghost', title: 'Kill player?', message: `${p.name} will be killed in-game.`, confirmText: 'Kill', onConfirm: () => run('kill') }, "Kill")) : null),
            can('allow_give') ? React.createElement(Card, { title: 'Give item' },
                React.createElement("div", { className: 'brf-row' },
                    React.createElement(Input, { style: { flex: 2 }, value: item, onValue: setItem, placeholder: 'minecraft:diamond' }),
                    React.createElement(Input, { style: { width: 90 }, value: amount, onValue: (v) => setAmount(v.replace(/\D/g, '')) }),
                    React.createElement(Button, { size: 'sm', onClick: () => run('give', { item: item.trim(), amount: Number(amount || 1) }, `Gave ${amount} ${pretty(item)} to ${p.name}`) }, "Give"))) : null,
            can('allow_effects') ? React.createElement(Card, { title: 'Apply effect' },
                React.createElement("div", { className: 'brf-row' },
                    React.createElement(Input, { style: { flex: 2 }, value: effect, onValue: setEffect, placeholder: 'minecraft:speed' }),
                    React.createElement(Field, { label: 'Seconds', style: { width: 90 } },
                        React.createElement(Input, { value: duration, onValue: (v) => setDuration(v.replace(/\D/g, '')) })),
                    React.createElement(Field, { label: 'Level', style: { width: 80 } },
                        React.createElement(Input, { value: amplifier, onValue: (v) => setAmplifier(v.replace(/\D/g, '')) })),
                    React.createElement(Button, { size: 'sm', onClick: () => run('effect', { effect: effect.trim(), duration: Number(duration || 30), amplifier: Number(amplifier || 0) }) }, "Apply"))) : null,
            can('allow_teleport') ? React.createElement(Card, { title: 'Teleport', subtitle: 'The player must be online.' },
                React.createElement("div", { className: 'brf-row' },
                    React.createElement(Select, { style: { minWidth: 160 }, value: tpTarget, onValue: setTpTarget, options: [{ value: '', label: 'To coordinates…' }, ...props.online.filter((n) => n !== p.name).map((n) => ({ value: n, label: `To ${n}` }))] }),
                    tpTarget === '' ? (React.createElement(React.Fragment, null,
                        ['x', 'y', 'z'].map((axis) => (React.createElement(Input, { key: axis, style: { width: 90 }, value: tp[axis], placeholder: axis.toUpperCase(), onValue: (v) => setTp({ ...tp, [axis]: v.replace(/[^0-9.\-]/g, '') }) }))),
                        s?.position ? (React.createElement(Button, { size: 'sm', variant: 'ghost', onClick: () => setTp({ x: String(s.position[0]), y: String(s.position[1]), z: String(s.position[2]) }) }, "Use last position")) : null)) : null,
                    React.createElement(Button, { size: 'sm', disabled: !p.online || (tpTarget === '' && (tp.x === '' || tp.y === '' || tp.z === '')), loading: busy === 'teleport', onClick: () => run('teleport', tpTarget ? { target: tpTarget } : { x: Number(tp.x), y: Number(tp.y), z: Number(tp.z) }, `Teleported ${p.name}`) }, "Teleport"))) : null,
            can('allow_give') ? React.createElement(Card, { title: 'Experience' },
                React.createElement("div", { className: 'brf-row' },
                    React.createElement(Input, { style: { width: 110 }, value: xp, onValue: (v) => setXp(v.replace(/\D/g, '')), placeholder: 'Levels' }),
                    React.createElement(Button, { size: 'sm', variant: 'sec', disabled: !xp, onClick: () => run('xp', { amount: Number(xp) }, `Gave ${xp} levels to ${p.name}`) }, "Add levels"),
                    React.createElement(Button, { size: 'sm', variant: 'sec', disabled: xp === '', onClick: () => run('xp_set', { amount: Number(xp) }, `${p.name} is now level ${xp}`) }, "Set level"),
                    React.createElement(Button, { size: 'sm', variant: 'ghost', onClick: () => run('xp_set', { amount: 0 }, `Reset ${p.name}'s experience`) }, "Reset"))) : null,
            can('allow_message') ? React.createElement(Card, { title: 'On-screen title' },
                React.createElement("div", { className: 'brf-row' },
                    React.createElement(Input, { style: { flex: 1, minWidth: 140 }, value: title, onValue: setTitle, maxLength: 120, placeholder: 'Title' }),
                    React.createElement(Input, { style: { flex: 1, minWidth: 140 }, value: subtitle, onValue: setSubtitle, maxLength: 120, placeholder: 'Subtitle (optional)' }),
                    React.createElement(Button, { size: 'sm', disabled: !title.trim() || !p.online, onClick: () => run('title', { message: title, subtitle }, 'Title shown') }, "Show"))) : null,
            can('allow_message') ? React.createElement(Card, { title: 'Message' },
                React.createElement("div", { className: 'brf-row' },
                    React.createElement(Input, { style: { flex: 1 }, value: message, onValue: setMessage, maxLength: 256, placeholder: 'Private message\u2026' }),
                    React.createElement(Button, { size: 'sm', disabled: !message.trim(), onClick: () => run('tell', { message }, 'Message sent').then(() => setMessage('')) }, "Send"))) : null,
            can('allow_moderation') || props.overview.can_delete ? React.createElement(Card, { title: 'Moderation' },
                React.createElement("div", { className: 'brf-col' },
                    React.createElement(Input, { value: reason, onValue: setReason, maxLength: 200, placeholder: 'Reason (optional)' }),
                    React.createElement("div", { className: 'brf-row' },
                        can('allow_moderation') ? React.createElement(React.Fragment, null,
                            React.createElement(Button, { size: 'sm', variant: 'sec', disabled: !p.online, onClick: () => run('kick', { reason }) }, "Kick"),
                            p.banned ? (React.createElement(Button, { size: 'sm', variant: 'ok', onClick: () => run('pardon') }, "Unban")) : (React.createElement(ConfirmButton, { size: 'sm', variant: 'danger', title: `Ban ${p.name}?`, message: 'The player is banned until you unban them.', confirmText: 'Ban', onConfirm: () => run('ban', { reason }) }, "Ban")),
                            p.online ? (React.createElement(ConfirmButton, { size: 'sm', variant: 'danger', title: `IP-ban ${p.name}?`, message: 'Bans the IP address the player is currently connected from.', confirmText: 'IP ban', onConfirm: () => run('ban_ip', { reason }) }, "IP ban")) : null) : null,
                        props.overview.can_delete && p.uuid ? (React.createElement(ConfirmButton, { size: 'sm', variant: 'danger', title: 'Wipe player data?', message: 'Deletes the player\u2019s inventory, position, stats and advancements. The player should be offline. This cannot be undone.', confirmText: 'Wipe data', onConfirm: wipe }, "Wipe data")) : null))) : null))) : null));
}
const GAMERULE_LABELS = {
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
function ServerTools(props) {
    const [broadcast, setBroadcast] = useState('');
    const [reason, setReason] = useState('');
    const [busy, setBusy] = useState(null);
    const can = (k) => props.overview.allow?.[k] !== false;
    const online = props.overview.status.reachable;
    const send = async (key, action, extra, ok) => {
        setBusy(key);
        try {
            const r = await api('POST', base() + '/action', { action, ...extra });
            toastOk(r?.offline ? r.message : ok);
            props.onChanged();
        }
        catch (e) {
            toastErr(e.message);
        }
        finally {
            setBusy(null);
        }
    };
    if (!props.overview.can_console) {
        return React.createElement(Alert, { kind: 'warn' }, "You need the console permission to use server tools.");
    }
    if (!can('allow_world') && !can('allow_moderation')) {
        return React.createElement(Alert, { kind: 'info' }, "Server tools are disabled by the administrator.");
    }
    return (React.createElement("div", { className: 'brf-col' },
        !online ? React.createElement(Alert, { kind: 'warn' }, "The server looks offline. Commands only work while it is running.") : null,
        can('allow_world') ? (React.createElement(React.Fragment, null,
            React.createElement(Card, { title: 'Broadcast', subtitle: 'Sends a chat message to every player (/say).' },
                React.createElement("div", { className: 'brf-row' },
                    React.createElement(Input, { style: { flex: 1, minWidth: 200 }, value: broadcast, onValue: setBroadcast, maxLength: 256, placeholder: 'Message to everyone\u2026' }),
                    React.createElement(Button, { size: 'sm', disabled: !broadcast.trim(), loading: busy === 'say', onClick: () => send('say', 'broadcast', { message: broadcast }, 'Broadcast sent').then(() => setBroadcast('')) }, "Send"))),
            React.createElement("div", { className: 'brf-grid', style: { ['--brf-min']: '240px' } },
                React.createElement(Card, { title: 'Weather' },
                    React.createElement("div", { className: 'brf-row' }, [['clear', '☀ Clear'], ['rain', '🌧 Rain'], ['thunder', '⛈ Thunder']].map(([v, l]) => (React.createElement(Button, { key: v, size: 'sm', variant: 'sec', loading: busy === 'w' + v, onClick: () => send('w' + v, 'weather', { weather: v }, `Weather set to ${v}`) }, l))))),
                React.createElement(Card, { title: 'Time' },
                    React.createElement("div", { className: 'brf-row' }, ['day', 'noon', 'night', 'midnight'].map((v) => (React.createElement(Button, { key: v, size: 'sm', variant: 'sec', loading: busy === 't' + v, onClick: () => send('t' + v, 'time', { time: v }, `Time set to ${v}`) }, v))))),
                React.createElement(Card, { title: 'Difficulty' },
                    React.createElement("div", { className: 'brf-row' }, ['peaceful', 'easy', 'normal', 'hard'].map((v) => (React.createElement(Button, { key: v, size: 'sm', variant: props.overview.properties.difficulty === v ? 'primary' : 'sec', loading: busy === 'd' + v, onClick: () => send('d' + v, 'difficulty', { difficulty: v }, `Difficulty set to ${v}`) }, v))))),
                React.createElement(Card, { title: 'World' },
                    React.createElement("div", { className: 'brf-row' },
                        React.createElement(Button, { size: 'sm', variant: 'sec', loading: busy === 'save', onClick: () => send('save', 'save_all', {}, 'World saved') }, "Save world now")))),
            React.createElement(Card, { title: 'Game rules', subtitle: 'Applied immediately to the running world.' },
                React.createElement("div", { className: 'brf-list' }, Object.keys(GAMERULE_LABELS).map((rule) => (React.createElement("div", { key: rule, className: 'brf-item' },
                    React.createElement("div", { className: 'brf-grow' },
                        React.createElement("p", { className: 'brf-title' }, GAMERULE_LABELS[rule]),
                        React.createElement("span", { className: 'brf-muted brf-mono' }, rule)),
                    React.createElement(Button, { size: 'sm', variant: 'sec', loading: busy === rule + '1', onClick: () => send(rule + '1', 'gamerule', { rule, value: true }, `${GAMERULE_LABELS[rule]}: on`) }, "On"),
                    React.createElement(Button, { size: 'sm', variant: 'ghost', loading: busy === rule + '0', onClick: () => send(rule + '0', 'gamerule', { rule, value: false }, `${GAMERULE_LABELS[rule]}: off`) }, "Off")))))))) : null,
        can('allow_moderation') ? (React.createElement(Card, { title: 'Kick everyone' },
            React.createElement("div", { className: 'brf-row' },
                React.createElement(Input, { style: { flex: 1, minWidth: 200 }, value: reason, onValue: setReason, maxLength: 200, placeholder: 'Reason (optional)' }),
                React.createElement(ConfirmButton, { size: 'sm', variant: 'danger', title: 'Kick all players?', message: 'Every online player is disconnected.', confirmText: 'Kick all', onConfirm: () => send('kickall', 'kick_all', { reason }, 'All players kicked') }, "Kick all")))) : null));
}
const PROPERTY_LABELS = {
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
    const [data, setData] = useState(null);
    const [values, setValues] = useState({});
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);
    const load = () => api('GET', base() + '/properties')
        .then((d) => {
        setData(d);
        setValues(Object.fromEntries(Object.entries(d.properties).map(([k, v]) => [k, v.value ?? ''])));
    })
        .catch((e) => setError(e.message));
    useEffect(() => {
        load();
    }, []);
    if (error)
        return React.createElement(Alert, { kind: 'err' }, error);
    if (!data)
        return React.createElement(Loading, null);
    const changed = Object.keys(values).filter((k) => (data.properties[k]?.value ?? '') !== values[k]);
    const save = async () => {
        setSaving(true);
        try {
            await api('POST', base() + '/properties', { properties: Object.fromEntries(changed.map((k) => [k, values[k]])) });
            toastOk('server.properties saved. Restart the server to apply the changes.');
            await load();
        }
        catch (e) {
            toastErr(e.message);
        }
        finally {
            setSaving(false);
        }
    };
    return (React.createElement(Card, { title: 'server.properties', subtitle: 'Most changes apply after the next restart.', actions: data.can_edit ? (React.createElement(Button, { size: 'sm', disabled: changed.length === 0, loading: saving, onClick: save },
            "Save ",
            changed.length ? `(${changed.length})` : '')) : (React.createElement(Badge, { kind: 'warn' }, "Read only")) },
        React.createElement("div", { className: 'brf-grid', style: { ['--brf-min']: '260px' } }, Object.entries(data.properties).filter(([, def]) => def.value !== null).map(([key, def]) => {
            const [type, a] = def.type.split(':');
            const label = PROPERTY_LABELS[key] ?? key;
            const set = (v) => setValues({ ...values, [key]: v });
            if (type === 'bool') {
                return (React.createElement(Field, { key: key, label: label, hint: key },
                    React.createElement(Select, { disabled: !data.can_edit, value: values[key] || 'false', onValue: set, options: [{ value: 'true', label: 'On' }, { value: 'false', label: 'Off' }] })));
            }
            if (type === 'enum') {
                return (React.createElement(Field, { key: key, label: label, hint: key },
                    React.createElement(Select, { disabled: !data.can_edit, value: values[key], onValue: set, options: a.split(',') })));
            }
            return (React.createElement(Field, { key: key, label: label, hint: key },
                React.createElement(Input, { disabled: !data.can_edit, value: values[key], maxLength: type === 'string' ? 200 : 6, onValue: (v) => set(type === 'int' ? v.replace(/\D/g, '') : v) })));
        }))));
}
export default function PlayersPage() {
    const [view, setView] = useState('players');
    const [overview, setOverview] = useState(null);
    const [players, setPlayers] = useState(null);
    const [error, setError] = useState(null);
    const [filter, setFilter] = useState('all');
    const [search, setSearch] = useState('');
    const [selected, setSelected] = useState(null);
    const [addName, setAddName] = useState('');
    const [ip, setIp] = useState('');
    const load = () => {
        api('GET', base() + '/overview')
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
    const command = async (action, extra, ok) => {
        try {
            const r = await api('POST', base() + '/action', { action, ...extra });
            toastOk(r?.offline ? r.message : ok);
            refreshSoon();
        }
        catch (e) {
            toastErr(e.message);
        }
    };
    const shown = useMemo(() => {
        if (!players)
            return [];
        const q = search.trim().toLowerCase();
        return players.players.filter((p) => {
            if (q && !(p.name ?? '').toLowerCase().includes(q) && !(p.uuid ?? '').includes(q))
                return false;
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
    return (React.createElement(Page, { title: 'Players', subtitle: 'Online players, inventories, statistics and moderation.', letter: 'P', actions: React.createElement(Button, { variant: 'sec', size: 'sm', onClick: load }, "Refresh") },
        error ? React.createElement(Alert, { kind: 'err' }, error) : null,
        !overview && !error ? React.createElement(Loading, null) : null,
        overview && st ? (React.createElement(React.Fragment, null,
            React.createElement("div", { className: 'brf-grid', style: { ['--brf-min']: '180px', marginBottom: 14 } },
                React.createElement("div", { className: 'brf-stat' },
                    React.createElement("span", null, "Status"),
                    React.createElement("b", { style: { color: st.reachable ? 'var(--brf-ok)' : 'var(--brf-err)' } }, st.reachable ? 'Online' : 'Offline'),
                    React.createElement("span", null, st.reachable ? `${st.latency} ms · ${st.version ?? ''}` : st.error)),
                React.createElement("div", { className: 'brf-stat' },
                    React.createElement("span", null, "Players online"),
                    React.createElement("b", null,
                        st.online,
                        " / ",
                        st.max || overview.properties.max_players),
                    React.createElement("span", null, st.reachable && !st.full_list && st.online > 12 ? 'Enable query for the full list' : overview.address)),
                React.createElement("div", { className: 'brf-stat' },
                    React.createElement("span", null, "Whitelist"),
                    React.createElement("b", null, overview.properties.whitelist ? 'On' : 'Off'),
                    overview.can_console ? (React.createElement("span", null,
                        React.createElement("a", { href: '#', onClick: (e) => {
                                e.preventDefault();
                                command(overview.properties.whitelist ? 'whitelist_off' : 'whitelist_on', {}, `Whitelist turned ${overview.properties.whitelist ? 'off' : 'on'}`);
                            } },
                            "Turn ",
                            overview.properties.whitelist ? 'off' : 'on'))) : null),
                React.createElement("div", { className: 'brf-stat' },
                    React.createElement("span", null, "World"),
                    React.createElement("b", { style: { fontSize: 16 } }, overview.world),
                    React.createElement("span", null,
                        overview.properties.gamemode ?? '',
                        " \u00B7 ",
                        overview.properties.difficulty ?? '',
                        " \u00B7 ",
                        overview.properties.online_mode ? 'online mode' : 'offline mode'),
                    overview.can_update && overview.allow?.allow_properties !== false ? (React.createElement("span", null,
                        React.createElement(ConfirmButton, { size: 'sm', variant: 'ghost', title: overview.properties.online_mode ? 'Turn offline mode on?' : 'Turn online mode back on?', message: overview.properties.online_mode
                                ? 'Players will no longer be checked against Mojang accounts (cracked clients can join). Player UUIDs change, so existing players start with new inventories, op and whitelist entries. Restart the server to apply.'
                                : 'Only real Minecraft accounts can join again. Offline-mode player data is kept but belongs to different UUIDs. Restart the server to apply.', confirmText: overview.properties.online_mode ? 'Turn offline mode on' : 'Turn online mode on', onConfirm: async () => {
                                try {
                                    await api('POST', base() + '/properties', { properties: { 'online-mode': overview.properties.online_mode ? 'false' : 'true' } });
                                    toastOk(`Online mode ${overview.properties.online_mode ? 'off' : 'on'}. Restart the server to apply.`);
                                    load();
                                }
                                catch (e) {
                                    toastErr(e.message);
                                }
                            } }, overview.properties.online_mode ? 'Offline mode: turn on' : 'Online mode: turn on'))) : null)),
            st.motd ? React.createElement(Alert, { kind: 'info' }, st.motd) : null,
            React.createElement(Tabs, { value: view, onValue: setView, tabs: [
                    { key: 'players', label: 'Players' },
                    { key: 'tools', label: 'Server tools' },
                    { key: 'properties', label: 'Server settings' },
                ] }),
            view === 'tools' ? React.createElement(ServerTools, { overview: overview, onChanged: refreshSoon }) : null,
            view === 'properties' ? React.createElement(PropertiesEditor, null) : null,
            view === 'players' ? React.createElement(React.Fragment, null,
                overview.can_console ? (React.createElement(Card, { style: { marginBottom: 14 } },
                    React.createElement("div", { className: 'brf-row' },
                        React.createElement(Input, { style: { flex: 1, minWidth: 160 }, value: addName, onValue: setAddName, placeholder: 'Player name', maxLength: 32 }),
                        React.createElement(Button, { size: 'sm', variant: 'sec', disabled: !addName, onClick: () => command('whitelist_add', { name: addName.trim() }, `${addName} whitelisted`) }, "Whitelist"),
                        React.createElement(Button, { size: 'sm', variant: 'sec', disabled: !addName, onClick: () => command('op', { name: addName.trim() }, `${addName} is now an operator`) }, "Op"),
                        React.createElement(Button, { size: 'sm', variant: 'danger', disabled: !addName, onClick: () => command('ban', { name: addName.trim() }, `${addName} banned`) }, "Ban"),
                        React.createElement(Input, { style: { width: 170 }, value: ip, onValue: setIp, placeholder: 'IP address' }),
                        React.createElement(Button, { size: 'sm', variant: 'danger', disabled: !ip, onClick: () => command('ban_ip', { ip: ip.trim() }, `${ip} banned`) }, "Ban IP")))) : null,
                React.createElement(Tabs, { value: filter, onValue: setFilter, tabs: [
                        { key: 'all', label: `All (${counts?.all ?? 0})` },
                        { key: 'online', label: `Online (${counts?.online ?? 0})` },
                        { key: 'ops', label: `Operators (${counts?.ops ?? 0})` },
                        { key: 'whitelist', label: `Whitelisted (${counts?.whitelist ?? 0})` },
                        { key: 'banned', label: `Banned (${counts?.banned ?? 0})` },
                        { key: 'ips', label: `Banned IPs (${players?.banned_ips.length ?? 0})` },
                    ] }),
                filter === 'ips' ? (!players || players.banned_ips.length === 0 ? (React.createElement(Empty, { title: 'No banned IPs' })) : (React.createElement("div", { className: 'brf-list' }, players.banned_ips.map((b) => (React.createElement("div", { key: b.ip, className: 'brf-item' },
                    React.createElement("div", { className: 'brf-grow' },
                        React.createElement("p", { className: 'brf-title brf-mono' }, b.ip),
                        React.createElement("span", { className: 'brf-muted' },
                            b.reason ?? 'No reason',
                            " \u00B7 by ",
                            b.source ?? 'Server',
                            " \u00B7 expires ",
                            b.expires)),
                    overview.can_console ? (React.createElement(Button, { size: 'sm', variant: 'ok', onClick: () => command('pardon_ip', { ip: b.ip }, `${b.ip} unbanned`) }, "Unban")) : null)))))) : (React.createElement(React.Fragment, null,
                    React.createElement(Input, { style: { marginBottom: 12 }, value: search, onValue: setSearch, placeholder: 'Search players\u2026' }),
                    !players ? (React.createElement(Loading, null)) : shown.length === 0 ? (React.createElement(Empty, { title: 'No players', text: 'Players appear here after they join the server.' })) : (React.createElement("div", { className: 'brf-list' }, shown.map((p) => (React.createElement("div", { key: (p.uuid ?? '') + (p.name ?? ''), className: 'brf-item brf-click', onClick: () => setSelected(p) },
                        React.createElement("img", { src: avatar(p), width: 32, height: 32, style: { borderRadius: 6, imageRendering: 'pixelated' }, alt: '', loading: 'lazy' }),
                        React.createElement("div", { className: 'brf-grow' },
                            React.createElement("p", { className: 'brf-title' }, p.name ?? p.uuid),
                            React.createElement("span", { className: 'brf-muted' }, p.online ? 'Playing now' : p.last_seen ? 'Last seen ' + timeAgo(p.last_seen) : 'Never seen')),
                        p.online ? React.createElement(Badge, { kind: 'ok' }, "online") : null,
                        p.op ? React.createElement(Badge, { kind: 'pri' }, "op") : null,
                        p.whitelisted ? React.createElement(Badge, null, "whitelist") : null,
                        p.banned ? React.createElement(Badge, { kind: 'err' }, "banned") : null)))))))) : null)) : null,
        selected && overview ? (React.createElement(PlayerModal, { player: selected, overview: overview, online: (players?.players ?? []).filter((x) => x.online && x.name).map((x) => x.name), onClose: () => setSelected(null), onChanged: refreshSoon })) : null));
}
