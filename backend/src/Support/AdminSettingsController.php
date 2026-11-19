<?php

namespace Breefer\PlayerManager\Support;

use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

/**
 * Renders and saves the admin settings page of this extension at
 * /admin/extensions/{id}. Field definitions come from \Breefer\PlayerManager\AdminFields::fields().
 *
 * Field shape: ['key','label','type'(text|password|number|textarea|toggle|select),'help','default','options'=>[value=>label],'section']
 */
class AdminSettingsController
{
    public function index(Request $request): Response
    {
        $fields = \Breefer\PlayerManager\AdminFields::fields();
        $saved = $request->session()->pull('breefer_saved', false);

        $sections = [];
        foreach ($fields as $field) {
            $sections[$field['section'] ?? 'General'][] = $field;
        }

        $html = $this->layout($sections, (bool) $saved);

        return new Response($html, 200, ['Content-Type' => 'text/html; charset=UTF-8']);
    }

    public function save(Request $request): RedirectResponse
    {
        foreach (\Breefer\PlayerManager\AdminFields::fields() as $field) {
            $key = $field['key'];
            $input = 'f_'.str_replace(['.', ':'], '_', $key);
            $type = $field['type'] ?? 'text';

            if ($type === 'toggle') {
                Plugin::set($key, $request->boolean($input) ? '1' : '0');

                continue;
            }

            $value = $request->input($input);
            if ($type === 'password' && ($value === null || $value === '')) {
                continue; // keep the stored secret when the field is left empty
            }
            if ($type === 'password' && $value === '__clear__') {
                $value = '';
            }
            if ($type === 'number') {
                $value = is_numeric($value) ? (string) (0 + $value) : (string) ($field['default'] ?? '0');
            }
            if ($type === 'select' && isset($field['options']) && ! array_key_exists((string) $value, $field['options'])) {
                $value = (string) ($field['default'] ?? '');
            }

            Plugin::set($key, is_string($value) ? trim($value) : $value);
        }

        if (method_exists(\Breefer\PlayerManager\AdminFields::class, 'saved')) {
            \Breefer\PlayerManager\AdminFields::saved();
        }

        $request->session()->flash('breefer_saved', true);

        return new RedirectResponse(url('/admin/extensions/'.Plugin::ID));
    }

    /** @param array<string, array<int, array<string, mixed>>> $sections */
    private function layout(array $sections, bool $saved): string
    {
        $e = fn ($v) => htmlspecialchars((string) $v, ENT_QUOTES, 'UTF-8');
        $title = $e(Plugin::NAME);
        $csrf = $e(csrf_token());
        $action = $e(url('/admin/extensions/'.Plugin::ID));
        $intro = method_exists(\Breefer\PlayerManager\AdminFields::class, 'intro') ? \Breefer\PlayerManager\AdminFields::intro() : '';

        $body = '';
        foreach ($sections as $name => $fields) {
            $body .= '<section class="card"><h2>'.$e($name).'</h2>';
            foreach ($fields as $f) {
                $key = $f['key'];
                $input = 'f_'.str_replace(['.', ':'], '_', $key);
                $type = $f['type'] ?? 'text';
                $value = Plugin::setting($key, $f['default'] ?? '');
                $help = isset($f['help']) ? '<small>'.$f['help'].'</small>' : '';
                $label = $e($f['label']);

                switch ($type) {
                    case 'toggle':
                        $checked = in_array(strtolower((string) $value), ['1', 'true', 'on', 'yes'], true) ? ' checked' : '';
                        $body .= "<label class=\"toggle\"><input type=\"checkbox\" name=\"{$input}\" value=\"1\"{$checked}><span>{$label}</span></label>{$help}";
                        break;
                    case 'textarea':
                        $body .= "<label class=\"field\"><span>{$label}</span><textarea name=\"{$input}\" rows=\"5\">".$e($value)."</textarea>{$help}</label>";
                        break;
                    case 'select':
                        $opts = '';
                        foreach ($f['options'] ?? [] as $ov => $ol) {
                            $sel = ((string) $ov === (string) $value) ? ' selected' : '';
                            $opts .= '<option value="'.$e($ov).'"'.$sel.'>'.$e($ol).'</option>';
                        }
                        $body .= "<label class=\"field\"><span>{$label}</span><select name=\"{$input}\">{$opts}</select>{$help}</label>";
                        break;
                    case 'password':
                        $ph = ($value !== '' && $value !== null) ? 'Saved — leave empty to keep, type __clear__ to remove' : 'Not set';
                        $body .= "<label class=\"field\"><span>{$label}</span><input type=\"password\" name=\"{$input}\" autocomplete=\"new-password\" placeholder=\"".$e($ph)."\">{$help}</label>";
                        break;
                    default:
                        $t = $type === 'number' ? 'number' : 'text';
                        $body .= "<label class=\"field\"><span>{$label}</span><input type=\"{$t}\" name=\"{$input}\" value=\"".$e($value)."\">{$help}</label>";
                }
            }
            $body .= '</section>';
        }

        $notice = $saved ? '<div class="ok">Settings saved.</div>' : '';

        return <<<HTML
<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{$title} · Settings</title>
<style>
:root{color-scheme:dark}*{box-sizing:border-box}
body{margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#0b0f17;color:#e5e7eb;font-size:14px}
.wrap{max-width:860px;margin:0 auto;padding:32px 16px 80px}
header{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:22px;flex-wrap:wrap}
header h1{font-size:22px;margin:0;display:flex;align-items:center;gap:10px}
.logo{width:36px;height:36px;border-radius:9px;background:#1e3a8a55;color:#60a5fa;display:inline-flex;align-items:center;justify-content:center;font-weight:800}
header p{margin:4px 0 0;color:#9ca3af}
a.back{color:#93c5fd;text-decoration:none;font-weight:600}
.card{background:#111827;border:1px solid #1f2937;border-radius:12px;padding:20px;margin-bottom:16px}
.card h2{margin:0 0 14px;font-size:15px}
.field{display:flex;flex-direction:column;gap:6px;margin-bottom:16px}
.field span,.toggle span{font-weight:600;font-size:13px;color:#d1d5db}
small{display:block;color:#9ca3af;font-size:12px;margin:-8px 0 16px}
.field small{margin:0}
input[type=text],input[type=number],input[type=password],select,textarea{background:#1f2937;border:1px solid #374151;color:#f9fafb;border-radius:8px;padding:9px 12px;font-size:13px;width:100%;font-family:inherit}
textarea{font-family:ui-monospace,Menlo,monospace}
input:focus,select:focus,textarea:focus{outline:none;border-color:#3b82f6;box-shadow:0 0 0 3px #3b82f633}
.toggle{display:flex;align-items:center;gap:10px;margin-bottom:14px;cursor:pointer}
.toggle input{width:18px;height:18px;accent-color:#3b82f6}
.bar{position:sticky;bottom:0;padding:14px 0;background:linear-gradient(transparent,#0b0f17 40%);display:flex;justify-content:flex-end}
button{background:#3b82f6;color:#fff;border:0;border-radius:8px;padding:10px 20px;font-weight:700;cursor:pointer;font-size:14px}
button:hover{filter:brightness(1.1)}
.ok{background:#14532d55;border:1px solid #16a34a88;padding:10px 14px;border-radius:8px;margin-bottom:16px}
.intro{color:#9ca3af;margin-bottom:16px;line-height:1.6}
code{background:#1f2937;padding:1px 6px;border-radius:5px}
</style></head>
<body><div class="wrap">
<header><div><h1><span class="logo">B</span>{$title}</h1><p>Breefer extension settings</p></div><a class="back" href="/admin/extensions">← Back to extensions</a></header>
{$notice}
<div class="intro">{$intro}</div>
<form method="post" action="{$action}"><input type="hidden" name="_token" value="{$csrf}">
{$body}
<div class="bar"><button type="submit">Save settings</button></div>
</form></div></body></html>
HTML;
    }
}
