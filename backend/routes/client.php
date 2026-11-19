<?php

use App\Http\Middleware\Activity\ServerSubject;
use App\Http\Middleware\Api\Client\Server\AuthenticateServerAccess;
use App\Http\Middleware\Api\Client\Server\ResourceBelongsToServer;
use Breefer\PlayerManager\Http\PlayerController;
use Illuminate\Support\Facades\Route;

/*
| Endpoint: /api/client/extensions/breefer-player-manager/servers/{server}
*/
Route::group([
    'prefix' => '/servers/{server}',
    'middleware' => [ServerSubject::class, AuthenticateServerAccess::class, ResourceBelongsToServer::class],
], function () {
    Route::get('/overview', [PlayerController::class, 'overview']);
    Route::get('/players', [PlayerController::class, 'players']);
    Route::get('/players/{uuid}', [PlayerController::class, 'show']);
    Route::post('/players/{uuid}/wipe', [PlayerController::class, 'wipe']);
    Route::post('/players/{uuid}/inventory', [PlayerController::class, 'inventory'])->middleware('throttle:120,1');
    Route::get('/items', [PlayerController::class, 'itemCatalog']);
    Route::get('/properties', [PlayerController::class, 'propertiesShow']);
    Route::post('/properties', [PlayerController::class, 'propertiesUpdate'])->middleware('throttle:30,1');
    Route::post('/action', [PlayerController::class, 'action'])->middleware('throttle:60,1');
});
