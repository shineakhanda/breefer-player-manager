<?php

namespace Breefer\PlayerManager\Support;

use App\Facades\Activity;
use App\Http\Controllers\Controller;
use App\Models\Server;
use App\Repositories\Agent\DaemonCommandRepository;
use App\Repositories\Agent\DaemonFileRepository;
use App\Repositories\Agent\DaemonPowerRepository;
use App\Repositories\Agent\DaemonServerRepository;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpKernel\Exception\AccessDeniedHttpException;

abstract class BaseController extends Controller
{
    /**
     * Ensure the authenticated user holds every one of the given server permissions.
     *
     * @param  string|array<int, string>  $permissions
     */
    protected function authorizeServer(Request $request, Server $server, string|array $permissions): void
    {
        foreach ((array) $permissions as $permission) {
            if (! $request->user()->can($permission, $server)) {
                throw new AccessDeniedHttpException('You do not have permission to perform this action ('.$permission.').');
            }
        }
    }

    protected function files(Server $server): DaemonFileRepository
    {
        return app(DaemonFileRepository::class)->setServer($server);
    }

    protected function commands(Server $server): DaemonCommandRepository
    {
        return app(DaemonCommandRepository::class)->setServer($server);
    }

    protected function power(Server $server): DaemonPowerRepository
    {
        return app(DaemonPowerRepository::class)->setServer($server);
    }

    protected function daemon(Server $server): DaemonServerRepository
    {
        return app(DaemonServerRepository::class)->setServer($server);
    }

    protected function fail(string $message, int $status = 400): JsonResponse
    {
        return new JsonResponse(['error' => $message], $status);
    }

    protected function ok(array $data = []): JsonResponse
    {
        return new JsonResponse(['success' => true] + $data);
    }

    /**
     * Records an entry in the server activity log. Never throws.
     *
     * @param  array<string, mixed>  $properties
     */
    protected function activity(string $event, array $properties = []): void
    {
        try {
            Activity::event($event)->property($properties)->log();
        } catch (\Throwable) {
            // Activity logging must never break the request.
        }
    }

    /** Joins and normalises a path inside the server container, preventing traversal. */
    protected function safePath(string ...$parts): string
    {
        $segments = [];
        foreach ($parts as $part) {
            foreach (preg_split('#[\\\\/]+#', $part) ?: [] as $segment) {
                if ($segment === '' || $segment === '.') {
                    continue;
                }
                if ($segment === '..') {
                    array_pop($segments);

                    continue;
                }
                $segments[] = $segment;
            }
        }

        return '/'.implode('/', $segments);
    }
}
