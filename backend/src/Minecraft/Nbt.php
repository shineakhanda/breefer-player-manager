<?php

namespace Breefer\PlayerManager\Minecraft;

/**
 * Minimal, dependency-free reader for Minecraft's binary NBT format (Java Edition, big-endian).
 * Produces nested PHP arrays. Large numeric arrays are summarised to keep payloads small.
 */
final class Nbt
{
    private const END = 0, BYTE = 1, SHORT = 2, INT = 3, LONG = 4, FLOAT = 5, DOUBLE = 6,
        BYTE_ARRAY = 7, STRING = 8, LIST = 9, COMPOUND = 10, INT_ARRAY = 11, LONG_ARRAY = 12;

    private int $offset = 0;

    private int $depth = 0;

    private function __construct(private string $data) {}

    /** Parses gzip-compressed (playerdata .dat) or raw NBT. */
    public static function parse(string $binary): array
    {
        if (strlen($binary) >= 2 && $binary[0] === "\x1f" && $binary[1] === "\x8b") {
            $decoded = @gzdecode($binary);
            if ($decoded === false) {
                throw new \RuntimeException('Corrupted gzip NBT data.');
            }
            $binary = $decoded;
        } elseif (strlen($binary) >= 2 && ord($binary[0]) === 0x78) {
            $decoded = @gzuncompress($binary);
            if ($decoded !== false) {
                $binary = $decoded;
            }
        }

        $reader = new self($binary);
        $type = $reader->byte();
        if ($type !== self::COMPOUND) {
            throw new \RuntimeException('NBT root must be a compound tag.');
        }
        $reader->string(); // root name

        return $reader->compound();
    }

    private function need(int $n): void
    {
        if ($this->offset + $n > strlen($this->data)) {
            throw new \RuntimeException('Unexpected end of NBT data.');
        }
    }

    private function byte(): int
    {
        $this->need(1);
        $v = ord($this->data[$this->offset++]);

        return $v > 127 ? $v - 256 : $v;
    }

    private function short(): int
    {
        $this->need(2);
        $v = unpack('n', substr($this->data, $this->offset, 2))[1];
        $this->offset += 2;

        return $v > 32767 ? $v - 65536 : $v;
    }

    private function int(): int
    {
        $this->need(4);
        $v = unpack('N', substr($this->data, $this->offset, 4))[1];
        $this->offset += 4;

        return $v > 2147483647 ? $v - 4294967296 : $v;
    }

    private function long(): int
    {
        $this->need(8);
        $v = unpack('J', substr($this->data, $this->offset, 8))[1];
        $this->offset += 8;

        return $v;
    }

    private function float(): float
    {
        $this->need(4);
        $v = unpack('G', substr($this->data, $this->offset, 4))[1];
        $this->offset += 4;

        return round($v, 4);
    }

    private function double(): float
    {
        $this->need(8);
        $v = unpack('E', substr($this->data, $this->offset, 8))[1];
        $this->offset += 8;

        return round($v, 4);
    }

    private function string(): string
    {
        $len = $this->short() & 0xFFFF;
        $this->need($len);
        $s = substr($this->data, $this->offset, $len);
        $this->offset += $len;

        return $s;
    }

    private function payload(int $type): mixed
    {
        if (++$this->depth > 512) {
            throw new \RuntimeException('NBT nesting too deep.');
        }
        try {
            return match ($type) {
                self::BYTE => $this->byte(),
                self::SHORT => $this->short(),
                self::INT => $this->int(),
                self::LONG => $this->long(),
                self::FLOAT => $this->float(),
                self::DOUBLE => $this->double(),
                self::BYTE_ARRAY => $this->array(1),
                self::STRING => $this->string(),
                self::LIST => $this->list(),
                self::COMPOUND => $this->compound(),
                self::INT_ARRAY => $this->intArray(),
                self::LONG_ARRAY => $this->array(8),
                default => throw new \RuntimeException("Unknown NBT tag type {$type}."),
            };
        } finally {
            $this->depth--;
        }
    }

    /** Skips raw arrays, returning only their length. */
    private function array(int $width): array
    {
        $len = $this->int();
        $this->need($len * $width);
        $this->offset += $len * $width;

        return ['_array' => $len];
    }

    /** Int arrays are kept when small (UUIDs are stored as 4 ints). */
    private function intArray(): array
    {
        $len = $this->int();
        if ($len > 16) {
            $this->need($len * 4);
            $this->offset += $len * 4;

            return ['_array' => $len];
        }
        $out = [];
        for ($i = 0; $i < $len; $i++) {
            $out[] = $this->int();
        }

        return $out;
    }

    private function list(): array
    {
        $type = $this->byte();
        $len = $this->int();
        $out = [];
        for ($i = 0; $i < $len; $i++) {
            $out[] = $this->payload($type);
        }

        return $out;
    }

    private function compound(): array
    {
        $out = [];
        while (true) {
            $type = $this->byte();
            if ($type === self::END) {
                break;
            }
            $name = $this->string();
            $out[$name] = $this->payload($type);
        }

        return $out;
    }
}
