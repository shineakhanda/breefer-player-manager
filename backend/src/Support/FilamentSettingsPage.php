<?php

namespace Breefer\PlayerManager\Support;

use Filament\Actions\Action;
use Filament\Forms\Components\Select;
use Filament\Forms\Components\Textarea;
use Filament\Forms\Components\TextInput;
use Filament\Forms\Components\Toggle;
use Filament\Forms\Concerns\InteractsWithForms;
use Filament\Notifications\Notification;
use Filament\Pages\Concerns\InteractsWithHeaderActions;
use Filament\Pages\Page;
use Filament\Schemas\Components\Section;
use Filament\Schemas\Contracts\HasSchemas;
use Illuminate\Support\HtmlString;

/**
 * Native Reviactyl admin (Filament) settings page for this extension.
 * Shown in the admin sidebar under "Breefer"; fields come from \Breefer\PlayerManager\AdminFields.
 */
abstract class FilamentSettingsPage extends Page implements HasSchemas
{
    use InteractsWithForms;
    use InteractsWithHeaderActions;

    protected string $view = 'filament.pages.settings';

    public ?array $data = [];

    public static function canAccess(): bool
    {
        return (bool) (auth()->user()->root_admin ?? false) && Plugin::enabled();
    }

    public static function shouldRegisterNavigation(): bool
    {
        return static::canAccess();
    }

    public static function getNavigationGroup(): ?string
    {
        return 'Breefer';
    }

    public static function getNavigationLabel(): string
    {
        return trim(preg_replace('/^Breefer\s+/', '', Plugin::NAME) ?? Plugin::NAME);
    }

    public function getTitle(): string
    {
        return Plugin::NAME;
    }

    public function mount(): void
    {
        $state = [];
        foreach (\Breefer\PlayerManager\AdminFields::fields() as $field) {
            $type = $field['type'] ?? 'text';
            $value = Plugin::setting($field['key'], $field['default'] ?? '');
            $state[$field['key']] = match ($type) {
                'toggle' => in_array(strtolower((string) $value), ['1', 'true', 'on', 'yes'], true),
                'password' => '',
                'number' => is_numeric($value) ? 0 + $value : null,
                default => (string) $value,
            };
        }

        $this->getForm('form')?->fill($state);
    }

    protected function getFormStatePath(): ?string
    {
        return 'data';
    }

    protected function getFormSchema(): array
    {
        $sections = [];
        if (method_exists(\Breefer\PlayerManager\AdminFields::class, 'intro')) {
            $sections[] = Section::make('About')
                ->description(new HtmlString(\Breefer\PlayerManager\AdminFields::intro()))
                ->collapsible();
        }

        $grouped = [];
        foreach (\Breefer\PlayerManager\AdminFields::fields() as $field) {
            $grouped[$field['section'] ?? 'General'][] = $field;
        }

        foreach ($grouped as $name => $fields) {
            $sections[] = Section::make($name)->schema(array_map(fn (array $f) => $this->component($f), $fields));
        }

        return $sections;
    }

    /** @param array<string, mixed> $f */
    private function component(array $f): mixed
    {
        $key = $f['key'];
        $help = isset($f['help']) ? new HtmlString($f['help']) : null;

        $component = match ($f['type'] ?? 'text') {
            'toggle' => Toggle::make($key),
            'textarea' => Textarea::make($key)->rows(5),
            'select' => Select::make($key)->options($f['options'] ?? [])->native(false),
            'number' => TextInput::make($key)->numeric(),
            'password' => TextInput::make($key)->password()->revealable()
                ->placeholder(Plugin::setting($key, '') !== '' && Plugin::setting($key, '') !== null ? 'Saved — leave empty to keep, type __clear__ to remove' : 'Not set'),
            default => TextInput::make($key),
        };

        $component = $component->label($f['label']);

        return $help ? $component->helperText($help) : $component;
    }

    protected function getHeaderActions(): array
    {
        return [
            Action::make('save')
                ->label('Save')
                ->icon('tabler-device-floppy')
                ->action('save')
                ->keyBindings(['mod+s']),
        ];
    }

    public function save(): void
    {
        $data = $this->getForm('form')?->getState() ?? [];

        foreach (\Breefer\PlayerManager\AdminFields::fields() as $field) {
            $key = $field['key'];
            $type = $field['type'] ?? 'text';
            $value = $data[$key] ?? null;

            if ($type === 'toggle') {
                Plugin::set($key, $value ? '1' : '0');

                continue;
            }
            if ($type === 'password') {
                if ($value === null || $value === '') {
                    continue;
                }
                $value = $value === '__clear__' ? '' : $value;
            }
            if ($type === 'number') {
                $value = is_numeric($value) ? (string) (0 + $value) : (string) ($field['default'] ?? '0');
            }
            if ($type === 'select' && ! array_key_exists((string) $value, $field['options'] ?? [])) {
                $value = (string) ($field['default'] ?? '');
            }

            Plugin::set($key, is_string($value) ? trim($value) : $value);
        }

        if (method_exists(\Breefer\PlayerManager\AdminFields::class, 'saved')) {
            \Breefer\PlayerManager\AdminFields::saved();
        }

        $this->mount();

        Notification::make()->title(Plugin::NAME.' settings saved')->success()->send();
    }
}
