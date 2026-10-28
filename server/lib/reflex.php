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

    // Panic switch: "jarvis pause" / "jarvis ruk jao" stops every agent at once; "jarvis resume" starts them again.
    if (preg_match('/^(jarvis )?(pause|ruk jao|ruk ja|stop|sab band|sab roko)( jarvis| karo| kar do)?$/u', $t) && str_contains($t, 'jarvis')) {
        kv_set('paused_' . $userId, (string) time());
        security_alert('Jarvis PAUSE kar diya gaya (chat se)', $userId, 'pause');
        return ['reply' => 'Pause kar diya: koi bhi agent ab kaam nahi karega. Dobara chalu karne ke liye bolo "jarvis resume".', 'actions' => []];
    }
    if (preg_match('/^(jarvis )?(resume|chalu karo|chalu kar do|wapas chalu karo|start karo|continue)( jarvis)?$/u', $t) && str_contains($t, 'jarvis')) {
        kv_set('paused_' . $userId, '0');
        security_alert('Jarvis dobara chalu kiya gaya (chat se)', $userId, 'pause');
        return ['reply' => 'Chalu kar diya: agents dobara kaam karenge.', 'actions' => []];
    }

    $pc = online_agent($userId, $t);
    $pcName = $pc ? (string) $pc['name'] : null;
    $target = reflex_target($t); // 'pc' or 'phone': from the words, else the device the owner is speaking from

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

    $phone = brain_phone_agent($userId, $t);

    // "youtube par <song> chala" / "play <song> on youtube"
    if (preg_match('/\b(chala|chalao|chalado|chala do|play|bajao|bajado|baja do|baja de|baja dena|baja|laga do|lagao)\b/u', $t) && preg_match('/youtube|\bsong\b|gaana|gana/u', $t)) {
        $q = preg_replace('/\b(youtube|yt|par|pe|per|me|mein|mai|on|ka|ki|ke|mobile|phone|laptop|pc|computer|mere|baja|dena|do|de|chalao|chala|chalado|do|play|karo|kar|bajao|bajado|laga|lagao|song|gaana|gana|ye|yeh|ek|mujhe|mere liye|please|plz|jarvis|ko|the)\b/u', ' ', $t) ?? '';
        $q = trim(preg_replace('/\s+/u', ' ', $q) ?? '');
        if (mb_strlen($q) >= 2) {
            if ($target === 'pc' && $pcName) { // spoken to / about the laptop: open the YouTube results there
                return ['reply' => 'Laptop par "' . $q . '" YouTube par khol raha hoon.',
                    'actions' => [['tool' => 'pc_command', 'input' => ['device' => $pcName, 'action' => 'open_url', 'url' => 'https://www.youtube.com/results?search_query=' . rawurlencode($q)]]]];
            }
            if ($phone) {
                return ['reply' => 'Phone par "' . $q . '" chala raha hoon.',
                    'actions' => [['tool' => 'pc_command', 'input' => ['device' => $phone, 'action' => 'phone_youtube_play', 'query' => $q]]]];
            }
            return ['reply' => '"' . $q . '" YouTube par dhundh liya hai, neeche button dabao.',
                'actions' => [['tool' => 'phone_action', 'input' => ['action' => 'youtube_search', 'query' => $q]]]];
        }
    }

    // "laptop me chrome kholo" / "youtube kholo": opened by rule, no AI call, so it starts in about a second
    if ($open = reflex_open($t, $target)) {
        if (($open['cmd']['action'] ?? '') === 'phone_open_url') {
            $ph = brain_phone_agent($userId, $t);
            if ($ph) {
                return ['reply' => $open['label'] . ' phone par khol raha hoon.',
                    'actions' => [['tool' => 'pc_command', 'input' => ['device' => $ph] + $open['cmd']]]];
            }
            $open['cmd']['action'] = 'open_url'; // no phone agent online: use the laptop
        }
        if (!$pcName) {
            return ['reply' => 'Laptop agent abhi offline hai, isliye ' . $open['label'] . ' nahi khol sakta. Laptop par Jarvis agent chalu karo.', 'actions' => []];
        }
        return ['reply' => $open['label'] . ' khol raha hoon.',
            'actions' => [['tool' => 'pc_command', 'input' => ['device' => $pcName] + $open['cmd']]]];
    }

    // "claude par kya chal raha hai" / "claude ki history batao": read the laptop's Claude Code session records, no AI call
    if (preg_match('/claude|clod|cloud|clode|क्लॉड|क्लाउड|क्लोड/u', $t)
        && preg_match('/kya (chal|chl|kam|kaam)|kaun|kis (par|pe|per)|kis ka|history|histry|progress|session|status|चल रहा|हिस्ट्री/u', $t)
        && !preg_match('/\b(cloud (storage|server|hosting|computing)|aws|azure)\b/u', $t)) {
        if (!$pcName) {
            return ['reply' => 'Laptop agent abhi offline hai, isliye Claude ki history nahi padh sakta.', 'actions' => []];
        }
        $hours = preg_match('/week|hafte|hafta|सप्ताह/u', $t) ? 168 : (preg_match('/\b(kal|yesterday|2 din|do din)\b/u', $t) ? 48 : 24);
        return ['reply' => 'Laptop par Claude ki chat history dekh raha hoon, jawab abhi chat me aayega.',
            'actions' => [['tool' => 'pc_command', 'input' => ['device' => $pcName, 'action' => 'claude_sessions', 'hours' => $hours]]]];
    }

    // "laptop ki awaaz badhao / kam karo / mute": the keyboard's volume keys, instant
    if (preg_match('/awaaz|awaz|volume|sound|आवाज|वॉल्यूम|mute|म्यूट/u', $t) && $pcName && !preg_match('/\b(mobile|phone|android|fone)\b|फोन|मोबाइल/u', $t)) {
        $dir = preg_match('/mute|म्यूट|band|बंद|chup/u', $t) ? 'mute' : (preg_match('/badha|bada|zyada|jyada|tez|up|increase|high|बढ़ा|बढा|ज्यादा|तेज/u', $t) ? 'up' : (preg_match('/kam|ghata|down|low|decrease|कम|घटा|धीमा/u', $t) ? 'down' : ''));
        if ($dir !== '') {
            return ['reply' => ['up' => 'Awaaz badha raha hoon.', 'down' => 'Awaaz kam kar raha hoon.', 'mute' => 'Awaaz mute/unmute kar raha hoon.'][$dir],
                'actions' => [['tool' => 'pc_command', 'input' => ['device' => $pcName, 'action' => 'volume', 'direction' => $dir, 'steps' => 5]]]];
        }
    }

    // "chrome band karo": closes the program's windows politely; the owner taps Approve first (closing can lose unsaved work)
    if ($pcName && preg_match('/^(?:laptop (?:ka |ki |ke |me |mein |par |pe )?)?(chrome|edge|notepad|calculator|paint|word|excel|vs ?code) (?:ko )?(?:band|close)(?: kar(?:o| do)?| kro)?$/u', $t, $m)) {
        $app = str_replace(' ', '', $m[1]) === 'vscode' ? 'vscode' : $m[1];
        return ['reply' => ucfirst($app) . ' band karne ke liye aapki Approve chahiye (kuch save na ho to data ja sakta hai).',
            'actions' => [['tool' => 'pc_command', 'input' => ['device' => $pcName, 'action' => 'close_app', 'app' => $app]]]];
    }

    // "google par <kuch> search karo" / "<jagah> ka rasta" / "youtube par <kuch> search karo": search pages open by rule
    if ($q = reflex_search($t)) {
        $host = brain_phone_agent($userId, $t);
        if ($target === 'phone' && $host) {
            return ['reply' => $q['label'] . ' phone par khol raha hoon.',
                'actions' => [['tool' => 'pc_command', 'input' => ['device' => $host, 'action' => 'phone_open_url', 'url' => $q['url']]]]];
        }
        if ($pcName) {
            return ['reply' => $q['label'] . ' laptop par khol raha hoon.',
                'actions' => [['tool' => 'pc_command', 'input' => ['device' => $pcName, 'action' => 'open_url', 'url' => $q['url']]]]];
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

/** Short "open <app or site>" commands (Hinglish, English or Devanagari). Returns ['label', 'cmd'] or null. */
/** "google par X search karo", "X ka rasta/map", "youtube par X search karo" -> ['label', 'url'] (null if it is not a plain search). */
function reflex_search(string $t): ?array
{
    if (mb_strlen($t) > 140 || !preg_match('/\b(search|dhundo|dhoondo|dhundh|khojo|rasta|route|direction|directions|map|maps|navigate)\b|सर्च|ढूंढो|खोजो|रास्ता/u', $t)) {
        return null;
    }
    $isMap = (bool) preg_match('/\b(rasta|route|direction|directions|map|maps|navigate)\b|रास्ता/u', $t);
    $isYt = (bool) preg_match('/youtube|यूट्यूब|\byt\b/u', $t);
    $q = preg_replace('/(^|\s)(search|dhundo|dhoondo|dhundh|khojo|rasta|route|direction|directions|map|maps|navigate|google|gugal|youtube|yt|par|pe|per|me|mein|mai|ka|ki|ke|ko|karo|kar|kro|do|de|batao|dikhao|laptop|pc|computer|mobile|phone|the|for|please|plz|jarvis|ye|yeh|ek|mujhe|chrome|browser|kholo|khol|open|aur|and|then|phir|fir|सर्च|ढूंढो|खोजो|रास्ता|गूगल|यूट्यूब|पर|का|की|के|को|करो|कर|दो|में|मे|लैपटॉप|फोन|मोबाइल)(?=\s|$)/u', ' ', $t) ?? '';
    $q = trim(preg_replace('/\s+/u', ' ', $q) ?? '');
    if (mb_strlen($q) < 2 || mb_strlen($q) > 100) {
        return null;
    }
    if ($isMap) {
        return ['label' => 'Maps me "' . $q . '"', 'url' => 'https://www.google.com/maps/search/' . rawurlencode($q)];
    }
    if ($isYt) {
        return ['label' => 'YouTube par "' . $q . '"', 'url' => 'https://www.youtube.com/results?search_query=' . rawurlencode($q)];
    }
    return ['label' => 'Google par "' . $q . '"', 'url' => 'https://www.google.com/search?q=' . rawurlencode($q)];
}

/** 'pc' or 'phone': the device the words name ("laptop par ...", "mobile me ..."), else the one the owner is speaking from. */
function reflex_target(string $t): ?string
{
    $phone = (bool) preg_match('/\b(mobile|phone|android|fone)\b|फोन|मोबाइल/u', $t);
    $pc = (bool) preg_match('/\b(laptop|pc|computer|desktop)\b|लैपटॉप|कंप्यूटर/u', $t);
    if ($pc && !$phone) {
        return 'pc';
    }
    if ($phone && !$pc) {
        return 'phone';
    }
    return $pc && $phone ? null : client_kind();
}

function reflex_open(string $t, ?string $target = 'pc'): ?array
{
    $verb = '(open|kholo|kholna|khol do|khol de|khol|kholiye|chalu karo|chalu kar do|chalao|chala do|start karo|start|launch|ओपन|खोलो|खोल|चालू|चलाओ)';
    if (!preg_match('/(^|\s)' . $verb . '(\s|$)/u', $t) || mb_strlen($t) > 90) {
        return null;
    }
    if ($target === null) {
        return null; // names both devices: let the AI sort it out
    }
    if (preg_match('/\b(aur|and|then|phir|fir|search|dhundh|dhoondh|likh|bhej|download|install|delete|band|karke)\b/u', $t)) {
        return null; // a longer job, leave it to the AI
    }
    $apps = [
        'chrome'     => ['Chrome', '/chrome|crome|क्रोम|browser|ब्राउज़र|ब्राउजर/u'],
        'edge'       => ['Edge', '/\bedge\b/u'],
        'notepad'    => ['Notepad', '/notepad|नोटपैड/u'],
        'calculator' => ['Calculator', '/calculator|calc\b|कैलकुलेटर/u'],
        'explorer'   => ['File Explorer', '/explorer|file manager|my computer|this pc|फाइल/u'],
        'vscode'     => ['VS Code', '/vs ?code|visual studio code|\bcode\b|वीएस कोड|कोड/u'],
        'paint'      => ['Paint', '/\bpaint\b/u'],
        'cmd'        => ['Command Prompt', '/\bcmd\b|command prompt/u'],
        'word'       => ['Word', '/\bword\b|ms word/u'],
        'excel'      => ['Excel', '/\bexcel\b/u'],
    ];
    $sites = [
        'https://www.youtube.com/'        => ['YouTube', '/youtube|यूट्यूब|\byt\b/u'],
        'https://mail.google.com/'        => ['Gmail', '/gmail|जीमेल/u'],
        'https://www.google.com/'         => ['Google', '/\bgoogle\b|गूगल/u'],
        'https://web.whatsapp.com/'       => ['WhatsApp Web', '/whatsapp|व्हाट्सएप|व्हाट्सऐप/u'],
        'https://github.com/'             => ['GitHub', '/github/u'],
        'https://chatgpt.com/'            => ['ChatGPT', '/chatgpt/u'],
        'https://claude.ai/'              => ['Claude', '/claude/u'],
    ];
    foreach ($sites as $url => [$label, $re]) { // a site name beats the generic word "browser"
        if (preg_match($re, $t)) {
            return ['label' => $label, 'cmd' => ['action' => $target === 'phone' ? 'phone_open_url' : 'open_url', 'url' => $url]];
        }
    }
    if (preg_match('/\b(mobile|phone|android|fone)\b|फोन|मोबाइल/u', $t)) {
        return null; // programs only exist on the laptop; "phone me <app>" goes to the AI
    }
    foreach ($apps as $app => [$label, $re]) {
        if (preg_match($re, $t)) {
            $cmd = ['action' => 'open_app', 'app' => $app];
            if ($app === 'chrome') { // "chrome open karo udaypur": whatever is left over names the Chrome profile
                $left = preg_replace('/(^|\s)(laptop|lappy|pc|computer|ka|ki|ke|me|mein|mai|par|pe|per|ko|wala|wale|wali|profile|account|chrome|crome|browser|google|क्रोम|ब्राउज़र|ब्राउजर|लैपटॉप|का|की|में|मे|पर|को|प्रोफाइल|open|kholo|kholna|khol|do|de|kar|karo|kro|krdo|chalu|chalao|chala|start|launch|the|please|plz|jarvis|ओपन|खोलो|खोल|चालू|चलाओ)(?=\s|$)/u', ' ', $t) ?? '';
                $left = trim(preg_replace('/\s+/u', ' ', $left) ?? '');
                if ($left !== '' && mb_strlen($left) <= 40) {
                    $cmd['profile'] = $left;
                }
            }
            return ['label' => $label . (isset($cmd['profile']) ? ' (' . $cmd['profile'] . ')' : ''), 'cmd' => $cmd];
        }
    }
    // Any other program ("laptop par photoshop kholo"): the agent looks it up in the Start Menu. Only when the laptop is named.
    if ($target === 'pc' && preg_match('/\b(laptop|pc|computer|desktop)\b|लैपटॉप|कंप्यूटर/u', $t)) {
        $left = preg_replace('/(^|\s)(laptop|pc|computer|desktop|ka|ki|ke|me|mein|mai|par|pe|per|ko|app|application|software|program|wala|open|kholo|kholna|khol|do|de|kar|karo|kro|krdo|chalu|chalao|chala|start|launch|the|please|plz|jarvis|ओपन|खोलो|खोल|चालू|चलाओ|लैपटॉप|कंप्यूटर|का|की|में|पर|को)(?=\s|$)/u', ' ', $t) ?? '';
        $left = trim(preg_replace('/\s+/u', ' ', $left) ?? '');
        if ($left !== '' && preg_match('/^[a-z0-9 ._\-]{2,40}$/', $left)) {
            return ['label' => $left, 'cmd' => ['action' => 'open_app', 'app' => $left]];
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
