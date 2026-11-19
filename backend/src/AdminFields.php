<?php

namespace Breefer\PlayerManager;

use Breefer\PlayerManager\Support\RouteScope;

final class AdminFields
{
    public static function intro(): string
    {
        return 'Players are read from the server files (usercache, ops, whitelist, bans, playerdata and stats). '
            .'Online players come from the Minecraft status ping; enable <code>enable-query=true</code> in server.properties for the full online list on large servers. '
            .'Moderation actions are sent as console commands and need the server to be running.';
    }

    /** @return array<int, array<string, mixed>> */
    public static function fields(): array
    {
        $t = fn (string $key, string $label, string $default = '1', string $help = '') => array_filter([
            'key' => $key, 'label' => $label, 'type' => 'toggle', 'default' => $default, 'section' => 'Allowed actions', 'help' => $help ?: null,
        ]);

        return [
            $t('allow_whitelist', 'Whitelist add / remove and whitelist on / off'),
            $t('allow_op', 'Op / deop players'),
            $t('allow_moderation', 'Kick (and kick all), ban, unban and IP-ban'),
            $t('allow_gamemode', 'Change gamemode'),
            $t('allow_give', 'Give items and XP'),
            $t('allow_effects', 'Effects, heal and feed'),
            $t('allow_destructive', 'Kill player and clear inventory'),
            $t('allow_message', 'Private messages and on-screen titles'),
            $t('allow_teleport', 'Teleport players'),
            $t('allow_world', 'Server tools: broadcast, weather, time, difficulty, game rules, save-all'),
            $t('allow_properties', 'Edit server.properties', '1', 'Requires the file.update permission as well.'),
            $t('allow_wipe', 'Wipe player data (deletes files)', '1', 'Requires the file.delete permission as well.'),
            ['key' => 'allow_inventory', 'label' => 'Show inventories and ender chests', 'type' => 'toggle', 'default' => '1', 'section' => 'Privacy'],
            ['key' => 'allow_inventory_edit', 'label' => 'Allow editing inventories and ender chests (add, remove, move items)', 'type' => 'toggle', 'default' => '1', 'section' => 'Privacy',
                'help' => 'Online players are changed live with /item commands (console permission); offline players by editing their player file (file.update permission).'],
            ['key' => 'admins_bypass', 'label' => 'Root admins can always use every action', 'type' => 'toggle', 'default' => '1', 'section' => 'Privacy'],
            ...RouteScope::fields(),
        ];
    }

    public static function saved(): void
    {
        RouteScope::saved();
    }
}
