<?php

namespace Breefer\PlayerManager\Http;

use App\Models\Permission;
use App\Models\Server;
use App\Repositories\Agent\DaemonFileRepository;
use Breefer\PlayerManager\Minecraft\Nbt;
use Breefer\PlayerManager\Minecraft\ServerQuery;
use Breefer\PlayerManager\Support\BaseController;
use Breefer\PlayerManager\Support\Plugin;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;

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
        'spawn-monsters' => 'bool', 'spawn-protection' => 'int:0:1000', 'view-distance' => 'int:2:32', 'simulation-distance' => 'int:2:32',
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
            [$host, $port] = $this->address($server);
            try {
                $status = ServerQuery::ping($host, $port);
                $status['reachable'] = true;
            } catch (\Throwable $exception) {
                return ['reachable' => false, 'error' => $exception->getMessage(), 'online' => 0, 'max' => 0, 'sample' => []];
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

        try {
            $dat = $files->getDirectory($world.'/playerdata');
            $withData = [];
            foreach ($dat as $file) {
                if (preg_match('/^([0-9a-f\-]{36})\.dat$/i', $file['name'], $m)) {
                    $withData[strtolower($m[1])] = $file['modified'] ?? null;
                }
            }
            foreach ($players as $k => $p) {
                if ($p['uuid'] && isset($withData[$p['uuid']])) {
                    $players[$k]['has_data'] = true;
                    $players[$k]['last_seen'] ??= $withData[$p['uuid']];
                    unset($withData[$p['uuid']]);
                }
            }
            foreach ($withData as $uuid => $modified) {
                $k = $add($uuid, null);
                $players[$k]['has_data'] = true;
                $players[$k]['last_seen'] = $modified;
            }
        } catch (\Throwable) {
            // world not generated yet
        }

        $bannedIps = array_map(fn ($e) => ['ip' => $e['ip'] ?? '', 'reason' => $e['reason'] ?? null, 'source' => $e['source'] ?? null, 'expires' => $e['expires'] ?? 'forever'], $this->json($files, 'banned-ips.json'));

        $list = array_values($players);
        usort($list, fn ($a, $b) => [$b['online'], $b['last_seen'] ?? ''] <=> [$a['online'], $a['last_seen'] ?? '']);

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

        $data = null;
        $error = null;
        try {
            $raw = $files->getContent($world.'/playerdata/'.$uuid.'.dat', 16 * 1024 * 1024);
            $data = Nbt::parse($raw);
        } catch (\Throwable $exception) {
            $error = str_contains($exception->getMessage(), 'NBT') ? $exception->getMessage() : 'No saved data yet (the player has not joined this world).';
        }

        $stats = $this->json($files, $world.'/stats/'.$uuid.'.json');
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
            $this->commands($server)->send($commands);
        } catch (\Throwable) {
            return $this->fail('The command could not be sent. Is the server running?', 409);
        }

        Cache::forget('breefer:pm:status:'.$server->id);
        $this->activity('server:breefer.players.'.$data['action'], ['player' => $name, 'ip' => $data['ip'] ?? null, 'reason' => $reason ?: null]);

        return $this->ok(['commands' => $commands]);
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
        foreach (["{$world}/playerdata" => ["{$uuid}.dat", "{$uuid}.dat_old"], "{$world}/stats" => ["{$uuid}.json"], "{$world}/advancements" => ["{$uuid}.json"]] as $dir => $names) {
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
