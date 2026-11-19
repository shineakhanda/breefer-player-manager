<?php

use Breefer\PlayerManager\Support\AdminSettingsController;
use Illuminate\Support\Facades\Route;

/*
| Endpoint: /admin/extensions/breefer-player-manager
*/
Route::get('/', [AdminSettingsController::class, 'index']);
Route::post('/', [AdminSettingsController::class, 'save']);
