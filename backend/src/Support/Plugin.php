<?php

namespace Breefer\PlayerManager\Support;

use App\Contracts\Repository\SettingsRepositoryInterface;

/**
 * Static helpers describing this Breefer extension (identity, paths, settings).
 * Settings live in the panel `settings` table so they survive extension updates.
 */
final class Plugin
{
    public const ID = 'breefer-player-manager';

    public const NAME = 'Breefer Player Manager';

    /** Absolute path to the extension root (folder that holds extension.json). */
    public static function path(string $relative = ''): string
    {
        $root = dirname(__DIR__, 3);

        return $relative === '' ? $root : $root.DIRECTORY_SEPARATOR.ltrim($relative, '/\\');
    }

    /** Whether this extension is enabled in the panel (one query per request for all Breefer extensions). */
    public static function enabled(): bool
    {
        static $ids = null;
        if ($ids === null) {
            try {
                $ids = \App\Models\Extension::query()->enabled()->pluck('identifier')->all();
            } catch (\Throwable) {
                $ids = [];
            }
        }

        return in_array(self::ID, $ids, true);
    }

    public static function setting(string $key, mixed $default = null): mixed
    {
        try {
            $value = app(SettingsRepositoryInterface::class)->get(self::ID.'::'.$key, null);
        } catch (\Throwable) {
            $value = null;
        }

        return ($value === null || $value === '') ? $default : $value;
    }

    public static function bool(string $key, bool $default = false): bool
    {
        $value = self::setting($key, $default ? '1' : '0');

        return in_array(strtolower((string) $value), ['1', 'true', 'on', 'yes'], true);
    }

    public static function int(string $key, int $default = 0): int
    {
        $value = self::setting($key, null);

        return is_numeric($value) ? (int) $value : $default;
    }

    public static function set(string $key, mixed $value): void
    {
        app(SettingsRepositoryInterface::class)->set(self::ID.'::'.$key, $value === null ? null : (string) $value);
    }

    public static function userAgent(): string
    {
        return 'Breefer/'.self::ID.' (Reviactyl Panel; +'.rtrim((string) config('app.url'), '/').')';
    }
}
