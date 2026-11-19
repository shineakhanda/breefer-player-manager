<?php

namespace Breefer\PlayerManager\Minecraft;

/**
 * Inventory changes for one player, either as live /item commands (player online) or as
 * edits of the player's .dat file (player offline; loaded on the next join).
 *
 * Slots: container "inventory" 0-35 (0-8 hotbar), "ender" 0-26,
 * "equipment" head / chest / legs / feet / offhand.
 */
final class InventoryEditor
{
    public const ITEM_ID = '/^[a-z0-9_.\-]+:[a-z0-9_.\-\/]+$/';

    private const EQUIPMENT = ['head' => 'armor.head', 'chest' => 'armor.chest', 'legs' => 'armor.legs', 'feet' => 'armor.feet', 'offhand' => 'weapon.offhand'];

    /** Legacy (pre-1.21.5) inventory slot numbers for armor and offhand. */
    private const LEGACY_EQUIPMENT = ['head' => 103, 'chest' => 102, 'legs' => 101, 'feet' => 100, 'offhand' => -106];

    /** Validates a slot reference and returns it normalised: [container, slot]. */
    public static function slot(string $container, mixed $slot): array
    {
        return match ($container) {
            'inventory' => [$container, self::range($slot, 0, 35)],
            'ender' => [$container, self::range($slot, 0, 26)],
            'equipment' => isset(self::EQUIPMENT[(string) $slot]) ? [$container, (string) $slot] : throw new \InvalidArgumentException('Unknown equipment slot.'),
            default => throw new \InvalidArgumentException('Unknown container.'),
        };
    }

    private static function range(mixed $v, int $min, int $max): int
    {
        if (! is_numeric($v) || (int) $v < $min || (int) $v > $max) {
            throw new \InvalidArgumentException("Slot must be between {$min} and {$max}.");
        }

        return (int) $v;
    }

    /* ======================================================= live commands */

    private static function ref(array $s): string
    {
        return match ($s[0]) {
            'inventory' => 'container.'.$s[1],
            'ender' => 'enderchest.'.$s[1],
            'equipment' => self::EQUIPMENT[$s[1]],
        };
    }

    /**
     * Commands for one operation on an online player.
     *
     * @param  callable(array): bool  $occupied  tells whether a slot currently holds an item
     * @return array<int, string>
     */
    public static function commands(string $player, array $op, callable $occupied, bool $inlineModifiers): array
    {
        $cmd = fn (array $slot, string $rest) => "item replace entity {$player} ".self::ref($slot).' '.$rest;

        switch ($op['op']) {
            case 'set':
                return [$cmd($op['slot'], "with {$op['id']} {$op['count']}")];
            case 'remove':
                return [$cmd($op['slot'], 'with minecraft:air')];
            case 'count':
                // Inline item modifiers: 26.x uses the "type" key, 1.20.5–1.21.x "function". set_count is
                // idempotent, so both are sent and whichever the server understands applies.
                return $inlineModifiers
                    ? [
                        "item modify entity {$player} ".self::ref($op['slot']).' {type:"minecraft:set_count",count:'.$op['count'].'}',
                        "item modify entity {$player} ".self::ref($op['slot']).' {function:"minecraft:set_count",count:'.$op['count'].'}',
                    ]
                    : [$cmd($op['slot'], "with {$op['id']} {$op['count']}")];
            case 'move':
                [$from, $to] = [$op['from'], $op['to']];
                if ($from === $to) {
                    return [];
                }
                if (! $occupied($to)) {
                    return [
                        $cmd($to, "from entity {$player} ".self::ref($from)),
                        $cmd($from, 'with minecraft:air'),
                    ];
                }
                // Swap through a free slot.
                $temp = null;
                foreach ([['inventory', 35], ['ender', 26]] as [$container, $last]) {
                    for ($i = $last; $i >= 0 && $temp === null; $i--) {
                        $candidate = [$container, $i];
                        if ($candidate !== $from && $candidate !== $to && ! $occupied($candidate)) {
                            $temp = $candidate;
                        }
                    }
                }
                if ($temp === null) {
                    throw new \RuntimeException('Swapping needs one free inventory or ender chest slot.');
                }

                return [
                    $cmd($temp, "from entity {$player} ".self::ref($to)),
                    $cmd($to, "from entity {$player} ".self::ref($from)),
                    $cmd($from, "from entity {$player} ".self::ref($temp)),
                    $cmd($temp, 'with minecraft:air'),
                ];
        }

        throw new \InvalidArgumentException('Unknown operation.');
    }

    /* ===================================================== offline editing */

    private array $root;

    private int $dataVersion;

    private bool $modernEquipment;

    public function __construct(array $root)
    {
        $this->root = $root;
        $this->dataVersion = (int) ($root['v']['DataVersion']['v'] ?? 0);
        // 1.21.5 (data version 4325) moved armor and offhand into an "equipment" compound.
        $this->modernEquipment = isset($root['v']['equipment']) || $this->dataVersion >= 4325;
    }

    public function root(): array
    {
        return $this->root;
    }

    /** Item counts are an int "count" since 1.20.5 (data version 3837), a byte "Count" before. */
    private function modernItems(): bool
    {
        return $this->dataVersion >= 3837 || $this->dataVersion === 0;
    }

    private function newItem(string $id, int $count): array
    {
        return NbtTree::compound($this->modernItems()
            ? ['id' => NbtTree::string($id), 'count' => NbtTree::int($count)]
            : ['id' => NbtTree::string($id), 'Count' => NbtTree::byte(min($count, 127))]);
    }

    private function listName(string $container): string
    {
        return $container === 'ender' ? 'EnderItems' : 'Inventory';
    }

    /** Returns [listName, slotNumber] for list-stored slots, or null for the equipment compound. */
    private function location(array $s): ?array
    {
        if ($s[0] === 'equipment') {
            return $this->modernEquipment ? null : ['Inventory', self::LEGACY_EQUIPMENT[$s[1]]];
        }

        return [$this->listName($s[0]), $s[1]];
    }

    public function get(array $s): ?array
    {
        $loc = $this->location($s);
        if ($loc === null) {
            $item = $this->root['v']['equipment']['v'][$s[1]] ?? null;

            return $item && ! empty($item['v']['id']['v']) ? $item : null;
        }
        foreach ($this->root['v'][$loc[0]]['v'] ?? [] as $item) {
            if ((int) ($item['v']['Slot']['v'] ?? -999) === $loc[1]) {
                return $item;
            }
        }

        return null;
    }

    public function put(array $s, ?array $item): void
    {
        $loc = $this->location($s);
        if ($loc === null) {
            $this->root['v']['equipment'] ??= NbtTree::compound();
            if ($item === null) {
                unset($this->root['v']['equipment']['v'][$s[1]]);
            } else {
                unset($item['v']['Slot']);
                $this->root['v']['equipment']['v'][$s[1]] = $item;
            }

            return;
        }
        [$list, $slot] = $loc;
        $this->root['v'][$list] ??= NbtTree::list(NbtTree::COMPOUND);
        $this->root['v'][$list]['lt'] = NbtTree::COMPOUND;
        $this->root['v'][$list]['v'] = array_values(array_filter(
            $this->root['v'][$list]['v'],
            fn ($i) => (int) ($i['v']['Slot']['v'] ?? -999) !== $slot
        ));
        if ($item !== null) {
            $item['v'] = ['Slot' => NbtTree::byte($slot)] + $item['v'];
            $this->root['v'][$list]['v'][] = $item;
        }
    }

    public function apply(array $op): void
    {
        switch ($op['op']) {
            case 'set':
                $this->put($op['slot'], $this->newItem($op['id'], $op['count']));
                break;
            case 'remove':
                $this->put($op['slot'], null);
                break;
            case 'count':
                $item = $this->get($op['slot']) ?? throw new \RuntimeException('That slot is empty.');
                if (isset($item['v']['Count'])) {
                    $item['v']['Count'] = NbtTree::byte(min($op['count'], 127));
                } else {
                    $item['v']['count'] = NbtTree::int($op['count']);
                }
                $this->put($op['slot'], $item);
                break;
            case 'move':
                if ($op['from'] === $op['to']) {
                    return;
                }
                $a = $this->get($op['from']) ?? throw new \RuntimeException('There is no item in the slot you are moving from.');
                $b = $this->get($op['to']);
                $this->put($op['to'], $a);
                $this->put($op['from'], $b);
                break;
            default:
                throw new \InvalidArgumentException('Unknown operation.');
        }
    }
}
