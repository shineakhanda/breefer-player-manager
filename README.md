# Breefer Player Manager

A player dashboard for Minecraft: live status (ping), online players, operators, whitelist, bans and banned IPs; per-player health, food, XP, position, effects and statistics; a **Minecraft-style inventory editor** for inventory, armor, offhand and ender chest (add any item from the full item list, remove, change the amount, move or swap items by click or drag and drop, live for online players and through the player file for offline players, no restart); actions like whitelist, op, gamemode, teleport (to coordinates or another player), give item, set/add XP, effects, heal/feed, on-screen titles, message, kick, ban, IP-ban and wipe player data. A **Server tools** tab adds broadcast, weather, time, difficulty, game rules, save-all and kick-all, and **Server settings** edits `server.properties` (MOTD, max players, difficulty, whitelist, query, view distance and more).

## Download

The ready-to-install package is [`release/breefer-player-manager-v1.3.0.rext`](release/breefer-player-manager-v1.3.0.rext) (also attached to the GitHub release). Upload it under **Admin → Extensions** in Reviactyl.

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

Options: Per-action switches (whitelist, op, kick/ban, gamemode, give items/XP, effects, kill/clear inventory, messages/titles, teleport, server tools, server.properties editing, wipe data), hide inventories, allow inventory editing, admin bypass, page visibility.

## Data and external services

- Data: No database tables; everything is read from the server files.
- External services: 3D player heads from `mc-heads.net`, 3D inventory icons from `minecraft.wiki` with flat textures from `assets.mcasset.cloud` as fallback (browser side); the item list comes from PrismarineJS minecraft-data via `cdn.jsdelivr.net` (panel side, cached).

## Notes

- Works with every world layout: `world/players/data` (Minecraft 26.x) and `world/playerdata` (1.21 and older). Game rule names are sent in the right style for the server version.
- Set `enable-query=true` in server.properties to list every online player (the status ping only returns a sample of 12).
- While the server is stopped, whitelist, operator, ban and IP-ban changes are written to `whitelist.json`, `ops.json`, `banned-players.json` and `banned-ips.json` and apply on the next start. In-game actions (teleport, items, effects, messages) need the server running and the player online.
- Opening an online player asks the server to save first, so inventory and position are current.
- Inventory editing: online players are changed with `/item replace` and `/item modify` commands; offline players by rewriting their `.dat` (a `.breefer-backup` copy of the previous file is kept next to it). Swapping two items needs one free inventory or ender chest slot while the player is online.
- Online mode can be switched on or off from the World card or the Server settings tab (restart required). Offline-mode players get different UUIDs, so their data does not carry over.

## Development

```bash
php artisan d:extensions:dev breefer-player-manager --enable
php artisan d:extensions:watch breefer-player-manager
```

## Author

Shine Akhanda — part of the **Breefer** extension collection.

## License

MIT — see `LICENSE`.
