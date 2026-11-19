<?php

namespace Breefer\PlayerManager\Support;

use Illuminate\Support\Facades\Log;

/**
 * Lets admins restrict where this extension's server pages appear. The panel
 * reads extension.json from disk on every frontend registry request, so updating
 * the eggIds/nestIds guards of each serverRouter entry takes effect immediately.
 */
final class RouteScope
{
    /** @return array<int, int> */
    public static function parseIds(?string $value): array
    {
        $ids = [];
        foreach (preg_split('/[\s,;]+/', (string) $value) ?: [] as $part) {
            if (ctype_digit($part) && (int) $part > 0) {
                $ids[] = (int) $part;
            }
        }

        return array_values(array_unique($ids));
    }

    public static function apply(?string $eggIds, ?string $nestIds): bool
    {
        $path = Plugin::path('extension.json');

        try {
            $manifest = json_decode((string) file_get_contents($path), true, 512, JSON_THROW_ON_ERROR);
            $eggs = self::parseIds($eggIds);
            $nests = self::parseIds($nestIds);

            foreach ($manifest['frontend']['routes']['serverRouter'] ?? [] as $i => $route) {
                unset($route['eggId'], $route['eggIds'], $route['nestId'], $route['nestIds'], $route['egg_id'], $route['egg_ids'], $route['nest_id'], $route['nest_ids']);
                if ($eggs) {
                    $route['eggIds'] = $eggs;
                }
                if ($nests) {
                    $route['nestIds'] = $nests;
                }
                $manifest['frontend']['routes']['serverRouter'][$i] = $route;
            }

            if (! is_writable($path)) {
                Log::warning('[Breefer] extension.json is not writable; page visibility could not be updated.', ['path' => $path]);

                return false;
            }

            file_put_contents($path, json_encode($manifest, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES).PHP_EOL);

            return true;
        } catch (\Throwable $exception) {
            Log::warning('[Breefer] Failed to update page visibility.', ['error' => $exception->getMessage()]);

            return false;
        }
    }

    /** @return array<int, array<string, mixed>> */
    public static function fields(): array
    {
        return [
            [
                'key' => 'scope_egg_ids',
                'label' => 'Only show for egg IDs',
                'type' => 'text',
                'default' => '',
                'section' => 'Page visibility',
                'help' => 'Comma-separated egg IDs (e.g. <code>1, 2, 5</code>). Leave both fields empty to show the page on every server.',
            ],
            [
                'key' => 'scope_nest_ids',
                'label' => 'Only show for nest IDs',
                'type' => 'text',
                'default' => '',
                'section' => 'Page visibility',
                'help' => 'Comma-separated nest IDs. A server matching either list sees the page.',
            ],
        ];
    }

    public static function saved(): void
    {
        self::apply(Plugin::setting('scope_egg_ids', ''), Plugin::setting('scope_nest_ids', ''));
    }
}
