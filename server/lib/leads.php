<?php
declare(strict_types=1);

/**
 * Campaigns, leads and calls. The owner gives a script and a list of people who ENQUIRED (from an ad or form); Jarvis' call agent talks to
 * them in the owner's words, remembers every conversation and reports back. Rules built in: it always says it is an AI assistant at the start,
 * never calls numbers marked do-not-call, stays inside the calling hours, stops when asked, and escalates warm leads to the owner.
 */

const LEAD_STATUSES = ['new', 'calling', 'interested', 'callback', 'not_interested', 'do_not_call', 'wrong_number', 'no_answer', 'done'];

function lead_phone(string $raw): ?string
{
    $d = preg_replace('/\D/', '', $raw) ?? '';
    if (strlen($d) === 12 && str_starts_with($d, '91')) {
        $d = substr($d, 2);
    }
    if (strlen($d) === 11 && $d[0] === '0') {
        $d = substr($d, 1);
    }
    return preg_match('/^[6-9]\d{9}$/', $d) ? '+91' . $d : null;
}

/** Read an .xlsx's first sheet into rows (no libraries: it is a zip of XML). */
function xlsx_rows(string $path): array
{
    $z = new ZipArchive();
    if ($z->open($path) !== true) {
        throw new RuntimeException('Excel file khul nahi payi');
    }
    $shared = [];
    if (($ss = $z->getFromName('xl/sharedStrings.xml')) !== false) {
        $x = simplexml_load_string($ss);
        foreach ($x->si as $si) {
            $t = '';
            foreach ($si->xpath('.//*[local-name()="t"]') ?: [] as $n) {
                $t .= (string) $n;
            }
            $shared[] = $t;
        }
    }
    $sheet = $z->getFromName('xl/worksheets/sheet1.xml');
    $z->close();
    if ($sheet === false) {
        throw new RuntimeException('Excel me sheet1 nahi mili');
    }
    $x = simplexml_load_string($sheet);
    $rows = [];
    foreach ($x->sheetData->row as $row) {
        $cells = [];
        foreach ($row->c as $c) {
            $col = preg_replace('/\d/', '', (string) $c['r']);
            $idx = 0;
            foreach (str_split($col) as $ch) {
                $idx = $idx * 26 + (ord($ch) - 64);
            }
            $v = (string) $c->v;
            if ((string) $c['t'] === 's') {
                $v = $shared[(int) $v] ?? '';
            } elseif ((string) $c['t'] === 'inlineStr') {
                $v = (string) $c->is->t;
            }
            $cells[$idx - 1] = $v;
        }
        if ($cells) {
            $max = max(array_keys($cells));
            $line = [];
            for ($i = 0; $i <= $max; $i++) {
                $line[] = (string) ($cells[$i] ?? '');
            }
            $rows[] = $line;
        }
    }
    return $rows;
}

/** Turn rows (first row = headers) into leads. Columns found by name: name/naam, phone/mobile/number, gender, anything else is kept as notes. */
function leads_import(int $uid, int $campaignId, array $rows): array
{
    if (count($rows) < 2) {
        throw new RuntimeException('Header + kam se kam ek lead chahiye');
    }
    $head = array_map(fn($h) => mb_strtolower(trim((string) $h)), array_shift($rows));
    $find = function (array $names) use ($head) {
        foreach ($head as $i => $h) {
            foreach ($names as $n) {
                if ($h === $n || str_contains($h, $n)) {
                    return $i;
                }
            }
        }
        return null;
    };
    $iName = $find(['name', 'naam']);
    $iPhone = $find(['phone', 'mobile', 'number', 'contact', 'mob']);
    $iGender = $find(['gender', 'sex', 'ling']);
    if ($iPhone === null) {
        throw new RuntimeException('Phone/Mobile number ka column nahi mila (header me "phone" ya "mobile" likho)');
    }
    $added = $skipped = $dupes = 0;
    $pdo = db();
    $seen = $pdo->prepare('SELECT 1 FROM leads WHERE user_id = ? AND campaign_id = ? AND phone = ?');
    $ins = $pdo->prepare('INSERT INTO leads (user_id, campaign_id, name, phone, gender, extra, status, created_at) VALUES (?,?,?,?,?,?,"new",?)');
    $dnc = $pdo->prepare('SELECT 1 FROM leads WHERE user_id = ? AND phone = ? AND status = "do_not_call" LIMIT 1');
    foreach ($rows as $r) {
        $phone = lead_phone((string) ($r[$iPhone] ?? ''));
        if (!$phone) {
            $skipped++;
            continue;
        }
        $seen->execute([$uid, $campaignId, $phone]);
        if ($seen->fetchColumn()) {
            $dupes++;
            continue;
        }
        $extra = [];
        foreach ($head as $i => $h) {
            if (!in_array($i, [$iName, $iPhone, $iGender], true) && trim((string) ($r[$i] ?? '')) !== '') {
                $extra[$h] = mb_substr((string) $r[$i], 0, 200);
            }
        }
        $g = $iGender !== null ? mb_strtolower(trim((string) ($r[$iGender] ?? ''))) : '';
        $g = preg_match('/^(m|male|man|purush|ladka|sir)/u', $g) ? 'm' : (preg_match('/^(f|female|woman|mahila|ladki|mam|madam)/u', $g) ? 'f' : '');
        $dnc->execute([$uid, $phone]);
        $status = $dnc->fetchColumn() ? 'do_not_call' : 'new';
        $ins->execute([$uid, $campaignId, mb_substr(trim((string) ($iName !== null ? ($r[$iName] ?? '') : '')), 0, 80), $phone, $g, json_encode($extra, JSON_UNESCAPED_UNICODE), time()]);
        if ($status === 'do_not_call') {
            $pdo->prepare('UPDATE leads SET status = "do_not_call" WHERE id = ?')->execute([(int) $pdo->lastInsertId()]);
        }
        $added++;
    }
    return ['added' => $added, 'skipped_bad_number' => $skipped, 'duplicates' => $dupes];
}

function campaign_get(int $uid, int $id): ?array
{
    $st = db()->prepare('SELECT * FROM campaigns WHERE id = ? AND user_id = ?');
    $st->execute([$id, $uid]);
    return db_fetch($st);
}

/** The next lead that may be called now: status new/callback/no_answer, inside the calling hours, fewer than 3 attempts, never do-not-call. */
function lead_next(int $uid, ?int $campaignId = null): ?array
{
    $h = (int) date('G');
    $st = db()->prepare(
        'SELECT l.*, c.name AS campaign_name, c.assistant_name, c.company, c.script, c.rules, c.language, c.hour_from, c.hour_to
         FROM leads l JOIN campaigns c ON c.id = l.campaign_id
         WHERE l.user_id = ? AND c.status = "active" AND l.status IN ("new","callback","no_answer") AND l.attempts < 3
           AND (l.next_call_at IS NULL OR l.next_call_at <= ?) AND ? >= c.hour_from AND ? < c.hour_to'
        . ($campaignId ? ' AND l.campaign_id = ' . (int) $campaignId : '')
        . ' ORDER BY l.status = "callback" DESC, l.attempts ASC, l.id ASC LIMIT 1'
    );
    $st->execute([$uid, time(), $h, $h]);
    return db_fetch($st);
}

/** How to address the person: sir / mam by the sheet's gender, else only "ji". */
function lead_honorific(?string $g): string
{
    return $g === 'm' ? 'sir' : ($g === 'f' ? 'mam' : 'ji');
}

function call_opening(array $c, array $lead): string
{
    $name = trim((string) $c['assistant_name']) ?: 'Jarvis';
    $company = trim((string) $c['company']);
    $who = $company !== '' ? $company . ' ka AI assistant' : 'AI assistant';
    $addr = $lead['name'] !== '' ? $lead['name'] . ' ' . lead_honorific($lead['gender'] ?? '') : 'Ji';
    $bol = ($c['assistant_gender'] ?? 'f') === 'm' ? 'bol raha hoon' : 'bol rahi hoon';
    return "Namaste $addr, main $name $bol, $who. Aapne hamare yahan enquiry ki thi, abhi do minute baat kar sakte hain?";
}

/**
 * One turn of a call. $transcript = list of ['who' => 'agent'|'lead', 'text' => ...]. Returns ['say', 'end', 'outcome', 'notes'].
 * Fixed rules are in code, not in the script, so a script cannot switch them off.
 */
function call_turn(array $campaign, array $lead, array $transcript, string $leadSaid, array $history): array
{
    if (!$transcript) { // first turn: the opening is fixed and always names the AI assistant
        return ['say' => call_opening($campaign, $lead), 'end' => false, 'outcome' => '', 'notes' => ''];
    }
    $addr = lead_honorific($lead['gender'] ?? '');
    $prompt = "You are " . ($campaign['assistant_name'] ?: 'Jarvis') . ", an AI assistant making a phone call for " . ($campaign['company'] ?: 'the owner') . ". You are talking to a person who enquired.\n"
        . "You are " . (($campaign['assistant_gender'] ?? 'f') === 'm' ? 'male: say bol raha hoon / karunga' : 'female: say bol rahi hoon / karungi') . ". "
        . "SPEAKING STYLE: natural spoken " . ($campaign['language'] ?: 'Hinglish') . ", short (one or two short sentences), warm, like a friendly office colleague, not formal or robotic. Say 'ji' / '$addr' now and then. "
        . "Do not repeat their words back and do not ask 'did you say...?'. If they ask something again, answer again patiently; never say 'I already told you'. If you could not hear or understand, say softly: 'Sorry $addr, aapki awaaz cut ho gayi thi, please ek baar phir se boliye.'\n"
        . "HARD RULES: you are an AI assistant; if asked whether you are a robot/AI/human, say honestly that you are the company's AI assistant. Never invent prices, offers, dates or facts that are not in the SCRIPT; say 'main sir se confirm karke bata dungi/dunga' instead. "
        . "If they say not interested / do not call / stop, apologise once, end the call, outcome do_not_call (or not_interested if they just decline). Wrong number -> wrong_number. If they want a call later, ask the best time, outcome callback. "
        . "If they are interested and want to talk to someone or give a time, outcome interested and note what they want. Never ask for OTP, card, bank or Aadhaar numbers. Be honest, no pressure.\n\n"
        . "SCRIPT (what the owner wants said and offered):\n" . mb_substr((string) $campaign['script'], 0, 5000) . "\n"
        . ($campaign['rules'] ? "OWNER'S EXTRA RULES:\n" . mb_substr((string) $campaign['rules'], 0, 1500) . "\n" : '')
        . "\nLEAD: name=" . ($lead['name'] ?: '(unknown)') . ", details=" . ($lead['extra'] ?: '{}') . "\n"
        . ($history ? "EARLIER CALLS WITH THIS PERSON (remember them):\n" . implode("\n", array_map(fn($h) => '- ' . date('d M', (int) $h['started_at']) . ': ' . $h['summary'], $history)) . "\n" : '')
        . "\nCALL SO FAR (data):\n" . implode("\n", array_map(fn($t) => ($t['who'] === 'agent' ? 'YOU: ' : 'THEM: ') . $t['text'], array_slice($transcript, -24))) . "\n"
        . "THEM (just now): " . mb_substr($leadSaid, 0, 600) . "\n\n"
        . "Reply with ONE JSON object: {\"say\":\"what you say next\",\"end\":false,\"outcome\":\"\",\"notes\":\"\"}. Set end=true only when the call should finish (say a short goodbye in 'say'). "
        . "outcome is one of: interested, callback, not_interested, do_not_call, wrong_number, or empty while the call continues. notes = facts you learned (budget, need, time to call back) in one line.";
    $j = json_decode(gemini_generate($prompt), true);
    $j = is_array($j) ? $j : [];
    $outcome = in_array($j['outcome'] ?? '', ['interested', 'callback', 'not_interested', 'do_not_call', 'wrong_number'], true) ? $j['outcome'] : '';
    return ['say' => mb_substr(trim((string) ($j['say'] ?? 'Ji, boliye.')), 0, 400), 'end' => !empty($j['end']), 'outcome' => $outcome, 'notes' => mb_substr((string) ($j['notes'] ?? ''), 0, 300)];
}

function lead_history(int $uid, int $leadId): array
{
    $st = db()->prepare('SELECT started_at, summary FROM call_log WHERE user_id = ? AND lead_id = ? AND summary <> "" ORDER BY id DESC LIMIT 5');
    $st->execute([$uid, $leadId]);
    return array_reverse($st->fetchAll());
}

/** After a call: summary (AI), lead status, next call time, a project note. */
function call_finish(int $uid, array $lead, array $campaign, array $transcript, int $seconds, string $outcome, string $notes): array
{
    // the live model sometimes leaks its own planning into the text: keep only what was really said
    $transcript = array_values(array_filter(array_map(function ($tline) {
        $x = preg_replace('/\s+/u', ' ', (string) ($tline['text'] ?? '')) ?? '';
        $x = trim(preg_replace('/\(?No more text[^.)]*[.)]?|Wait, I need to[^.]*\.?|[^.]*end_call[^.]*\.?/iu', '', $x) ?? $x);
        return ['who' => ($tline['who'] ?? '') === 'agent' ? 'agent' : 'lead', 'text' => mb_substr($x, 0, 600)];
    }, $transcript), fn($tline) => $tline['text'] !== ''));
    $text = implode("\n", array_map(fn($t) => ($t['who'] === 'agent' ? 'AGENT: ' : 'LEAD: ') . $t['text'], $transcript));
    $summary = $notes;
    if (count($transcript) >= 3) {
        try {
            $summary = trim(gemini_text("Summarise this sales call in 2 short Hinglish lines: what the person wants, objections, agreed next step. Then nothing else.\n\n" . mb_substr($text, 0, 6000)));
        } catch (Throwable $e) {
            $summary = $notes !== '' ? $notes : 'baat hui (summary nahi bani)';
        }
    }
    if ($outcome === '' && count($transcript) < 3) {
        $outcome = 'no_answer';
    }
    $status = in_array($outcome, LEAD_STATUSES, true) ? $outcome : 'done';
    $next = match ($status) {
        'callback' => time() + 3600 * 4,
        'no_answer' => time() + 3600 * 3,
        default => null,
    };
    $pdo = db();
    db_retry(function () use ($pdo, $uid, $lead, $text, $seconds, $summary, $status, $next, $outcome) {
        $pdo->prepare('INSERT INTO call_log (user_id, lead_id, started_at, duration, transcript, summary, outcome) VALUES (?,?,?,?,?,?,?)')
            ->execute([$uid, $lead['id'], time() - $seconds, $seconds, mb_substr($text, 0, 20000), mb_substr($summary, 0, 600), $outcome]);
        $pdo->prepare('UPDATE leads SET status = ?, summary = ?, next_call_at = ?, attempts = attempts + 1, last_call_at = ? WHERE id = ?')
            ->execute([$status, mb_substr($summary, 0, 600), $next, time(), $lead['id']]);
    });
    return ['status' => $status, 'summary' => $summary];
}

/** System instruction for a real-time (Gemini Live) call. The hard rules are here, outside the owner's script. */
function call_live_instruction(array $campaign, array $lead, array $history): string
{
    $addr = lead_honorific($lead['gender'] ?? '');
    $fem = ($campaign['assistant_gender'] ?? 'f') !== 'm';
    return "You are " . ($campaign['assistant_name'] ?: 'Jarvis') . ", an AI assistant making a phone call for " . ($campaign['company'] ?: 'the owner') . " to a person who enquired. You are " . ($fem ? 'female: say bol rahi hoon / karungi' : 'male: say bol raha hoon / karunga') . ".
"
        . "FIRST WORDS (say exactly this when the call connects): " . call_opening($campaign, $lead) . "
"
        . "SPEAKING STYLE: natural spoken " . ($campaign['language'] ?: 'Hinglish') . ", short (one or two short sentences), warm, like a friendly office colleague; not formal, not robotic. Say 'ji' / '$addr' now and then. "
        . "Let the person finish; do not repeat their words back. If you could not hear or understand, say softly: 'Sorry $addr, aapki awaaz cut ho gayi thi, please ek baar phir se boliye.' If they ask again, answer again patiently.
"
        . "HARD RULES: you are an AI assistant; if asked whether you are a robot/AI/human, say honestly that you are the company's AI assistant. Never invent prices, offers, dates or facts that are not in the SCRIPT; say 'main sir se confirm karke bata dungi' instead. "
        . "If they say not interested / do not call / stop, apologise once, say goodbye and call end_call with outcome do_not_call (or not_interested if they just decline). Wrong number -> wrong_number. If they want a call later, ask the best time, outcome callback. "
        . "If they are interested or want to meet / talk to someone, note what they want, outcome interested. Never ask for OTP, card, bank or Aadhaar numbers. Be honest, no pressure. When the conversation is finished, say a short goodbye and call end_call. Never call end_call before a real person has spoken, and stay silent while the phone is still ringing.

"
        . "SCRIPT (what the owner wants said and offered):
" . mb_substr((string) $campaign['script'], 0, 5000) . "
"
        . ($campaign['rules'] ? "OWNER'S EXTRA RULES:
" . mb_substr((string) $campaign['rules'], 0, 1500) . "
" : '')
        . "
LEAD: name=" . ($lead['name'] ?: '(unknown)') . ", details=" . ($lead['extra'] ?: '{}') . "
"
        . ($history ? "EARLIER CALLS WITH THIS PERSON (remember them):
" . implode("
", array_map(fn($h) => '- ' . date('d M', (int) $h['started_at']) . ': ' . $h['summary'], $history)) . "
" : '');
}

/** One-use token + the setup message for a Live session (the API key itself never leaves the server). */
function call_live_session(array $campaign, array $lead, array $history): array
{
    [$code, $j] = llm_http('https://generativelanguage.googleapis.com/v1alpha/auth_tokens', ['x-goog-api-key: ' . (string) cfg('gemini_api_key')],
        ['uses' => 1, 'expireTime' => gmdate('Y-m-d\TH:i:s\Z', time() + 900), 'newSessionExpireTime' => gmdate('Y-m-d\TH:i:s\Z', time() + 90)], 20);
    if ($code !== 200 || empty($j['name'])) {
        throw new RuntimeException('Live token nahi bana (HTTP ' . $code . ')');
    }
    $model = 'models/gemini-3.8-live';
    return [
        'token' => $j['name'],
        'ws'    => 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContentConstrained',
        'setup' => ['setup' => [
            'model'                    => $model,
            'generationConfig'         => ['responseModalities' => ['AUDIO'], 'speechConfig' => ['voiceConfig' => ['prebuiltVoiceConfig' => ['voiceName' => ($campaign['assistant_gender'] ?? 'f') === 'm' ? 'Charon' : 'Kore']]]],
            'systemInstruction'        => ['parts' => [['text' => call_live_instruction($campaign, $lead, $history)]]],
            'tools'                    => [['functionDeclarations' => [[
                'name' => 'end_call', 'description' => 'Finish the call after saying goodbye. Give the outcome.',
                'parameters' => ['type' => 'OBJECT', 'properties' => [
                    'outcome' => ['type' => 'STRING', 'enum' => ['interested', 'callback', 'not_interested', 'do_not_call', 'wrong_number', 'done']],
                    'notes'   => ['type' => 'STRING', 'description' => 'what you learned (budget, need, time to call back) in one line'],
                ], 'required' => ['outcome']],
            ]]]],
            'inputAudioTranscription'  => new stdClass(),
            'outputAudioTranscription' => new stdClass(),
        ]],
        'opening' => call_opening($campaign, $lead),
    ];
}
