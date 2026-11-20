<?php

namespace Breefer\PlayerManager\Http;

use App\Models\Permission;
use App\Models\Server;
use App\Repositories\Agent\DaemonFileRepository;
use Breefer\PlayerManager\Minecraft\InventoryEditor;
use Breefer\PlayerManager\Minecraft\Nbt;
use Breefer\PlayerManager\Minecraft\NbtTree;
use Breefer\PlayerManager\Minecraft\ServerQuery;
use Breefer\PlayerManager\Support\BaseController;
use Breefer\PlayerManager\Support\Plugin;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;

class PlayerController extends BaseController
{
    private const NAME = '/^\.?[A-Za-z0-9_]{1,32}$/';

    private const UUID = '/^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i';

    /* ----------------------------------------------------------- helpers */

    private const ACTION_SETTINGS = [
        'whitelist_add' => 'allow_whitelist', 'whitelist_remove' => 'allow_whitelist', 'whitelist_on' => 'allow_whitelist', 'whitelist_off' => 'allow_whitelist',
        'op' => 'allow_op', 'deop' => 'allow_op',
        'ban' => 'allow_moderation', 'pardon' => 'allow_moderation', 'kick' => 'allow_moderation', 'ban_ip' => 'allow_moderation', 'pardon_ip' => 'allow_moderation',
        'gamemode' => 'allow_gamemode', 'give' => 'allow_give', 'xp' => 'allow_give',
        'effect' => 'allow_effects', 'effect_clear' => 'allow_effects', 'heal' => 'allow_effects', 'feed' => 'allow_effects',
        'kill' => 'allow_destructive', 'clear' => 'allow_destructive', 'tell' => 'allow_message', 'title' => 'allow_message',
        'teleport' => 'allow_teleport', 'xp_set' => 'allow_give',
        'broadcast' => 'allow_world', 'weather' => 'allow_world', 'time' => 'allow_world', 'difficulty' => 'allow_world',
        'gamerule' => 'allow_world', 'save_all' => 'allow_world', 'kick_all' => 'allow_moderation',
    ];

    /** Actions that can be applied by editing files while the server is stopped. */
    private const OFFLINE_ACTIONS = ['whitelist_add', 'whitelist_remove', 'whitelist_on', 'whitelist_off', 'op', 'deop', 'ban', 'pardon', 'ban_ip', 'pardon_ip'];

    /** Actions that do not target a player. */
    private const SERVER_ACTIONS = ['whitelist_on', 'whitelist_off', 'ban_ip', 'pardon_ip', 'broadcast', 'weather', 'time', 'difficulty', 'gamerule', 'save_all', 'kick_all'];

    /** Boolean game rules offered in the UI (classic camelCase name => 1.21.11+ snake_case name). */
    private const GAMERULES = [
        'keepInventory' => 'keep_inventory', 'doDaylightCycle' => 'advance_time', 'doWeatherCycle' => 'advance_weather',
        'mobGriefing' => 'mob_griefing', 'doMobSpawning' => 'spawn_mobs', 'doInsomnia' => 'spawn_phantoms',
        'announceAdvancements' => 'show_advancement_messages', 'showDeathMessages' => 'show_death_messages',
        'doImmediateRespawn' => 'immediate_respawn', 'naturalRegeneration' => 'natural_health_regeneration',
    ];

    /** server.properties keys that can be edited, with their type. */
    private const PROPERTIES = [
        'motd' => 'string', 'max-players' => 'int:1:10000', 'difficulty' => 'enum:peaceful,easy,normal,hard',
        'gamemode' => 'enum:survival,creative,adventure,spectator', 'pvp' => 'bool', 'hardcore' => 'bool', 'white-list' => 'bool',
        'enforce-whitelist' => 'bool', 'enable-query' => 'bool', 'allow-flight' => 'bool', 'allow-nether' => 'bool',
        'spawn-monsters' => 'bool', 'online-mode' => 'bool', 'spawn-protection' => 'int:0:1000', 'view-distance' => 'int:2:32', 'simulation-distance' => 'int:2:32',
    ];

    private function allowed(Request $request, string $setting): bool
    {
        if (($request->user()->root_admin ?? false) && Plugin::bool('admins_bypass', true)) {
            return true;
        }

        return Plugin::bool($setting, true);
    }

    /** @return array<string, bool> */
    private function permissions(Request $request): array
    {
        $out = [];
        foreach (array_unique(array_values(self::ACTION_SETTINGS)) as $setting) {
            $out[$setting] = $this->allowed($request, $setting);
        }
        $out['allow_wipe'] = $this->allowed($request, 'allow_wipe');
        $out['allow_inventory'] = $this->allowed($request, 'allow_inventory');
        $out['allow_properties'] = $this->allowed($request, 'allow_properties');
        $out['allow_inventory_edit'] = $this->allowed($request, 'allow_inventory_edit');

        return $out;
    }

    private function json(DaemonFileRepository $files, string $path): array
    {
        try {
            $data = json_decode($files->getContent($path, 8 * 1024 * 1024), true);

            return is_array($data) ? $data : [];
        } catch (\Throwable) {
            return [];
        }
    }

    /** @return array<string, string> */
    private function properties(DaemonFileRepository $files): array
    {
        try {
            $raw = $files->getContent('server.properties', 256 * 1024);
        } catch (\Throwable) {
            return [];
        }
        $props = [];
        foreach (preg_split('/\r?\n/', $raw) ?: [] as $line) {
            if ($line === '' || $line[0] === '#' || ! str_contains($line, '=')) {
                continue;
            }
            [$k, $v] = explode('=', $line, 2);
            $props[trim($k)] = trim($v);
        }

        return $props;
    }

    private function world(array $props): string
    {
        $level = $props['level-name'] ?? 'world';

        return trim(str_replace(['..', '\\'], '', $level), '/') ?: 'world';
    }

    /**
     * Folders holding per-player files. Minecraft 26.1+ keeps them in <world>/players/{data,stats,advancements};
     * older versions use <world>/playerdata, <world>/stats and <world>/advancements. Newest layout first.
     *
     * @return array<int, array{data: string, stats: string, advancements: string}>
     */
    private function playerDirs(string $world): array
    {
        return [
            ['data' => "{$world}/players/data", 'stats' => "{$world}/players/stats", 'advancements' => "{$world}/players/advancements"],
            ['data' => "{$world}/playerdata", 'stats' => "{$world}/stats", 'advancements' => "{$world}/advancements"],
        ];
    }

    /** @return array{0: string, 1: int} */
    private function address(Server $server): array
    {
        $server->loadMissing('allocation', 'node');
        $ip = $server->allocation->ip ?? '127.0.0.1';
        if (in_array($ip, ['0.0.0.0', '::', ''], true)) {
            $ip = $server->allocation->ip_alias ?: $server->node->fqdn;
        }

        return [$ip, (int) ($server->allocation->port ?? 25565)];
    }

    /**
     * Hosts to try for the status ping: the allocation IP is not always reachable from the panel
     * (NAT, private addresses), so fall back to the IP alias and the node's FQDN.
     *
     * @return array<int, string>
     */
    private function pingHosts(Server $server): array
    {
        $server->loadMissing('allocation', 'node');
        $remembered = Cache::get('breefer:pm:host:'.$server->id);
        $hosts = [$remembered, $server->allocation->ip ?? null, $server->allocation->ip_alias ?? null, $server->node->fqdn ?? null];
        $hosts = array_filter($hosts, fn ($h) => is_string($h) && $h !== '' && ! in_array($h, ['0.0.0.0', '::'], true));

        return array_values(array_unique($hosts));
    }

    /** Resolve names for UUIDs that only have player files (online-mode UUIDs via Mojang, cached). */
    private function resolveName(string $uuid): ?string
    {
        $uuid = $this->dashed($uuid);
        if (($uuid[14] ?? '') !== '4') {
            return null; // offline-mode (v3) UUIDs have no Mojang profile
        }

        return Cache::remember('breefer:pm:name:'.$uuid, 7 * 86400, function () use ($uuid) {
            try {
                $response = Http::timeout(3)->acceptJson()->withUserAgent(Plugin::userAgent())
                    ->get('https://api.minecraftservices.com/minecraft/profile/lookup/'.str_replace('-', '', $uuid));

                return $response->ok() && is_string($response->json('name')) ? $response->json('name') : null;
            } catch (\Throwable) {
                return null;
            }
        });
    }

    /** UUID for a player name: usercache first, then Mojang (online mode) or the offline-mode UUID. */
    private function uuidFor(DaemonFileRepository $files, string $name, bool $onlineMode): ?string
    {
        foreach ($this->json($files, 'usercache.json') as $entry) {
            if (strcasecmp((string) ($entry['name'] ?? ''), $name) === 0 && ! empty($entry['uuid'])) {
                return $this->dashed((string) $entry['uuid']);
            }
        }
        if ($onlineMode) {
            try {
                $response = Http::timeout(4)->acceptJson()->withUserAgent(Plugin::userAgent())
                    ->get('https://api.minecraftservices.com/minecraft/profile/lookup/name/'.rawurlencode($name));
                if ($response->ok() && is_string($response->json('id'))) {
                    return $this->dashed($response->json('id'));
                }
            } catch (\Throwable) {
                // fall through
            }

            return null;
        }
        $hash = md5('OfflinePlayer:'.$name);
        $hash[12] = '3';
        $hash[16] = dechex((hexdec($hash[16]) & 0x3) | 0x8);

        return $this->dashed($hash);
    }

    private function dashed(string $uuid): string
    {
        $hex = strtolower(str_replace('-', '', $uuid));

        return strlen($hex) === 32
            ? substr($hex, 0, 8).'-'.substr($hex, 8, 4).'-'.substr($hex, 12, 4).'-'.substr($hex, 16, 4).'-'.substr($hex, 20)
            : strtolower($uuid);
    }

    private function clean(?string $text, int $max = 200): string
    {
        $text = preg_replace('/[\x00-\x1F\x7F]+/u', ' ', (string) $text) ?? '';

        return mb_substr(trim($text), 0, $max);
    }

    private function status(Server $server, array $props): array
    {
        return Cache::remember('breefer:pm:status:'.$server->id, 10, function () use ($server, $props) {
            [, $port] = $this->address($server);
            $status = null;
            $error = 'Server is not reachable.';
            foreach ($this->pingHosts($server) as $candidate) {
                try {
                    $status = ServerQuery::ping($candidate, $port, 2.0);
                    $status['reachable'] = true;
                    $host = $candidate;
                    Cache::put('breefer:pm:host:'.$server->id, $candidate, 600);
                    break;
                } catch (\Throwable $exception) {
                    $error = $exception->getMessage();
                }
            }
            if ($status === null) {
                return ['reachable' => false, 'error' => $error, 'online' => 0, 'max' => 0, 'sample' => []];
            }

            if (($props['enable-query'] ?? 'false') === 'true') {
                $qport = (int) ($props['query.port'] ?? $port);
                $query = ServerQuery::query($host, $qport);
                if ($query) {
                    $status['full_list'] = true;
                    $status['sample'] = array_map(fn ($n) => ['name' => $n, 'uuid' => null], $query['players']);
                }
            }

            return $status;
        });
    }

    /* --------------------------------------------------------- endpoints */

    public function overview(Request $request, Server $server): JsonResponse
    {
        $this->authorizeServer($request, $server, Permission::ACTION_FILE_READ_CONTENT);
        $files = $this->files($server);
        $props = $this->properties($files);
        $status = $this->status($server, $props);
        [$host, $port] = $this->address($server);

        return new JsonResponse([
            'status' => $status,
            'address' => $host.':'.$port,
            'properties' => [
                'whitelist' => ($props['white-list'] ?? 'false') === 'true',
                'enforce_whitelist' => ($props['enforce-whitelist'] ?? 'false') === 'true',
                'online_mode' => ($props['online-mode'] ?? 'true') === 'true',
                'max_players' => (int) ($props['max-players'] ?? 0),
                'gamemode' => $props['gamemode'] ?? null,
                'difficulty' => $props['difficulty'] ?? null,
                'pvp' => ($props['pvp'] ?? 'true') === 'true',
                'query' => ($props['enable-query'] ?? 'false') === 'true',
            ],
            'world' => $this->world($props),
            'can_console' => $request->user()->can(Permission::ACTION_CONTROL_CONSOLE, $server),
            'can_delete' => $request->user()->can(Permission::ACTION_FILE_DELETE, $server) && $this->allowed($request, 'allow_wipe'),
            'can_update' => $request->user()->can(Permission::ACTION_FILE_UPDATE, $server),
            'allow' => $this->permissions($request),
        ]);
    }

    public function players(Request $request, Server $server): JsonResponse
    {
        $this->authorizeServer($request, $server, Permission::ACTION_FILE_READ_CONTENT);
        $files = $this->files($server);
        $props = $this->properties($files);
        $world = $this->world($props);
        $status = $this->status($server, $props);

        $players = [];
        $add = function (?string $uuid, ?string $name) use (&$players): ?string {
            $key = $uuid ? $this->dashed($uuid) : 'name:'.strtolower((string) $name);
            if (! $uuid && $name) {
                foreach ($players as $k => $p) {
                    if (strcasecmp($p['name'] ?? '', $name) === 0) {
                        return $k;
                    }
                }
            }
            $players[$key] ??= ['uuid' => $uuid ? $this->dashed($uuid) : null, 'name' => $name, 'online' => false, 'op' => null, 'whitelisted' => false, 'banned' => null, 'last_seen' => null, 'has_data' => false];
            if ($name && ! $players[$key]['name']) {
                $players[$key]['name'] = $name;
            }

            return $key;
        };

        foreach ($this->json($files, 'usercache.json') as $entry) {
            $k = $add($entry['uuid'] ?? null, $entry['name'] ?? null);
            if ($k && isset($entry['expiresOn'])) {
                $ts = strtotime(preg_replace('/ [+-]\d{4}$/', '', (string) $entry['expiresOn']));
                $players[$k]['last_seen'] = $ts ? date(DATE_ATOM, $ts - 30 * 86400) : null; // usercache expires one month after last login
            }
        }
        foreach ($this->json($files, 'ops.json') as $entry) {
            $k = $add($entry['uuid'] ?? null, $entry['name'] ?? null);
            $players[$k]['op'] = (int) ($entry['level'] ?? 4);
        }
        foreach ($this->json($files, 'whitelist.json') as $entry) {
            $k = $add($entry['uuid'] ?? null, $entry['name'] ?? null);
            $players[$k]['whitelisted'] = true;
        }
        foreach ($this->json($files, 'banned-players.json') as $entry) {
            $k = $add($entry['uuid'] ?? null, $entry['name'] ?? null);
            $players[$k]['banned'] = ['reason' => $entry['reason'] ?? null, 'source' => $entry['source'] ?? null, 'expires' => $entry['expires'] ?? 'forever', 'created' => $entry['created'] ?? null];
        }
        foreach ($status['sample'] ?? [] as $entry) {
            if (($entry['uuid'] ?? null) === '00000000-0000-0000-0000-000000000000') {
                continue; // hidden/anonymous sample entries
            }
            $k = $add($entry['uuid'] ?? null, $entry['name'] ?? null);
            $players[$k]['online'] = true;
        }

        $withData = [];
        foreach (array_reverse($this->playerDirs($world)) as $dirs) { // newest layout last, so it wins
            try {
                foreach ($files->getDirectory($dirs['data']) as $file) {
                    if (preg_match('/^([0-9a-f\-]{36})\.dat$/i', $file['name'], $m)) {
                        $withData[strtolower($m[1])] = $file['modified'] ?? null;
                    }
                }
            } catch (\Throwable) {
                // folder does not exist for this layout / world not generated yet
            }
        }
        foreach ($players as $k => $p) {
            if ($p['uuid'] && array_key_exists($p['uuid'], $withData)) {
                $players[$k]['has_data'] = true;
                if ($withData[$p['uuid']] && (! $p['last_seen'] || strtotime((string) $withData[$p['uuid']]) > strtotime((string) $p['last_seen']))) {
                    $players[$k]['last_seen'] = $withData[$p['uuid']];
                }
                unset($withData[$p['uuid']]);
            }
        }
        foreach ($withData as $uuid => $modified) {
            $k = $add($uuid, null);
            $players[$k]['has_data'] = true;
            $players[$k]['last_seen'] = $modified;
        }

        // Give a name to players known only by their data file (needed for actions).
        $lookups = 0;
        foreach ($players as $k => $p) {
            if (! $p['name'] && $p['uuid'] && $lookups < 10) {
                $lookups++;
                $players[$k]['name'] = $this->resolveName($p['uuid']);
            }
        }

        $bannedIps = array_map(fn ($e) => ['ip' => $e['ip'] ?? '', 'reason' => $e['reason'] ?? null, 'source' => $e['source'] ?? null, 'expires' => $e['expires'] ?? 'forever'], $this->json($files, 'banned-ips.json'));

        $list = array_values($players);
        usort($list, fn ($a, $b) => [$b['online'], strtotime((string) ($b['last_seen'] ?? '')) ?: 0] <=> [$a['online'], strtotime((string) ($a['last_seen'] ?? '')) ?: 0]);

        return new JsonResponse(['players' => $list, 'banned_ips' => $bannedIps, 'full_list' => (bool) ($status['full_list'] ?? false)]);
    }

    public function show(Request $request, Server $server, string $uuid): JsonResponse
    {
        $this->authorizeServer($request, $server, Permission::ACTION_FILE_READ_CONTENT);
        if (! preg_match(self::UUID, $uuid)) {
            return $this->fail('Invalid player UUID.', 422);
        }
        $uuid = $this->dashed($uuid);
        $files = $this->files($server);
        $world = $this->world($this->properties($files));

        // For online players, ask the server to write its player data first so the view is current.
        if ($request->boolean('fresh') && $request->user()->can(Permission::ACTION_CONTROL_CONSOLE, $server)) {
            try {
                $this->runCommands($server, ['save-all']);
                usleep(1_500_000);
            } catch (\Throwable) {
                // server offline: the files on disk are already current
            }
        }

        $data = null;
        $error = 'No saved data yet. Player data is written when the player leaves or the world saves.';
        $stats = [];
        foreach ($this->playerDirs($world) as $dirs) {
            if ($data === null) {
                try {
                    $data = Nbt::parse($files->getContent($dirs['data'].'/'.$uuid.'.dat', 16 * 1024 * 1024));
                    $error = null;
                } catch (\Throwable $exception) {
                    if (str_contains($exception->getMessage(), 'NBT')) {
                        $error = $exception->getMessage();
                    }
                }
            }
            if (! $stats) {
                $stats = $this->json($files, $dirs['stats'].'/'.$uuid.'.json');
            }
        }
        $showInv = $this->allowed($request, 'allow_inventory');

        return new JsonResponse([
            'uuid' => $uuid,
            'error' => $error,
            'summary' => $data ? $this->summary($data) : null,
            'inventory' => $data && $showInv ? $this->items($data['Inventory'] ?? []) : [],
            'equipment' => $data && $showInv ? $this->equipment($data) : [],
            'ender_chest' => $data && $showInv ? $this->items($data['EnderItems'] ?? []) : [],
            'inventory_hidden' => ! $showInv,
            'stats' => $this->stats($stats),
        ]);
    }

    public function action(Request $request, Server $server): JsonResponse
    {
        $this->authorizeServer($request, $server, Permission::ACTION_CONTROL_CONSOLE);
        $data = $request->validate([
            'action' => 'required|string|in:'.implode(',', array_keys(self::ACTION_SETTINGS)),
            'target' => ['nullable', 'string', 'regex:'.self::NAME],
            'x' => 'nullable|numeric|between:-30000000,30000000',
            'y' => 'nullable|numeric|between:-2048,2048',
            'z' => 'nullable|numeric|between:-30000000,30000000',
            'subtitle' => 'nullable|string|max:120',
            'weather' => 'nullable|in:clear,rain,thunder',
            'time' => 'nullable|in:day,noon,night,midnight',
            'difficulty' => 'nullable|in:peaceful,easy,normal,hard',
            'rule' => 'nullable|string|in:'.implode(',', array_keys(self::GAMERULES)),
            'value' => 'nullable|boolean',
            'name' => ['nullable', 'string', 'regex:'.self::NAME],
            'reason' => 'nullable|string|max:200',
            'ip' => 'nullable|ip',
            'gamemode' => 'nullable|in:survival,creative,adventure,spectator',
            'item' => ['nullable', 'string', 'max:100', 'regex:/^[a-z0-9_.\-]+(:[a-z0-9_.\-\/]+)?$/'],
            'amount' => 'nullable|integer|min:0|max:6400',
            'effect' => ['nullable', 'string', 'max:100', 'regex:/^[a-z0-9_.\-]+(:[a-z0-9_.\-\/]+)?$/'],
            'duration' => 'nullable|integer|min:1|max:1000000',
            'amplifier' => 'nullable|integer|min:0|max:255',
            'message' => 'nullable|string|max:256',
        ]);

        if (! $this->allowed($request, self::ACTION_SETTINGS[$data['action']] ?? 'allow_moderation')) {
            return $this->fail('That action is disabled by the administrator.', 403);
        }

        $name = $data['name'] ?? null;
        $reason = $this->clean($data['reason'] ?? '');
        $needsName = ! in_array($data['action'], self::SERVER_ACTIONS, true);
        if ($needsName && ! $name) {
            return $this->fail('A player name is required.', 422);
        }

        $commands = match ($data['action']) {
            'whitelist_add' => ["whitelist add {$name}"],
            'whitelist_remove' => ["whitelist remove {$name}"],
            'whitelist_on' => ['whitelist on'],
            'whitelist_off' => ['whitelist off'],
            'op' => ["op {$name}"],
            'deop' => ["deop {$name}"],
            'ban' => [trim("ban {$name} {$reason}")],
            'pardon' => ["pardon {$name}"],
            'kick' => [trim("kick {$name} {$reason}")],
            'ban_ip' => [trim('ban-ip '.($data['ip'] ?? $name).' '.$reason)],
            'pardon_ip' => ['pardon-ip '.($data['ip'] ?? '')],
            'gamemode' => ['gamemode '.($data['gamemode'] ?? 'survival')." {$name}"],
            'clear' => ["clear {$name}"],
            'give' => ["give {$name} ".($data['item'] ?? 'minecraft:stone').' '.(int) ($data['amount'] ?? 1)],
            'effect' => ["effect give {$name} ".($data['effect'] ?? 'minecraft:speed').' '.(int) ($data['duration'] ?? 30).' '.(int) ($data['amplifier'] ?? 0)],
            'effect_clear' => ["effect clear {$name}"],
            'tell' => ["tell {$name} ".$this->clean($data['message'] ?? '', 256)],
            'kill' => ["kill {$name}"],
            'heal' => ["effect give {$name} minecraft:instant_health 1 10"],
            'feed' => ["effect give {$name} minecraft:saturation 1 20"],
            'xp' => ["xp add {$name} ".(int) ($data['amount'] ?? 1).' levels'],
            'xp_set' => ["xp set {$name} ".(int) ($data['amount'] ?? 0).' levels', "xp set {$name} 0 points"],
            'teleport' => [isset($data['target'])
                ? "tp {$name} {$data['target']}"
                : sprintf('tp %s %s %s %s', $name, $this->coord($data['x'] ?? 0), $this->coord($data['y'] ?? 0), $this->coord($data['z'] ?? 0))],
            'title' => array_values(array_filter([
                'title '.$name.' title '.json_encode(['text' => $this->clean($data['message'] ?? '', 120)], JSON_UNESCAPED_UNICODE),
                trim((string) ($data['subtitle'] ?? '')) !== '' ? 'title '.$name.' subtitle '.json_encode(['text' => $this->clean($data['subtitle'], 120)], JSON_UNESCAPED_UNICODE) : null,
            ])),
            'broadcast' => ['say '.$this->clean($data['message'] ?? '', 256)],
            'weather' => ['weather '.($data['weather'] ?? 'clear')],
            'time' => ['time set '.($data['time'] ?? 'day')],
            'difficulty' => ['difficulty '.($data['difficulty'] ?? 'normal')],
            'gamerule' => ['gamerule '.$this->gamerule($server, (string) ($data['rule'] ?? 'keepInventory')).' '.(($data['value'] ?? false) ? 'true' : 'false')],
            'save_all' => ['save-all'],
            'kick_all' => [trim('kick @a '.$reason)],
        };

        if ($data['action'] === 'teleport' && ! isset($data['target']) && ! isset($data['x'], $data['y'], $data['z'])) {
            return $this->fail('Enter X, Y and Z coordinates or pick a player to teleport to.', 422);
        }
        if (in_array($data['action'], ['broadcast', 'title'], true) && trim((string) ($data['message'] ?? '')) === '') {
            return $this->fail('Message cannot be empty.', 422);
        }

        if (in_array($data['action'], ['ban_ip', 'pardon_ip'], true) && empty($data['ip']) && ! $name) {
            return $this->fail('An IP address is required.', 422);
        }
        if ($data['action'] === 'tell' && trim((string) ($data['message'] ?? '')) === '') {
            return $this->fail('Message cannot be empty.', 422);
        }

        try {
            $this->runCommands($server, $commands);
        } catch (\Throwable) {
            // Server stopped: list changes can still be made by editing the files the server reads on start.
            if (in_array($data['action'], self::OFFLINE_ACTIONS, true)) {
                return $this->offlineEdit($request, $server, $data['action'], $name, $data['ip'] ?? null, $reason);
            }

            return $this->fail('The command could not be sent because the server is not running. Start the server and try again.', 409);
        }

        Cache::forget('breefer:pm:status:'.$server->id);
        $this->activity('server:breefer.players.'.$data['action'], ['player' => $name, 'ip' => $data['ip'] ?? null, 'reason' => $reason ?: null]);

        return $this->ok(['commands' => $commands]);
    }

    /** Applies whitelist/op/ban changes straight to the JSON files while the server is stopped. */
    private function offlineEdit(Request $request, Server $server, string $action, ?string $name, ?string $ip, string $reason): JsonResponse
    {
        $files = $this->files($server);
        $props = $this->properties($files);
        $source = 'Panel ('.($request->user()->username ?? 'user').')';
        $now = gmdate('Y-m-d H:i:s').' +0000';

        if (in_array($action, ['whitelist_on', 'whitelist_off'], true)) {
            $value = $action === 'whitelist_on' ? 'true' : 'false';
            try {
                $raw = $files->getContent('server.properties', 256 * 1024);
            } catch (\Throwable) {
                $raw = '';
            }
            $raw = preg_match('/^white-list=.*$/m', $raw) ? (string) preg_replace('/^white-list=.*$/m', 'white-list='.$value, $raw) : rtrim($raw)."\nwhite-list={$value}\n";
            $files->putContent('server.properties', $raw);
            $this->activity('server:breefer.players.'.$action, ['offline' => true]);

            return $this->ok(['offline' => true, 'message' => 'The server is stopped, so server.properties was updated. The change applies on the next start.']);
        }

        if (in_array($action, ['ban_ip', 'pardon_ip'], true)) {
            if (! $ip) {
                return $this->fail('Enter the IP address: a player\'s IP is only known while they are online.', 422);
            }
            $list = $this->json($files, 'banned-ips.json');
            $list = array_values(array_filter($list, fn ($e) => ($e['ip'] ?? null) !== $ip));
            if ($action === 'ban_ip') {
                $list[] = ['ip' => $ip, 'created' => $now, 'source' => $source, 'expires' => 'forever', 'reason' => $reason ?: 'Banned by an operator.'];
            }
            $files->putContent('banned-ips.json', json_encode($list, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE)."\n");
            $this->activity('server:breefer.players.'.$action, ['ip' => $ip, 'offline' => true]);

            return $this->ok(['offline' => true, 'message' => 'The server is stopped, so banned-ips.json was updated. The change applies on the next start.']);
        }

        $uuid = $this->uuidFor($files, (string) $name, ($props['online-mode'] ?? 'true') === 'true');
        if ($uuid === null) {
            return $this->fail("Could not find the Minecraft account \"{$name}\". Check the spelling, or start the server and try again.", 422);
        }

        [$file, $remove] = match ($action) {
            'whitelist_add', 'whitelist_remove' => ['whitelist.json', $action === 'whitelist_remove'],
            'op', 'deop' => ['ops.json', $action === 'deop'],
            'ban', 'pardon' => ['banned-players.json', $action === 'pardon'],
        };
        $list = array_values(array_filter($this->json($files, $file), fn ($e) => strtolower((string) ($e['uuid'] ?? '')) !== $uuid && strcasecmp((string) ($e['name'] ?? ''), (string) $name) !== 0));
        if (! $remove) {
            $list[] = match ($action) {
                'whitelist_add' => ['uuid' => $uuid, 'name' => $name],
                'op' => ['uuid' => $uuid, 'name' => $name, 'level' => 4, 'bypassesPlayerLimit' => false],
                'ban' => ['uuid' => $uuid, 'name' => $name, 'created' => $now, 'source' => $source, 'expires' => 'forever', 'reason' => $reason ?: 'Banned by an operator.'],
            };
        }
        $files->putContent($file, json_encode($list, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE)."\n");
        $this->activity('server:breefer.players.'.$action, ['player' => $name, 'uuid' => $uuid, 'offline' => true]);

        return $this->ok(['offline' => true, 'message' => "The server is stopped, so {$file} was updated. The change applies on the next start."]);
    }

    /**
     * Bukkit-based servers (Paper, Spigot, Purpur, Folia, hybrids) let plugins replace vanilla
     * commands: EssentialsX registers its own /item, /give, /tp, /kill, /xp, /gamemode…
     * Prefixing with "minecraft:" always runs the vanilla command there. Vanilla, Fabric and
     * Forge servers do not accept the prefix, so it is only added on Bukkit servers.
     */
    private function isBukkit(Server $server): bool
    {
        return Cache::remember('breefer:pm:bukkit:'.$server->id, 600, function () use ($server) {
            try {
                $version = (string) ($this->status($server, $this->properties($this->files($server)))['version'] ?? '');
            } catch (\Throwable) {
                $version = '';
            }
            if (preg_match('/paper|spigot|purpur|folia|bukkit|pufferfish|leaf|mohist|arclight|magma|canvas|gale/i', $version)) {
                return true;
            }
            try {
                $this->files($server)->getContent('bukkit.yml', 512 * 1024);

                return true;
            } catch (\Throwable) {
                return false;
            }
        });
    }

    /** Sends console commands, routed to the vanilla implementation on Bukkit servers. */
    private function runCommands(Server $server, array $commands): void
    {
        if ($this->isBukkit($server)) {
            $commands = array_map(fn (string $c) => preg_match('/^[a-z][a-z0-9_-]*:/i', $c) ? $c : 'minecraft:'.$c, $commands);
        }
        $this->commands($server)->send($commands);
    }

    private function coord(mixed $v): string
    {
        $s = number_format((float) $v, 2, '.', '');

        return str_contains($s, '.') ? rtrim(rtrim($s, '0'), '.') : $s;
    }

    /** Game rule names were renamed to snake_case in Minecraft 1.21.11 (and the year-based 26.x releases). */
    private function gamerule(Server $server, string $rule): string
    {
        try {
            $version = (string) ($this->status($server, $this->properties($this->files($server)))['version'] ?? '');
        } catch (\Throwable) {
            $version = '';
        }
        $modern = false;
        if (preg_match('/\b1\.(\d+)(?:\.(\d+))?/', $version, $m)) {
            $modern = (int) $m[1] > 21 || ((int) $m[1] === 21 && (int) ($m[2] ?? 0) >= 11);
        } elseif (preg_match('/\b(2\d)\.\d+/', $version)) {
            $modern = true;
        }

        return $modern ? (self::GAMERULES[$rule] ?? $rule) : $rule;
    }

    public function propertiesShow(Request $request, Server $server): JsonResponse
    {
        $this->authorizeServer($request, $server, Permission::ACTION_FILE_READ_CONTENT);
        $props = $this->properties($this->files($server));
        $out = [];
        foreach (self::PROPERTIES as $key => $type) {
            $out[$key] = ['type' => $type, 'value' => $props[$key] ?? null];
        }

        return new JsonResponse([
            'properties' => $out,
            'can_edit' => $request->user()->can(Permission::ACTION_FILE_UPDATE, $server) && $this->allowed($request, 'allow_properties'),
            'gamerules' => array_keys(self::GAMERULES),
        ]);
    }

    public function propertiesUpdate(Request $request, Server $server): JsonResponse
    {
        $this->authorizeServer($request, $server, Permission::ACTION_FILE_UPDATE);
        if (! $this->allowed($request, 'allow_properties')) {
            return $this->fail('Editing server.properties is disabled by the administrator.', 403);
        }
        $changes = [];
        foreach ((array) $request->input('properties', []) as $key => $value) {
            if (! isset(self::PROPERTIES[$key])) {
                continue;
            }
            $type = explode(':', self::PROPERTIES[$key]);
            $value = is_bool($value) ? ($value ? 'true' : 'false') : trim((string) $value);
            switch ($type[0]) {
                case 'bool':
                    if (! in_array($value, ['true', 'false'], true)) {
                        return $this->fail("{$key} must be true or false.", 422);
                    }
                    break;
                case 'int':
                    if (! preg_match('/^\d+$/', $value) || (int) $value < (int) $type[1] || (int) $value > (int) $type[2]) {
                        return $this->fail("{$key} must be a number between {$type[1]} and {$type[2]}.", 422);
                    }
                    break;
                case 'enum':
                    if (! in_array($value, explode(',', $type[1]), true)) {
                        return $this->fail("Invalid value for {$key}.", 422);
                    }
                    break;
                default:
                    $value = mb_substr(str_replace(["\r", "\n"], ' ', $value), 0, 200);
            }
            $changes[$key] = $value;
        }
        if (! $changes) {
            return $this->fail('Nothing to save.', 422);
        }

        $files = $this->files($server);
        try {
            $raw = $files->getContent('server.properties', 256 * 1024);
        } catch (\Throwable) {
            $raw = '';
        }
        $lines = $raw === '' ? [] : (preg_split('/\r?\n/', rtrim($raw, "\r\n")) ?: []);
        $pending = $changes;
        foreach ($lines as $i => $line) {
            if ($line === '' || $line[0] === '#' || ! str_contains($line, '=')) {
                continue;
            }
            $key = trim(substr($line, 0, (int) strpos($line, '=')));
            if (array_key_exists($key, $pending)) {
                $lines[$i] = $key.'='.$pending[$key];
                unset($pending[$key]);
            }
        }
        foreach ($pending as $key => $value) {
            $lines[] = $key.'='.$value;
        }

        try {
            $files->putContent('server.properties', implode("\n", $lines)."\n");
        } catch (\Throwable) {
            return $this->fail('server.properties could not be written.', 502);
        }
        Cache::forget('breefer:pm:status:'.$server->id);
        $this->activity('server:breefer.players.properties', ['changes' => $changes]);

        return $this->ok(['changes' => $changes]);
    }

    /* ------------------------------------------------- inventory editing */

    /** Where the player's .dat lives (newest layout first). Null when the player has no file yet. */
    private function playerFile(DaemonFileRepository $files, string $world, string $uuid): ?string
    {
        foreach ($this->playerDirs($world) as $dirs) {
            try {
                foreach ($files->getDirectory($dirs['data']) as $file) {
                    if (strcasecmp($file['name'], $uuid.'.dat') === 0) {
                        return $dirs['data'].'/'.$file['name'];
                    }
                }
            } catch (\Throwable) {
                // layout not used by this server
            }
        }

        return null;
    }

    /**
     * Is the player online? true / false, or null when the status ping only returned a partial
     * player sample (large servers without enable-query).
     */
    private function isOnline(array $status, string $name): ?bool
    {
        if (! ($status['reachable'] ?? false)) {
            return false;
        }
        foreach ($status['sample'] ?? [] as $entry) {
            if (strcasecmp((string) ($entry['name'] ?? ''), $name) === 0) {
                return true;
            }
        }
        $complete = ($status['full_list'] ?? false) || count($status['sample'] ?? []) >= (int) ($status['online'] ?? 0);

        return $complete ? false : null;
    }

    /** @return array<string, mixed> normalised operation */
    private function inventoryOp(Request $request): array
    {
        $data = $request->validate([
            'op' => 'required|in:set,remove,move,count',
            'container' => 'nullable|in:inventory,ender,equipment',
            'slot' => 'nullable|string|max:16',
            'id' => ['nullable', 'string', 'max:100', 'regex:'.InventoryEditor::ITEM_ID],
            'count' => 'nullable|integer|min:1|max:99',
            'from' => 'nullable|array',
            'from.container' => 'nullable|in:inventory,ender,equipment',
            'from.slot' => 'nullable|string|max:16',
            'to' => 'nullable|array',
            'to.container' => 'nullable|in:inventory,ender,equipment',
            'to.slot' => 'nullable|string|max:16',
        ]);
        $op = ['op' => $data['op']];
        if ($data['op'] === 'move') {
            $op['from'] = InventoryEditor::slot((string) ($data['from']['container'] ?? ''), $data['from']['slot'] ?? null);
            $op['to'] = InventoryEditor::slot((string) ($data['to']['container'] ?? ''), $data['to']['slot'] ?? null);

            return $op;
        }
        $op['slot'] = InventoryEditor::slot((string) ($data['container'] ?? ''), $data['slot'] ?? null);
        if ($data['op'] === 'set') {
            if (empty($data['id'])) {
                throw new \InvalidArgumentException('Choose an item.');
            }
            $op['id'] = $data['id'];
            $op['count'] = (int) ($data['count'] ?? 1);
        }
        if ($data['op'] === 'count') {
            $op['count'] = (int) ($data['count'] ?? 1);
            $op['id'] = $data['id'] ?? null;
        }

        return $op;
    }

    public function inventory(Request $request, Server $server, string $uuid): JsonResponse
    {
        $this->authorizeServer($request, $server, Permission::ACTION_FILE_READ_CONTENT);
        if (! $this->allowed($request, 'allow_inventory_edit') || ! $this->allowed($request, 'allow_inventory')) {
            return $this->fail('Inventory editing is disabled by the administrator.', 403);
        }
        if (! preg_match(self::UUID, $uuid)) {
            return $this->fail('Invalid player UUID.', 422);
        }
        $uuid = $this->dashed($uuid);
        try {
            $op = $this->inventoryOp($request);
        } catch (\InvalidArgumentException $exception) {
            return $this->fail($exception->getMessage(), 422);
        }

        $files = $this->files($server);
        $props = $this->properties($files);
        $world = $this->world($props);
        $name = (string) $request->input('name', '');
        Cache::forget('breefer:pm:status:'.$server->id);
        $status = $this->status($server, $props);
        $online = $name !== '' && preg_match(self::NAME, $name) ? $this->isOnline($status, $name) : false;

        if ($online === null) {
            return $this->fail('Could not tell whether the player is online (the server only lists some players). Set enable-query=true in server.properties.', 409);
        }

        if ($online) {
            // Live: /item commands, applied immediately.
            if (! $request->user()->can(Permission::ACTION_CONTROL_CONSOLE, $server)) {
                return $this->fail('Editing an online player\'s inventory needs the console permission.', 403);
            }
            try {
                $this->runCommands($server, ['save-all']); // write current data so slot checks are accurate
            } catch (\Throwable) {
                return $this->fail('The server stopped responding. Try again in a moment.', 409);
            }
            usleep(1_200_000);
            $occupied = function (array $slot): bool {
                return false;
            };
            $path = $this->playerFile($files, $world, $uuid);
            $dataVersion = 0;
            if ($path !== null) {
                try {
                    $editor = new InventoryEditor(NbtTree::decode($files->getContent($path, 16 * 1024 * 1024))['tag']);
                    $occupied = fn (array $slot): bool => $editor->get($slot) !== null;
                    $dataVersion = (int) ($editor->root()['v']['DataVersion']['v'] ?? 0);
                } catch (\Throwable) {
                    // fall back to "empty" knowledge
                }
            }
            try {
                $commands = InventoryEditor::commands($name, $op, $occupied, $dataVersion === 0 || $dataVersion >= 3837);
            } catch (\RuntimeException $exception) {
                return $this->fail($exception->getMessage(), 409);
            }
            if ($commands) {
                try {
                    $this->runCommands($server, [...$commands, 'save-all']);
                } catch (\Throwable) {
                    return $this->fail('The commands could not be sent. Is the server still running?', 409);
                }
                usleep(1_200_000);
            }
            $this->activity('server:breefer.players.inventory', ['player' => $name, 'op' => $op['op'], 'live' => true]);

            return $this->ok(['live' => true, 'commands' => $commands, 'message' => 'Applied in game.']);
        }

        // Offline: edit the player file; the server loads it on the next join, no restart needed.
        if (! $request->user()->can(Permission::ACTION_FILE_UPDATE, $server)) {
            return $this->fail('Editing an offline player\'s inventory needs the file.update permission.', 403);
        }
        $path = $this->playerFile($files, $world, $uuid);
        if ($path === null) {
            return $this->fail('This player has no saved data yet. They need to join the server once.', 404);
        }
        try {
            $raw = $files->getContent($path, 16 * 1024 * 1024);
            $doc = NbtTree::decode($raw);
            $editor = new InventoryEditor($doc['tag']);
            $editor->apply($op);
            $files->putContent($path.'.breefer-backup', $raw);
            $files->putContent($path, NbtTree::encode($editor->root(), $doc['name'], $doc['gzip']));
        } catch (\RuntimeException|\InvalidArgumentException $exception) {
            return $this->fail($exception->getMessage(), 422);
        } catch (\Throwable) {
            return $this->fail('The player file could not be updated.', 502);
        }
        $this->activity('server:breefer.players.inventory', ['player' => $name ?: $uuid, 'op' => $op['op'], 'live' => false]);

        return $this->ok(['live' => false, 'message' => 'Saved to the player file. It loads the next time the player joins.']);
    }

    /** Every item of the server's Minecraft version (from PrismarineJS minecraft-data), cached. */
    public function itemCatalog(Request $request, Server $server): JsonResponse
    {
        $this->authorizeServer($request, $server, Permission::ACTION_FILE_READ_CONTENT);
        $status = $this->status($server, $this->properties($this->files($server)));
        preg_match('/\b(\d+\.\d+(?:\.\d+)?)\b/', (string) ($status['version'] ?? ''), $m);
        $wanted = $m[1] ?? null;
        $base = 'https://cdn.jsdelivr.net/gh/PrismarineJS/minecraft-data@master/data/';

        try {
            $paths = Cache::remember('breefer:pm:datapaths', 86400, function () use ($base) {
                $r = Http::timeout(8)->acceptJson()->get($base.'dataPaths.json');

                return $r->ok() ? $r->json('pc') : null;
            });
            if (! is_array($paths)) {
                throw new \RuntimeException('catalog unavailable');
            }
            $versions = array_values(array_filter(array_keys($paths), fn ($v) => preg_match('/^\d+\.\d+(\.\d+)?$/', $v) && isset($paths[$v]['items'])));
            usort($versions, 'version_compare');
            $pick = end($versions);
            if ($wanted) {
                foreach ($versions as $v) {
                    if (version_compare($v, $wanted, '<=')) {
                        $pick = $v;
                    }
                }
            }
            $items = Cache::remember('breefer:pm:items:'.$pick, 7 * 86400, function () use ($base, $paths, $pick) {
                $r = Http::timeout(10)->acceptJson()->get($base.$paths[$pick]['items'].'/items.json');
                if (! $r->ok()) {
                    return null;
                }

                return array_values(array_map(fn ($i) => ['id' => 'minecraft:'.$i['name'], 'name' => $i['displayName'] ?? $i['name'], 'stack' => (int) ($i['stackSize'] ?? 64)],
                    array_filter((array) $r->json(), fn ($i) => is_array($i) && isset($i['name']) && $i['name'] !== 'air')));
            });
            if (! is_array($items)) {
                throw new \RuntimeException('catalog unavailable');
            }
        } catch (\Throwable) {
            return $this->fail('The item list could not be loaded. You can still type an item ID such as minecraft:diamond.', 502);
        }

        return new JsonResponse(['version' => $pick, 'server_version' => $wanted, 'items' => $items]);
    }

    public function wipe(Request $request, Server $server, string $uuid): JsonResponse
    {
        $this->authorizeServer($request, $server, Permission::ACTION_FILE_DELETE);
        if (! $this->allowed($request, 'allow_wipe')) {
            return $this->fail('Wiping player data is disabled by the administrator.', 403);
        }
        if (! preg_match(self::UUID, $uuid)) {
            return $this->fail('Invalid player UUID.', 422);
        }
        $uuid = $this->dashed($uuid);
        $files = $this->files($server);
        $world = $this->world($this->properties($files));

        $deleted = [];
        $targets = [];
        foreach ($this->playerDirs($world) as $dirs) {
            $targets[$dirs['data']] = ["{$uuid}.dat", "{$uuid}.dat_old"];
            $targets[$dirs['stats']] = ["{$uuid}.json"];
            $targets[$dirs['advancements']] = ["{$uuid}.json"];
        }
        foreach ($targets as $dir => $names) {
            try {
                $existing = array_map(fn ($f) => $f['name'], $files->getDirectory($dir));
                $targets = array_values(array_intersect($names, $existing));
                if ($targets) {
                    $files->deleteFiles($dir, $targets);
                    foreach ($targets as $t) {
                        $deleted[] = $dir.'/'.$t;
                    }
                }
            } catch (\Throwable) {
                // directory missing
            }
        }

        $this->activity('server:breefer.players.wipe', ['uuid' => $uuid, 'files' => $deleted]);

        return $this->ok(['deleted' => $deleted]);
    }

    /* ------------------------------------------------------ NBT mapping */

    private function summary(array $d): array
    {
        $pos = $d['Pos'] ?? [];
        $abilities = $d['abilities'] ?? [];

        return [
            'health' => isset($d['Health']) ? round((float) $d['Health'], 1) : null,
            'max_health' => 20,
            'food' => $d['foodLevel'] ?? null,
            'saturation' => isset($d['foodSaturationLevel']) ? round((float) $d['foodSaturationLevel'], 1) : null,
            'xp_level' => $d['XpLevel'] ?? null,
            'xp_progress' => isset($d['XpP']) ? round((float) $d['XpP'], 2) : null,
            'score' => $d['Score'] ?? null,
            'gamemode' => [0 => 'survival', 1 => 'creative', 2 => 'adventure', 3 => 'spectator'][$d['playerGameType'] ?? -1] ?? null,
            'dimension' => is_string($d['Dimension'] ?? null) ? $d['Dimension'] : ([0 => 'minecraft:overworld', -1 => 'minecraft:the_nether', 1 => 'minecraft:the_end'][$d['Dimension'] ?? 0] ?? null),
            'position' => count($pos) === 3 ? array_map(fn ($v) => (int) floor((float) $v), $pos) : null,
            'flying' => (bool) ($abilities['flying'] ?? false),
            'selected_slot' => $d['SelectedItemSlot'] ?? null,
            'effects' => array_map(fn ($e) => [
                'id' => $e['id'] ?? ($e['Id'] ?? null),
                'amplifier' => $e['amplifier'] ?? ($e['Amplifier'] ?? 0),
                'duration' => $e['duration'] ?? ($e['Duration'] ?? 0),
            ], $d['active_effects'] ?? ($d['ActiveEffects'] ?? [])),
            'last_known_name' => $d['bukkit']['lastKnownName'] ?? null,
            'last_played' => isset($d['bukkit']['lastPlayed']) && is_int($d['bukkit']['lastPlayed']) ? date(DATE_ATOM, intdiv($d['bukkit']['lastPlayed'], 1000)) : null,
            'spawn' => isset($d['SpawnX']) ? [$d['SpawnX'], $d['SpawnY'] ?? 0, $d['SpawnZ'] ?? 0] : (isset($d['respawn']['pos']) && is_array($d['respawn']['pos']) ? $d['respawn']['pos'] : null),
        ];
    }

    /** @return array<int, array<string, mixed>> */
    private function items(array $list): array
    {
        $out = [];
        foreach ($list as $item) {
            if (! is_array($item) || empty($item['id'])) {
                continue;
            }
            $out[] = $this->item($item, isset($item['Slot']) ? (int) $item['Slot'] : null);
        }

        return $out;
    }

    private function item(array $item, ?int $slot): array
    {
        $components = $item['components'] ?? [];
        $tag = $item['tag'] ?? [];
        $name = $components['minecraft:custom_name'] ?? ($tag['display']['Name'] ?? null);
        if (is_string($name) && str_starts_with($name, '{')) {
            $decoded = json_decode($name, true);
            $name = $decoded['text'] ?? $name;
        }
        $enchantments = [];
        foreach ($components['minecraft:enchantments']['levels'] ?? ($components['minecraft:enchantments'] ?? []) as $id => $level) {
            if (is_int($level)) {
                $enchantments[] = ['id' => $id, 'level' => $level];
            }
        }
        foreach ($tag['Enchantments'] ?? [] as $ench) {
            $enchantments[] = ['id' => $ench['id'] ?? '?', 'level' => $ench['lvl'] ?? 1];
        }
        $damage = $components['minecraft:damage'] ?? ($tag['Damage'] ?? null);

        return [
            'slot' => $slot,
            'id' => (string) $item['id'],
            'count' => (int) ($item['count'] ?? ($item['Count'] ?? 1)),
            'name' => is_string($name) ? $name : null,
            'enchantments' => $enchantments,
            'damage' => is_int($damage) ? $damage : null,
        ];
    }

    /** Armor and offhand for both pre- and post-1.21.5 formats. */
    private function equipment(array $d): array
    {
        $out = [];
        if (isset($d['equipment']) && is_array($d['equipment'])) {
            foreach (['head', 'chest', 'legs', 'feet', 'offhand'] as $slot) {
                if (! empty($d['equipment'][$slot]['id'])) {
                    $out[$slot] = $this->item($d['equipment'][$slot], null);
                }
            }

            return $out;
        }
        foreach ($d['Inventory'] ?? [] as $item) {
            $map = [103 => 'head', 102 => 'chest', 101 => 'legs', 100 => 'feet', -106 => 'offhand'];
            $slot = (int) ($item['Slot'] ?? 0);
            if (isset($map[$slot]) && ! empty($item['id'])) {
                $out[$map[$slot]] = $this->item($item, $slot);
            }
        }

        return $out;
    }

    private function stats(array $json): array
    {
        $s = $json['stats'] ?? [];
        $custom = $s['minecraft:custom'] ?? [];
        $sum = fn (string $key) => array_sum(array_map('intval', $s[$key] ?? []));
        $ticks = (int) ($custom['minecraft:play_time'] ?? $custom['minecraft:play_one_minute'] ?? 0);
        $walk = 0;
        foreach (['walk_one_cm', 'sprint_one_cm', 'crouch_one_cm', 'swim_one_cm', 'fly_one_cm', 'aviate_one_cm', 'boat_one_cm', 'horse_one_cm', 'minecart_one_cm'] as $k) {
            $walk += (int) ($custom['minecraft:'.$k] ?? 0);
        }

        $top = function (string $key) use ($s): array {
            $list = $s[$key] ?? [];
            arsort($list);

            return array_map(fn ($id, $count) => ['id' => $id, 'count' => (int) $count], array_keys(array_slice($list, 0, 8, true)), array_slice($list, 0, 8, true));
        };

        return $json ? [
            'play_time_hours' => round($ticks / 20 / 3600, 1),
            'deaths' => (int) ($custom['minecraft:deaths'] ?? 0),
            'player_kills' => (int) ($custom['minecraft:player_kills'] ?? 0),
            'mob_kills' => (int) ($custom['minecraft:mob_kills'] ?? 0),
            'distance_km' => round($walk / 100000, 2),
            'jumps' => (int) ($custom['minecraft:jump'] ?? 0),
            'damage_dealt' => (int) round(($custom['minecraft:damage_dealt'] ?? 0) / 10),
            'damage_taken' => (int) round(($custom['minecraft:damage_taken'] ?? 0) / 10),
            'blocks_mined' => $sum('minecraft:mined'),
            'items_crafted' => $sum('minecraft:crafted'),
            'top_mined' => $top('minecraft:mined'),
            'top_killed' => $top('minecraft:killed'),
        ] : null;
    }
}
