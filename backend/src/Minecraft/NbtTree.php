<?php

namespace Breefer\PlayerManager\Minecraft;

/**
 * Lossless NBT reader/writer (Java Edition, big-endian) used to edit player files.
 *
 * Every tag is kept as ['t' => type, 'v' => value]:
 *  - compound: 'v' is an ordered array name => tag
 *  - list:     'v' is a list of tags, 'lt' is the element type
 *  - byte/int/long arrays: 'v' is the raw binary payload (untouched)
 */
final class NbtTree
{
    public const END = 0, BYTE = 1, SHORT = 2, INT = 3, LONG = 4, FLOAT = 5, DOUBLE = 6,
        BYTE_ARRAY = 7, STRING = 8, LIST = 9, COMPOUND = 10, INT_ARRAY = 11, LONG_ARRAY = 12;

    private int $offset = 0;

    private function __construct(private string $data) {}

    /** @return array{name: string, tag: array, gzip: bool} */
    public static function decode(string $binary): array
    {
        $gzip = strlen($binary) >= 2 && $binary[0] === "\x1f" && $binary[1] === "\x8b";
        if ($gzip) {
            $decoded = @gzdecode($binary);
            if ($decoded === false) {
                throw new \RuntimeException('Corrupted gzip NBT data.');
            }
            $binary = $decoded;
        }
        $reader = new self($binary);
        $type = $reader->u8();
        if ($type !== self::COMPOUND) {
            throw new \RuntimeException('NBT root must be a compound tag.');
        }
        $name = $reader->str();

        return ['name' => $name, 'tag' => ['t' => self::COMPOUND, 'v' => $reader->readCompound(0)], 'gzip' => $gzip];
    }

    public static function encode(array $tag, string $name = '', bool $gzip = true): string
    {
        $out = chr(self::COMPOUND).self::wstr($name).self::payload($tag);

        return $gzip ? gzencode($out, 6) : $out;
    }

    /* ------------------------------------------------------- constructors */

    public static function byte(int $v): array { return ['t' => self::BYTE, 'v' => $v]; }
    public static function int(int $v): array { return ['t' => self::INT, 'v' => $v]; }
    public static function string(string $v): array { return ['t' => self::STRING, 'v' => $v]; }
    public static function compound(array $children = []): array { return ['t' => self::COMPOUND, 'v' => $children]; }
    public static function list(int $elementType, array $items = []): array { return ['t' => self::LIST, 'lt' => $elementType, 'v' => $items]; }

    /* ------------------------------------------------------------ reading */

    private function need(int $n): void
    {
        if ($n < 0 || $this->offset + $n > strlen($this->data)) {
            throw new \RuntimeException('Unexpected end of NBT data.');
        }
    }

    private function u8(): int
    {
        $this->need(1);

        return ord($this->data[$this->offset++]);
    }

    private function raw(int $n): string
    {
        $this->need($n);
        $s = substr($this->data, $this->offset, $n);
        $this->offset += $n;

        return $s;
    }

    private function str(): string
    {
        $len = unpack('n', $this->raw(2))[1];

        return $this->raw($len);
    }

    private function i32(): int
    {
        $v = unpack('N', $this->raw(4))[1];

        return $v > 2147483647 ? $v - 4294967296 : $v;
    }

    private function read(int $type, int $depth): array
    {
        if ($depth > 512) {
            throw new \RuntimeException('NBT nesting too deep.');
        }

        return match ($type) {
            self::BYTE => ['t' => $type, 'v' => ($b = $this->u8()) > 127 ? $b - 256 : $b],
            self::SHORT => ['t' => $type, 'v' => ($s = unpack('n', $this->raw(2))[1]) > 32767 ? $s - 65536 : $s],
            self::INT => ['t' => $type, 'v' => $this->i32()],
            self::LONG => ['t' => $type, 'v' => unpack('J', $this->raw(8))[1]],
            self::FLOAT => ['t' => $type, 'v' => unpack('G', $this->raw(4))[1]],
            self::DOUBLE => ['t' => $type, 'v' => unpack('E', $this->raw(8))[1]],
            self::BYTE_ARRAY => ['t' => $type, 'v' => $this->raw(max(0, $this->i32()))],
            self::INT_ARRAY => ['t' => $type, 'v' => $this->raw(max(0, $this->i32()) * 4)],
            self::LONG_ARRAY => ['t' => $type, 'v' => $this->raw(max(0, $this->i32()) * 8)],
            self::STRING => ['t' => $type, 'v' => $this->str()],
            self::LIST => $this->readList($depth),
            self::COMPOUND => ['t' => $type, 'v' => $this->readCompound($depth + 1)],
            default => throw new \RuntimeException("Unknown NBT tag type {$type}."),
        };
    }

    private function readList(int $depth): array
    {
        $elementType = $this->u8();
        $len = max(0, $this->i32());
        $items = [];
        for ($i = 0; $i < $len; $i++) {
            $items[] = $this->read($elementType, $depth + 1);
        }

        return ['t' => self::LIST, 'lt' => $elementType, 'v' => $items];
    }

    private function readCompound(int $depth): array
    {
        $out = [];
        while (true) {
            $type = $this->u8();
            if ($type === self::END) {
                return $out;
            }
            $name = $this->str();
            $out[$name] = $this->read($type, $depth);
        }
    }

    /* ------------------------------------------------------------ writing */

    private static function wstr(string $s): string
    {
        if (strlen($s) > 65535) {
            throw new \RuntimeException('NBT string too long.');
        }

        return pack('n', strlen($s)).$s;
    }

    private static function payload(array $tag): string
    {
        $v = $tag['v'];

        return match ($tag['t']) {
            self::BYTE => pack('c', $v),
            self::SHORT => pack('n', $v & 0xFFFF),
            self::INT => pack('N', $v & 0xFFFFFFFF),
            self::LONG => pack('J', $v),
            self::FLOAT => pack('G', $v),
            self::DOUBLE => pack('E', $v),
            self::BYTE_ARRAY => pack('N', strlen($v)).$v,
            self::INT_ARRAY => pack('N', intdiv(strlen($v), 4)).$v,
            self::LONG_ARRAY => pack('N', intdiv(strlen($v), 8)).$v,
            self::STRING => self::wstr($v),
            self::LIST => chr($v === [] ? ($tag['lt'] ?? self::END) : $tag['lt']).pack('N', count($v)).implode('', array_map([self::class, 'payload'], $v)),
            self::COMPOUND => self::compoundPayload($v),
            default => throw new \RuntimeException('Unknown NBT tag type.'),
        };
    }

    private static function compoundPayload(array $children): string
    {
        $out = '';
        foreach ($children as $name => $child) {
            $out .= chr($child['t']).self::wstr((string) $name).self::payload($child);
        }

        return $out."\x00";
    }
}
