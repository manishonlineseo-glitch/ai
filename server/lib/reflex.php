<?php
declare(strict_types=1);

/**
 * Reflexes: the everyday commands whose meaning is certain from the words alone are planned here in microseconds,
 * without asking any AI (a model call costs 2-10 s). Anything not matched exactly falls through to skills and the brains.
 * Returns the same plan shape as the brains: ['reply' => ..., 'actions' => [['tool' => ..., 'input' => ...]]].
 */
function reflex_match(int $userId, string $text): ?array
{
    $t = mb_strtolower(trim(preg_replace('/\s+/u', ' ', $text) ?? ''));
    $t = rtrim($t, " .!?।");
    if ($t === '' || mb_strlen($t) > 120) {
        return null;
    }

    if (preg_match('/^(hi|hii+|hello|hey|namaste|namaskar|jarvis|hi jarvis|hello jarvis|hey jarvis)$/u', $t)) {
        return ['reply' => 'Namaste! Boliye, kya karoon?', 'actions' => []];
    }

    // time / date
    if (preg_match('/^(abhi )?(kitne baje (hain|hai|hue)|time kya (hai|hua)|samay kya hai|what(\'s| is) the time|time batao)$/u', $t)) {
        return ['reply' => 'Abhi ' . date('h:i A') . ' baje hain.', 'actions' => []];
    }
    if (preg_match('/^(aaj (ki )?(date|tarikh|tareekh) (kya hai|batao)|aaj kaun sa din hai|aaj kya (date|din) hai|what(\'s| is) (the )?date( today)?)$/u', $t)) {
        return ['reply' => 'Aaj ' . date('d F Y, l') . ' hai.', 'actions' => []];
    }

    $pc = online_agent($userId);
    $pcName = $pc ? (string) $pc['name'] : null;

    // laptop status
    if ($pcName && preg_match('/^(laptop|pc|computer)( ka)? (cpu|ram|status|battery)( (aur|and) (cpu|ram|status|battery))?( batao| dikhao| kya hai)?$|^(cpu|ram) (kitna|kya)( hai)?$/u', $t)) {
        return ['reply' => 'Laptop ka status dekh raha hoon.',
            'actions' => [['tool' => 'pc_command', 'input' => ['device' => $pcName, 'action' => 'cpu_status']]]];
    }
    // laptop lock
    if ($pcName && preg_match('/^((laptop|pc|computer)( ko)? lock( kar( do| o)?| karo)?|lock (the )?(laptop|pc|computer))$/u', $t)) {
        return ['reply' => 'Laptop lock kar raha hoon.',
            'actions' => [['tool' => 'pc_command', 'input' => ['device' => $pcName, 'action' => 'lock']]]];
    }

    $phone = brain_phone_agent($userId);

    // "youtube par <song> chala" / "play <song> on youtube"
    if (preg_match('/\b(chala|chalao|chalado|chala do|play|bajao|bajado|laga do|lagao)\b/u', $t) && preg_match('/youtube|\bsong\b|gaana|gana/u', $t)) {
        $q = preg_replace('/\b(youtube|yt|par|pe|per|me|mein|on|chalao|chala|chalado|do|play|karo|kar|bajao|bajado|laga|lagao|song|gaana|gana|ye|yeh|ek|mujhe|mere liye|please|plz|jarvis|ko|the)\b/u', ' ', $t) ?? '';
        $q = trim(preg_replace('/\s+/u', ' ', $q) ?? '');
        if (mb_strlen($q) >= 2) {
            if ($phone) {
                return ['reply' => 'Phone par "' . $q . '" chala raha hoon.',
                    'actions' => [['tool' => 'pc_command', 'input' => ['device' => $phone, 'action' => 'phone_youtube_play', 'query' => $q]]]];
            }
            return ['reply' => '"' . $q . '" YouTube par dhundh liya hai, neeche button dabao.',
                'actions' => [['tool' => 'phone_action', 'input' => ['action' => 'youtube_search', 'query' => $q]]]];
        }
    }

    // "<contact> ko call karo" / "call <contact>" (only for a name that is in the allowed contacts)
    if (preg_match('/^(?:please )?(.+?) ko (?:call|phone|fone) ?(?:karo|kar do|lagao|laga do)?$|^call (?:karo )?(.+)$/u', $t, $m)) {
        $name = trim($m[1] !== '' ? $m[1] : ($m[2] ?? ''));
        if ($name !== '' && isset(wa_contacts()[$name])) {
            if ($phone) {
                return ['reply' => $name . ' ko call lagane ke liye phone par tap karna hoga.',
                    'actions' => [['tool' => 'pc_command', 'input' => ['device' => $phone, 'action' => 'phone_call', 'contact' => $name]]]];
            }
            return ['reply' => $name . ' ko call: neeche button dabao.',
                'actions' => [['tool' => 'phone_action', 'input' => ['action' => 'call', 'contact' => $name]]]];
        }
    }
    return null;
}
