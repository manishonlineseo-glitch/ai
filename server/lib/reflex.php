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

    // exam practice: "anatomy ka mcq pucho" / "quiz" -> a real past-paper question; then "a/b/c/d" checks it
    if ($quiz = reflex_quiz($userId, $t)) {
        return $quiz;
    }
    if ($label = med_profile_detect($userId, $text)) {
        return ['reply' => "Theek hai, aap $label hain. Ab main usi level par aasan Hinglish me samjhaunga. Practice ke liye bolo: \"anatomy ka mcq pucho\" (ya pharmacology, medicine, surgery...).", 'actions' => []];
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

const QUIZ_SUBJECTS = [
    'anatomy' => 'Anatomy', 'physiology' => 'Physiology', 'biochemistry' => 'Biochemistry', 'pathology' => 'Pathology', 'pharmacology' => 'Pharmacology',
    'microbiology' => 'Microbiology', 'forensic' => 'Forensic Medicine', 'psm' => 'Social & Preventive Medicine', 'community' => 'Social & Preventive Medicine',
    'ent' => 'ENT', 'eye' => 'Ophthalmology', 'ophthalmology' => 'Ophthalmology', 'medicine' => 'Medicine', 'surgery' => 'Surgery', 'pediatrics' => 'Pediatrics',
    'paediatrics' => 'Pediatrics', 'gynae' => 'Gynaecology & Obstetrics', 'gynaecology' => 'Gynaecology & Obstetrics', 'obstetrics' => 'Gynaecology & Obstetrics',
    'obg' => 'Gynaecology & Obstetrics', 'orthopedics' => 'Orthopaedics', 'orthopaedics' => 'Orthopaedics', 'psychiatry' => 'Psychiatry', 'dental' => 'Dental',
    'skin' => 'Skin', 'dermatology' => 'Skin', 'radiology' => 'Radiology', 'anaesthesia' => 'Anaesthesia', 'anesthesia' => 'Anaesthesia',
];

function reflex_quiz(int $userId, string $t): ?array
{
    $key = 'quiz_' . $userId;
    $db = med_db();
    if (!$db) {
        return null;
    }
    $pending = json_decode((string) kv_get($key), true);
    $pending = is_array($pending) && ($pending['ts'] ?? 0) > time() - 1800 ? $pending : null;

    // answering the open question
    if ($pending && preg_match('/^(?:option |ans(?:wer)? |ans )?\(?([abcd])\)?(?: option| hai)?$/u', $t, $m)) {
        $picked = ord($m[1]) - 97;
        $right = (int) $pending['ans'];
        kv_set($key, '');
        $res = $picked === $right ? "Sahi jawab! \u{2705}" : 'Galat. Sahi jawab: ' . chr(65 + $right) . ') ' . $pending['opts'][$right] . " \u{274C}";
        return ['reply' => $res . "\n\n" . ($pending['exp'] !== '' ? "Samjho: " . mb_substr($pending['exp'], 0, 700) . "\n\n" : '') . "Agla sawal chahiye? Bolo \"agla\".", 'actions' => []];
    }

    $next = preg_match('/^(agla|next|aur|ek aur|another)( sawal| question| mcq)?$/u', $t) && $pending !== false && kv_get('quiz_subject_' . $userId) !== null;
    $ask = preg_match('/\b(mcq|quiz|test)\b.{0,25}\b(pucho|puchho|do|dikhao|lagao|ask|karao|chahiye|de do)\b|\b(pucho|puchho)\b.{0,20}\b(mcq|quiz|sawal)\b|^(\w+( \w+)?) ka (mcq|quiz)$|^(mcq|quiz)( pucho)?$/u', $t);
    if (!$ask && !$next) {
        return null;
    }
    $subject = null;
    foreach (QUIZ_SUBJECTS as $k => $v) {
        if (preg_match('/(^|[^\p{L}])' . preg_quote($k, '/') . '([^\p{L}]|$)/u', $t)) {
            $subject = $v;
            break;
        }
    }
    if ($next && !$subject) {
        $subject = kv_get('quiz_subject_' . $userId) ?: null;
    }
    $max = (int) $db->query('SELECT MAX(id) FROM mcq')->fetchColumn();
    for ($i = 0; $i < 6; $i++) {
        $st = $db->prepare('SELECT * FROM mcq WHERE id >= ?' . ($subject ? ' AND subject = ?' : '') . ' AND length(exp) > 60 AND length(q) > 25 LIMIT 1');
        $st->execute($subject ? [random_int(1, $max), $subject] : [random_int(1, $max)]);
        if ($r = $st->fetch()) {
            break;
        }
    }
    if (empty($r)) {
        return null;
    }
    $opts = [$r['a'], $r['b'], $r['c'], $r['d']];
    kv_set($key, json_encode(['ans' => (int) $r['ans'], 'opts' => $opts, 'exp' => (string) $r['exp'], 'ts' => time()], JSON_UNESCAPED_UNICODE));
    kv_set('quiz_subject_' . $userId, $subject ?? '');
    return ['reply' => "\u{1F4DD} " . $r['subject'] . ' / ' . $r['topic'] . "\n\n" . $r['q'] . "\n\nA) {$opts[0]}\nB) {$opts[1]}\nC) {$opts[2]}\nD) {$opts[3]}\n\nJawab me sirf A, B, C ya D likho.", 'actions' => []];
}
