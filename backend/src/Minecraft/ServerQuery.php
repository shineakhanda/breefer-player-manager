<?php

namespace Breefer\PlayerManager\Minecraft;

/**
 * Server List Ping (TCP, every Java server) and GameSpy4 Query (UDP, enable-query=true).
 */
final class ServerQuery
{
    /** @return array<string, mixed> */
    public static function ping(string $host, int $port, float $timeout = 2.5): array
    {
        $start = microtime(true);
        $socket = @fsockopen($host, $port, $errno, $errstr, $timeout);
        if ($socket === false) {
            throw new \RuntimeException("Server is not reachable ({$errstr}).");
        }
        stream_set_timeout($socket, (int) ceil($timeout));

        try {
            $handshake = "\x00".self::varint(767).self::varint(strlen($host)).$host.pack('n', $port).self::varint(1);
            fwrite($socket, self::varint(strlen($handshake)).$handshake);
            fwrite($socket, "\x01\x00");

            self::readVarint($socket); // packet length
            $packetId = self::readVarint($socket);
            if ($packetId !== 0) {
                throw new \RuntimeException('Unexpected ping response.');
            }
            $length = self::readVarint($socket);
            if ($length <= 0 || $length > 2 * 1024 * 1024) {
                throw new \RuntimeException('Invalid ping response length.');
            }
            $json = '';
            while (strlen($json) < $length) {
                $chunk = fread($socket, $length - strlen($json));
                if ($chunk === false || $chunk === '') {
                    break;
                }
                $json .= $chunk;
            }
        } finally {
            fclose($socket);
        }

        $data = json_decode($json, true);
        if (! is_array($data)) {
            throw new \RuntimeException('Could not decode the server status.');
        }

        return [
            'online' => (int) ($data['players']['online'] ?? 0),
            'max' => (int) ($data['players']['max'] ?? 0),
            'sample' => array_values(array_map(fn ($p) => ['name' => $p['name'] ?? '', 'uuid' => $p['id'] ?? null], $data['players']['sample'] ?? [])),
            'version' => $data['version']['name'] ?? null,
            'protocol' => $data['version']['protocol'] ?? null,
            'motd' => self::flattenChat($data['description'] ?? ''),
            'favicon' => isset($data['favicon']) && str_starts_with((string) $data['favicon'], 'data:image/') ? $data['favicon'] : null,
            'latency' => (int) round((microtime(true) - $start) * 1000),
        ];
    }

    /**
     * Full GameSpy4 stat; returns null when the query port does not answer.
     *
     * @return array{info: array<string, string>, players: array<int, string>}|null
     */
    public static function query(string $host, int $port, float $timeout = 1.5): ?array
    {
        $socket = @fsockopen('udp://'.$host, $port, $errno, $errstr, $timeout);
        if ($socket === false) {
            return null;
        }
        stream_set_timeout($socket, 0, (int) ($timeout * 1_000_000));

        try {
            $session = pack('N', random_int(1, 0x7FFFFFFF) & 0x0F0F0F0F);
            fwrite($socket, "\xFE\xFD\x09".$session);
            $response = fread($socket, 2048);
            if (! $response || strlen($response) < 6 || $response[0] !== "\x09") {
                return null;
            }
            $token = (int) rtrim(substr($response, 5), "\x00");

            fwrite($socket, "\xFE\xFD\x00".$session.pack('N', $token)."\x00\x00\x00\x00");
            $response = '';
            while (($chunk = fread($socket, 4096)) !== false && $chunk !== '') {
                $response .= $chunk;
                if (strlen($chunk) < 4096) {
                    break;
                }
            }
            if (strlen($response) < 16 || $response[0] !== "\x00") {
                return null;
            }
        } finally {
            fclose($socket);
        }

        $body = substr($response, 16); // type(1) + session(4) + "splitnum\0\x80\0"(11)
        [$infoPart, $playerPart] = array_pad(explode("\x00\x00\x01player_\x00\x00", $body, 2), 2, '');

        $info = [];
        $pairs = explode("\x00", $infoPart);
        for ($i = 0; $i + 1 < count($pairs); $i += 2) {
            if ($pairs[$i] !== '') {
                $info[$pairs[$i]] = $pairs[$i + 1];
            }
        }
        $players = array_values(array_filter(explode("\x00", $playerPart), fn ($p) => $p !== ''));

        return ['info' => $info, 'players' => $players];
    }

    private static function varint(int $value): string
    {
        $value &= 0xFFFFFFFF;
        $out = '';
        do {
            $byte = $value & 0x7F;
            $value >>= 7;
            if ($value !== 0) {
                $byte |= 0x80;
            }
            $out .= chr($byte);
        } while ($value !== 0);

        return $out;
    }

    /** @param resource $socket */
    private static function readVarint($socket): int
    {
        $value = 0;
        $shift = 0;
        do {
            $char = fread($socket, 1);
            if ($char === false || $char === '') {
                throw new \RuntimeException('Connection closed during ping.');
            }
            $byte = ord($char);
            $value |= ($byte & 0x7F) << $shift;
            $shift += 7;
            if ($shift > 35) {
                throw new \RuntimeException('VarInt too long.');
            }
        } while ($byte & 0x80);

        return $value;
    }

    private static function flattenChat(mixed $component): string
    {
        if (is_string($component)) {
            return preg_replace('/§./u', '', $component) ?? $component;
        }
        if (! is_array($component)) {
            return '';
        }
        $text = (string) ($component['text'] ?? '');
        foreach ($component['extra'] ?? [] as $extra) {
            $text .= self::flattenChat($extra);
        }

        return preg_replace('/§./u', '', $text) ?? $text;
    }
}
