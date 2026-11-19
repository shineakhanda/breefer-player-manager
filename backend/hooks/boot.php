<?php

/*
 * Breefer Player Manager — boot hook.
 * Registers a PSR-4 style autoloader for this extension's classes (backend/src)
 * and wires any event listeners declared in backend/hooks/listeners.php.
 */

spl_autoload_register(static function (string $class): void {
    $prefix = 'Breefer\PlayerManager\\';
    if (strncmp($class, $prefix, strlen($prefix)) !== 0) {
        return;
    }

    $file = dirname(__DIR__).'/src/'.str_replace('\\', '/', substr($class, strlen($prefix))).'.php';
    if (is_file($file)) {
        require_once $file;
    }
});

if (is_file(__DIR__.'/listeners.php')) {
    require_once __DIR__.'/listeners.php';
}

// Native admin settings page under "Breefer" in the admin sidebar.
if (class_exists('Breefer\PlayerManager\\AdminFields') && class_exists('Breefer\PlayerManager\\Support\\AdminNav') && class_exists('Filament\\Pages\\Page')) {
    \Breefer\PlayerManager\Support\AdminNav::install();
}
