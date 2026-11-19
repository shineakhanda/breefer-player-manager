# Breefer Player Manager

A player dashboard for Minecraft: live status (ping), online players, operators, whitelist, bans and banned IPs; per-player health, food, XP, position, effects, inventory / armor / ender chest (read from playerdata NBT) and statistics; actions like whitelist, op, gamemode, teleport (to coordinates or another player), give item, set/add XP, effects, heal/feed, on-screen titles, message, kick, ban, IP-ban and wipe player data. A **Server tools** tab adds broadcast, weather, time, difficulty, game rules, save-all and kick-all, and **Server settings** edits `server.properties` (MOTD, max players, difficulty, whitelist, query, view distance and more).

## Download

The ready-to-install package is [`release/breefer-player-manager-v1.2.0.rext`](release/breefer-player-manager-v1.2.0.rext). Upload it under **Admin → Extensions** in Reviactyl.

## Repository layout

```
extension.json      manifest (routes, slots, boot hook, frontend entries)
backend/            PHP: routes, controllers, boot hook, admin settings
frontend/src/       TypeScript/React source
frontend/dist/      compiled modules shipped in the .rext
release/            installable .rext package
```

## Requirements

- Reviactyl panel with the extension API `RCYL_v26` (tested against the `canary` target).
- Built and packaged with the official Reviactyl extension compiler.

## Install

**Admin area:** upload `breefer-player-manager.rext` under **Admin → Extensions** and enable it.

**Command line:** copy `breefer-player-manager.rext` into your Reviactyl root (e.g. `/var/www/reviactyl`), then:

```bash
cd /var/www/reviactyl
php artisan extensions:install breefer-player-manager --enable
php artisan optimize:clear
```

Older builds use the singular form shown in the example extension: `php artisan extension:install breefer-player-manager` then `php artisan extension:enable breefer-player-manager`.

## Usage

- Page: **Players** (server sidebar)
- Permissions: `file.read-content` to view, `control.console` for actions and server tools, `file.update` to edit server.properties, `file.delete` to wipe data

## Configuration

Admin area → sidebar group **Breefer** → **Player Manager** (root admins only). Fallback URL: `/admin/extensions/breefer-player-manager`.

Options: Per-action switches (whitelist, op, kick/ban, gamemode, give items/XP, effects, kill/clear inventory, messages/titles, teleport, server tools, server.properties editing, wipe data), hide inventories, admin bypass, page visibility.

## Data and external services

- Data: No database tables; everything is read from the server files.
- External services: Player avatars from `mc-heads.net`, item textures from `assets.mcasset.cloud` (browser side).

## Notes

- Set `enable-query=true` in server.properties to list every online player (the status ping only returns a sample of 12).
- Actions are console commands, so the server must be running.

## Development

```bash
php artisan d:extensions:dev breefer-player-manager --enable
php artisan d:extensions:watch breefer-player-manager
```

## Author

Shine Akhanda — part of the **Breefer** extension collection.

## License

MIT — see `LICENSE`.
