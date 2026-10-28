<?php
declare(strict_types=1);

const AI_ENGINES = ['claude', 'gemini', 'codex'];
const PC_ACTIONS = [
    'cpu_status', 'speak', 'open_url', 'open_app', 'lock', 'shutdown', 'restart', 'cancel_shutdown',
    'claude_read', 'claude_work', 'gemini_read', 'gemini_work', 'codex_read', 'codex_work',
    'screen_look', 'claude_sessions', 'window_read', 'web_research', 'chrome_profiles',
    'ui_control', 'vault_ask', 'vault_fill', 'vault_sites', 'operate', 'call_run', 'call_selftest', 'volume', 'close_app',
    // run on the Android app (a device of type android), not on a PC
    'phone_status', 'phone_notify', 'phone_open_url', 'phone_youtube_play', 'phone_call', 'phone_scan_files', 'phone_trash_files',
];

const PHONE_AGENT_ACTIONS = ['phone_status', 'phone_notify', 'phone_open_url', 'phone_youtube_play', 'phone_call', 'phone_scan_files', 'phone_trash_files'];

/** Small, reversible things run on their own; anything that edits files or powers off a PC waits for a tap. */
const DEFAULT_AUTO_ACTIONS = [
    'cpu_status', 'speak', 'open_app', 'volume', 'lock', 'cancel_shutdown', 'claude_read', 'gemini_read', 'codex_read',
    'screen_look', // the owner chose "no approval": the screenshot goes to their own AI login and is never stored
    'claude_sessions', // reads the laptop's own Claude Code session records, no AI involved
    'window_read', // copies a window's text (no screenshot) and has the owner's own AI explain it
    'web_research', // read-only: a web-searching AI in an empty folder, no files or shell
    'chrome_profiles', // read-only: lists the Chrome profiles (names/emails) on the laptop
    // the owner chose a free hand on the laptop: the agent itself refuses bank/payment/password windows
    'ui_control', 'operate', 'vault_ask', 'vault_fill', 'vault_sites',
    'phone_status', 'phone_notify', 'phone_youtube_play', 'phone_scan_files', // harmless: report, notify, play a song, list files
    // phone_call and phone_trash_files always wait for a tap; phone_open_url only opens known sites without asking
];
const DEFAULT_AUTO_URL_DOMAINS = [
    'youtube.com', 'google.com', 'wa.me', 'whatsapp.com', 'github.com', 'claude.ai', 'chatgpt.com', 'gemini.google.com',
];

/** CLIs that are logged in on the laptop (config.php 'engines_ready'); only these may be used. */
function engines_ready(): array
{
    $e = cfg('engines_ready');
    return is_array($e) && $e ? array_values(array_intersect($e, AI_ENGINES)) : ['codex'];
}

function require_engine_ready(string $engine): void
{
    if (!in_array($engine, engines_ready(), true)) {
        throw new InvalidArgumentException(
            $engine . ' abhi laptop par login nahi hai. Abhi chalne wale: ' . implode(', ', engines_ready())
            . '. (Login karke config.php ke engines_ready me jodo)'
        );
    }
}

function is_ai_action(string $action): bool
{
    return (bool) preg_match('/^(claude|gemini|codex)_(read|work)$/', $action);
}

/** Actions that take a while and whose answer is announced in chat when done. */
function is_long_action(string $action): bool
{
    return is_ai_action($action) || in_array($action, ['screen_look', 'claude_sessions', 'window_read', 'cpu_status', 'web_research', 'operate', 'call_run'], true);
}

function needs_approval(string $action, array $args): bool
{
    $auto = cfg('no_confirm_actions');
    if (in_array($action, is_array($auto) ? $auto : DEFAULT_AUTO_ACTIONS, true) || in_array($action, authority_list(), true)) {
        return false;
    }
    if ($action === 'open_url' || $action === 'phone_open_url') {
        $p = parse_url((string) ($args['url'] ?? ''));
        $host = strtolower((string) ($p['host'] ?? ''));
        $domains = cfg('auto_url_domains');
        foreach (is_array($domains) ? $domains : DEFAULT_AUTO_URL_DOMAINS as $d) {
            // https only, no user:pass@ tricks, exact domain or a real subdomain of it
            if (($p['scheme'] ?? '') === 'https' && !isset($p['user']) && ($host === $d || str_ends_with($host, '.' . $d))) {
                return false;
            }
        }
    }
    return true;
}

/** Validate and normalise arguments for one PC action; throws on anything odd. */
function clean_pc_args(string $action, array $in): array
{
    if (!in_array($action, PC_ACTIONS, true)) {
        throw new InvalidArgumentException('Unknown action: ' . $action);
    }
    if (is_ai_action($action)) {
        require_engine_ready(explode('_', $action)[0]);
    }
    switch ($action) {
        case 'open_url':
            $url = trim((string) ($in['url'] ?? ''));
            $p = parse_url($url);
            if (!$p || !in_array(strtolower($p['scheme'] ?? ''), ['http', 'https'], true) || empty($p['host']) || strlen($url) > 500) {
                throw new InvalidArgumentException('url http(s) wala hona chahiye');
            }
            $profile = trim((string) ($in['profile'] ?? ''));
            if ($profile !== '' && !preg_match('/^(Default|Profile [0-9]{1,3})$/', $profile)) {
                throw new InvalidArgumentException('profile "Default" ya "Profile 12" jaisa hona chahiye');
            }
            return $profile !== '' ? ['url' => $url, 'profile' => $profile] : ['url' => $url];
        case 'volume':
            $dir = (string) ($in['direction'] ?? '');
            if (!in_array($dir, ['up', 'down', 'mute'], true)) {
                throw new InvalidArgumentException('direction up, down ya mute');
            }
            return ['direction' => $dir, 'steps' => min(max((int) ($in['steps'] ?? 5), 1), 50)];
        case 'close_app':
            $app = strtolower(trim((string) ($in['app'] ?? '')));
            if (!preg_match('/^[a-z0-9 _.\-]{1,40}$/', $app)) {
                throw new InvalidArgumentException('app ka naam galat hai');
            }
            return ['app' => $app];
        case 'open_app':
            $app = trim((string) ($in['app'] ?? ''));
            if (!preg_match('/^[A-Za-z0-9 _.\-]{1,40}$/', $app)) {
                throw new InvalidArgumentException('app ka naam galat hai');
            }
            $profile = trim((string) ($in['profile'] ?? ''));
            if ($profile !== '' && !preg_match('/^[\p{L}\p{N} _.@\-]{1,60}$/u', $profile)) {
                throw new InvalidArgumentException('profile ka naam galat hai');
            }
            return $profile !== '' ? ['app' => $app, 'profile' => $profile] : ['app' => $app];
        case 'claude_read':
        case 'claude_work':
        case 'gemini_read':
        case 'gemini_work':
        case 'codex_read':
        case 'codex_work':
            $project = trim((string) ($in['project'] ?? ''));
            $prompt = trim((string) ($in['prompt'] ?? ''));
            if (!preg_match('/^[A-Za-z0-9 _.\-]{1,40}$/', $project)) {
                throw new InvalidArgumentException('project ka naam galat hai (agent ke config me jo naam hai wahi do)');
            }
            if ($prompt === '' || mb_strlen($prompt) > 4000) {
                throw new InvalidArgumentException('prompt 1-4000 akshar ka chahiye');
            }
            return ['project' => $project, 'prompt' => $prompt, 'continue' => !empty($in['continue'])];
        case 'phone_open_url':
            $url = trim((string) ($in['url'] ?? ''));
            $p = parse_url($url);
            if (!$p || !in_array(strtolower($p['scheme'] ?? ''), ['http', 'https'], true) || empty($p['host']) || strlen($url) > 500) {
                throw new InvalidArgumentException('url http(s) wala hona chahiye');
            }
            return ['url' => $url];
        case 'phone_youtube_play':
            $query = trim((string) ($in['query'] ?? ''));
            if ($query === '' || mb_strlen($query) > 200) {
                throw new InvalidArgumentException('query 1-200 akshar ka chahiye');
            }
            return ['query' => $query];
        case 'phone_notify':
            $text = trim((string) ($in['text'] ?? ''));
            if ($text === '' || mb_strlen($text) > 300) {
                throw new InvalidArgumentException('text 1-300 akshar ka chahiye');
            }
            return ['text' => $text];
        case 'phone_call':
            // the number never comes from the model: only a contact name from the allow-list, resolved here
            $contacts = wa_contacts();
            $key = strtolower(trim((string) ($in['contact'] ?? '')));
            if (!isset($contacts[$key])) {
                throw new InvalidArgumentException('Ye contact allowed list me nahi hai. Available: ' . (implode(', ', array_keys($contacts)) ?: 'koi nahi'));
            }
            return ['contact' => $key, 'number' => '+' . $contacts[$key]];
        case 'phone_scan_files':
        case 'phone_trash_files':
            return ['kind' => 'screenshots', 'older_than_days' => min(max((int) ($in['older_than_days'] ?? 30), 1), 3650)];
        case 'phone_status':
            return [];
        case 'web_research':
            $question = trim((string) ($in['question'] ?? ''));
            if ($question === '' || mb_strlen($question) > 4000) {
                throw new InvalidArgumentException('question 1-4000 akshar ka chahiye');
            }
            return ['question' => $question, 'engine' => 'codex', 'task_id' => (int) ($in['task_id'] ?? 0)];
        case 'claude_sessions':
            return ['hours' => min(max((int) ($in['hours'] ?? 24), 1), 168)];
        case 'screen_look':
        case 'window_read':
            $engine = (string) ($in['engine'] ?? '');
            $question = trim((string) ($in['question'] ?? ''));
            $window = trim((string) ($in['window'] ?? ''));
            if ($engine !== '' && !in_array($engine, AI_ENGINES, true)) {
                throw new InvalidArgumentException('engine claude/gemini/codex me se ek ho');
            }
            if ($engine !== '') {
                require_engine_ready($engine);
            }
            if (mb_strlen($question) > 1000) {
                throw new InvalidArgumentException('question 1000 akshar se chhota ho');
            }
            if ($window !== '' && !preg_match('/^[\p{L}\p{N} _.\-()]{1,60}$/u', $window)) {
                throw new InvalidArgumentException('window ka naam galat hai (sirf title ka hissa do)');
            }
            return ['engine' => $engine, 'question' => $question, 'window' => $window];
        case 'speak':
            $text = trim((string) ($in['text'] ?? ''));
            if ($text === '' || mb_strlen($text) > 300) {
                throw new InvalidArgumentException('text 1-300 akshar ka chahiye');
            }
            return ['text' => $text];
        case 'ui_control':
            $steps = $in['ops'] ?? null;
            if (!is_array($steps) || !$steps || count($steps) > 25) {
                throw new InvalidArgumentException('ops 1-25 steps ki list ho');
            }
            return ['ops' => clean_ui_ops($steps)];
        case 'operate':
            $goal = trim((string) ($in['goal'] ?? ''));
            if ($goal === '' || mb_strlen($goal) > 1500) {
                throw new InvalidArgumentException('goal 1-1500 akshar ka chahiye');
            }
            return ['goal' => $goal, 'window' => trim((string) ($in['window'] ?? '')), 'max_steps' => min(max((int) ($in['max_steps'] ?? 15), 1), 30)];
        case 'call_selftest':
            return ['lead_id' => (int) ($in['lead_id'] ?? 0)];
        case 'call_run':
            return ['max_calls' => min(max((int) ($in['max_calls'] ?? 5), 1), 50), 'voice' => in_array($in['voice'] ?? '', ['Kore', 'Aoede', 'Leda', 'Zephyr', 'Charon', 'Puck', 'Fenrir', 'Orus'], true) ? $in['voice'] : 'Kore'];
        case 'vault_ask':
        case 'vault_fill':
            $site = trim((string) ($in['site'] ?? ''));
            if (!preg_match('/^[A-Za-z0-9 ._\-]{1,60}$/', $site)) {
                throw new InvalidArgumentException('site ka naam galat hai');
            }
            return $action === 'vault_fill' ? ['site' => $site, 'submit' => !isset($in['submit']) || !empty($in['submit'])] : ['site' => $site];
        default:
            return [];
    }
}

/** Steps the laptop may perform like a person: focus a window, click a named control, type, press a key combo, wait, read. */
function clean_ui_ops(array $steps): array
{
    $out = [];
    foreach ($steps as $s) {
        if (!is_array($s)) {
            continue;
        }
        $op = (string) ($s['op'] ?? '');
        switch ($op) {
            case 'focus':
                $out[] = ['op' => 'focus', 'window' => mb_substr(trim((string) ($s['window'] ?? '')), 0, 60)];
                break;
            case 'click':
                $out[] = isset($s['x'], $s['y']) ? ['op' => 'click', 'x' => (int) $s['x'], 'y' => (int) $s['y']] : ['op' => 'click', 'name' => mb_substr(trim((string) ($s['name'] ?? '')), 0, 80)];
                break;
            case 'type':
                $out[] = ['op' => 'type', 'text' => mb_substr((string) ($s['text'] ?? ''), 0, 3000), 'enter' => !empty($s['enter'])];
                break;
            case 'key':
                $keys = strtolower(trim((string) ($s['keys'] ?? '')));
                if (!preg_match('/^[a-z0-9+ ]{1,40}$/', $keys) || preg_match('/(^|\+)(win|windows|cmd|meta)(\+|$)|alt\+f4|ctrl\+alt\+del|ctrl\+shift\+esc/', $keys)) {
                    throw new InvalidArgumentException('ye key combo allowed nahi: ' . $keys);
                }
                $out[] = ['op' => 'key', 'keys' => $keys];
                break;
            case 'wait':
                $out[] = ['op' => 'wait', 'seconds' => min(max((float) ($s['seconds'] ?? 1), 0.2), 30)];
                break;
            case 'read':
                $out[] = ['op' => 'read', 'window' => mb_substr(trim((string) ($s['window'] ?? '')), 0, 60), 'max_chars' => min(max((int) ($s['max_chars'] ?? 6000), 500), 20000)];
                break;
            default:
                throw new InvalidArgumentException('unknown op: ' . $op);
        }
    }
    return $out;
}

function find_agent(int $userId, string $name): ?array
{
    $st = db()->prepare(
        'SELECT * FROM devices WHERE user_id = ? AND role = "agent" AND blocked = 0 AND lower(name) = lower(?)'
    );
    $st->execute([$userId, $name]);
    return db_fetch($st);
}

/** Queue a command for a PC agent. Risky actions wait for the owner's approval. */
function queue_command(int $userId, string $deviceName, string $action, array $in): array
{
    $agent = find_agent($userId, $deviceName);
    if (!$agent) {
        // A slightly different name ("Laptop" vs "Laptop PC") must not break the command: if exactly one agent of the
        // right kind is online, it is the one the owner means.
        $phoneAction = in_array($action, PHONE_AGENT_ACTIONS, true);
        $st = db()->prepare(
            'SELECT * FROM devices WHERE user_id = ? AND role = "agent" AND blocked = 0 AND last_seen > ? AND (type = "android") = ?'
        );
        $st->execute([$userId, time() - 30, $phoneAction ? 1 : 0]);
        $cands = $st->fetchAll();
        $agent = count($cands) === 1 ? $cands[0] : null;
    }
    if (!$agent) {
        throw new InvalidArgumentException('Is naam ka PC agent nahi mila (ya wo offline hai): ' . $deviceName);
    }
    $isPhone = ($agent['type'] ?? '') === 'android';
    if (in_array($action, PHONE_AGENT_ACTIONS, true) !== $isPhone) {
        throw new InvalidArgumentException($isPhone ? 'Ye action phone par nahi chalta, PC agent ko bhejo' : 'Ye phone ka action hai, phone agent ko bhejo');
    }
    $args = clean_pc_args($action, $in);
    $status = needs_approval($action, $args) ? 'awaiting_confirm' : 'pending';
    db()->prepare(
        'INSERT INTO commands (user_id, device_id, action, args, status, created_at, updated_at) VALUES (?,?,?,?,?,?,?)'
    )->execute([$userId, $agent['id'], $action, json_encode($args, JSON_UNESCAPED_UNICODE), $status, time(), time()]);
    return ['id' => (int) db()->lastInsertId(), 'status' => $status, 'device_id' => (int) $agent['id']];
}

function wait_for_command(int $id, int $seconds): array
{
    $st = db()->prepare('SELECT status, result FROM commands WHERE id = ?');
    for ($i = 0; $i < $seconds * 10; $i++) {
        $st->execute([$id]);
        $row = db_fetch($st);
        if ($row && in_array($row['status'], ['done', 'failed'], true)) {
            return $row;
        }
        usleep(100000);
    }
    return ['status' => 'pending', 'result' => null];
}

const PHONE_ACTIONS = ['call', 'whatsapp_chat', 'open_whatsapp', 'youtube_search', 'open_youtube', 'maps_search'];

/** Buttons to show on the device the user is talking to (collected during one chat turn). */
function ui_actions(?array $add = null): array
{
    static $list = [];
    if ($add !== null) {
        $list[] = $add;
    }
    return $list;
}

/** Builds a tap-to-open link. The tap on the user's own device is the approval. */
function phone_action(string $action, array $in): string
{
    if (!in_array($action, PHONE_ACTIONS, true)) {
        throw new InvalidArgumentException('Unknown phone action');
    }
    $contact = static function () use ($in): array {
        $contacts = wa_contacts();
        $key = strtolower(trim((string) ($in['contact'] ?? '')));
        if (!isset($contacts[$key])) {
            throw new InvalidArgumentException('Ye contact allowed list me nahi hai. Available: ' . (implode(', ', array_keys($contacts)) ?: 'koi nahi'));
        }
        return [$key, $contacts[$key]];
    };
    $query = trim((string) ($in['query'] ?? ''));
    if (in_array($action, ['youtube_search', 'maps_search'], true) && ($query === '' || mb_strlen($query) > 200)) {
        throw new InvalidArgumentException('query 1-200 akshar ka chahiye');
    }

    switch ($action) {
        case 'call':
            [$name, $num] = $contact();
            ui_actions(['label' => 'Call ' . $name, 'url' => 'tel:+' . $num]);
            return 'Tap button "Call ' . $name . '" is shown to the user. Nothing has been dialled yet.';
        case 'whatsapp_chat':
            [$name, $num] = $contact();
            $text = trim((string) ($in['text'] ?? ''));
            $url = 'https://wa.me/' . $num . ($text !== '' ? '?text=' . rawurlencode(mb_substr($text, 0, 1000)) : '');
            ui_actions(['label' => 'WhatsApp ' . $name, 'url' => $url]);
            return 'Tap button "WhatsApp ' . $name . '" is shown; it opens the chat' . ($text !== '' ? ' with the text pre-filled' : '') . ' and the user presses send themselves.';
        case 'open_whatsapp':
            ui_actions(['label' => 'Open WhatsApp', 'url' => 'whatsapp://']);
            return 'Tap button "Open WhatsApp" is shown to the user.';
        case 'youtube_search':
            ui_actions(['label' => 'YouTube: ' . $query, 'url' => 'https://www.youtube.com/results?search_query=' . rawurlencode($query)]);
            return 'Tap button for the YouTube search is shown. It lists results; it cannot auto-play.';
        case 'open_youtube':
            ui_actions(['label' => 'Open YouTube', 'url' => 'https://www.youtube.com/']);
            return 'Tap button "Open YouTube" is shown to the user.';
        default: // maps_search
            ui_actions(['label' => 'Maps: ' . $query, 'url' => 'https://www.google.com/maps/search/?api=1&query=' . rawurlencode($query)]);
            return 'Tap button for the Maps search is shown to the user.';
    }
}

function claude_tools(): array
{
    return [
        ['name' => 'phone_action',
         'description' => 'Like Siri/Google Assistant: call a contact, open a WhatsApp chat (optionally with text pre-filled), '
            . 'open WhatsApp or YouTube, search YouTube or Maps. This shows a tap button on the user\'s current device; '
            . 'it does not act by itself. Tell the user to tap the button.',
         'input_schema' => ['type' => 'object', 'properties' => [
             'action'  => ['type' => 'string', 'enum' => PHONE_ACTIONS],
             'contact' => ['type' => 'string', 'description' => 'Name from list_contacts (call, whatsapp_chat)'],
             'text'    => ['type' => 'string', 'description' => 'Optional pre-filled WhatsApp text'],
             'query'   => ['type' => 'string', 'description' => 'For youtube_search / maps_search'],
         ], 'required' => ['action']]],
        ['name' => 'add_task', 'description' => 'Add a task to the board. category: development, marketing, research, news, social or other. '
            . 'assignee "jarvis" means Jarvis does the work itself (news summary, web research, post drafts, a plan); "me" is for the user. '
            . 'Put the full brief in details.',
         'input_schema' => ['type' => 'object', 'properties' => [
             'title' => ['type' => 'string'], 'category' => ['type' => 'string', 'enum' => TASK_CATEGORIES],
             'details' => ['type' => 'string'], 'assignee' => ['type' => 'string', 'enum' => ['me', 'jarvis']],
             'due' => ['type' => 'string', 'description' => 'YYYY-MM-DD, optional'],
         ], 'required' => ['title']]],
        ['name' => 'update_task', 'description' => 'Change a task: set status (todo, doing, review, done) and/or add a note to its log.',
         'input_schema' => ['type' => 'object', 'properties' => [
             'id' => ['type' => 'integer'], 'status' => ['type' => 'string', 'enum' => TASK_STATUSES], 'note' => ['type' => 'string'],
         ], 'required' => ['id']]],
        ['name' => 'run_task', 'description' => 'Give an existing task to Jarvis to work on now (news, research, drafts, plan). The result is written to the task and appears in chat.',
         'input_schema' => ['type' => 'object', 'properties' => ['id' => ['type' => 'integer']], 'required' => ['id']]],
        ['name' => 'list_tasks', 'description' => 'List the user\'s open tasks with category and status (done ones too if asked).',
         'input_schema' => ['type' => 'object', 'properties' => ['include_done' => ['type' => 'boolean']]]],
        ['name' => 'complete_task', 'description' => 'Mark a task done by its id.',
         'input_schema' => ['type' => 'object', 'properties' => ['id' => ['type' => 'integer']], 'required' => ['id']]],
        ['name' => 'add_note', 'description' => 'Save a note for the user.',
         'input_schema' => ['type' => 'object', 'properties' => ['body' => ['type' => 'string']], 'required' => ['body']]],
        ['name' => 'list_notes', 'description' => 'List the user\'s most recent notes.',
         'input_schema' => ['type' => 'object', 'properties' => new stdClass()]],
        ['name' => 'list_devices', 'description' => 'List the user\'s devices and whether each is online.',
         'input_schema' => ['type' => 'object', 'properties' => new stdClass()]],
        ['name' => 'list_contacts', 'description' => 'List the contact names the user allowed for WhatsApp (no numbers).',
         'input_schema' => ['type' => 'object', 'properties' => new stdClass()]],
        ['name' => 'send_whatsapp',
         'description' => 'Prepare a WhatsApp message to an allowed contact. It is NEVER sent until the user taps '
            . 'Approve in the app, so tell them it is waiting for approval.',
         'input_schema' => ['type' => 'object', 'properties' => [
             'contact' => ['type' => 'string', 'description' => 'Contact name from list_contacts'],
             'text'    => ['type' => 'string'],
         ], 'required' => ['contact', 'text']]],
        ['name' => 'project_note',
         'description' => 'Write down real progress so you never forget: what was done, what comes next, a decision. One short line each. Use it after finishing or learning something about a project.',
         'input_schema' => ['type' => 'object', 'properties' => [
             'project' => ['type' => 'string', 'description' => 'Project name'],
             'text'    => ['type' => 'string'],
             'kind'    => ['type' => 'string', 'enum' => ['status', 'next', 'done', 'decision', 'fact']],
         ], 'required' => ['project', 'text']]],
        ['name' => 'project_overview',
         'description' => 'Read what is known about one project (or all): status, next steps, decisions. Use when the user asks where a project stands.',
         'input_schema' => ['type' => 'object', 'properties' => ['project' => ['type' => 'string']], 'required' => []]],
        ['name' => 'remember_style',
         'description' => 'Remember how the owner likes things done (a lasting preference or habit, e.g. "reports short Hinglish me", "SEO posts always as draft first"). Use when they tell you how to work.',
         'input_schema' => ['type' => 'object', 'properties' => ['text' => ['type' => 'string']], 'required' => ['text']]],
        ['name' => 'chrome_profile_set',
         'description' => 'Remember what a Chrome profile is for (e.g. Profile 23 = biharichatkara.in WordPress). profile can be the folder, the name or the email.',
         'input_schema' => ['type' => 'object', 'properties' => [
             'profile' => ['type' => 'string'], 'purpose' => ['type' => 'string'], 'sites' => ['type' => 'string', 'description' => 'comma separated domains'],
         ], 'required' => ['profile', 'purpose']]],
        ['name' => 'set_authority',
         'description' => 'Only when the owner clearly says to stop asking approval for a kind of action (or to ask again): allow=true/false for that action. Power off/restart, deleting files and phone calls can never be allowed.',
         'input_schema' => ['type' => 'object', 'properties' => ['action' => ['type' => 'string', 'enum' => PC_ACTIONS], 'allow' => ['type' => 'boolean']], 'required' => ['action', 'allow']]],
        ['name' => 'pc_command',
         'description' => 'Send an action to one of the user\'s PCs (a device with role agent). Risky actions are '
            . 'held until the user approves them in the app; say so instead of claiming they ran.',
         'input_schema' => ['type' => 'object', 'properties' => [
             'device' => ['type' => 'string', 'description' => 'Exact PC agent name from list_devices'],
             'action' => ['type' => 'string', 'enum' => PC_ACTIONS],
             'url'    => ['type' => 'string', 'description' => 'For open_url'],
             'profile' => ['type' => 'string', 'description' => 'For open_url: Chrome profile folder (Default, Profile 23...) from CHROME PROFILES; omit for the default profile. To just open a Chrome profile use open_url with that profile and url https://www.google.com (never open_app chrome)'],
             'app'    => ['type' => 'string', 'description' => 'For open_app: a name from the agent\'s allowlist'],
             'text'   => ['type' => 'string', 'description' => 'For speak'],
             'question' => ['type' => 'string', 'description' => 'For web_research: what to research on the web (also for screen_look: what to find out)'],
             'number'   => ['type' => 'string', 'description' => 'never set this yourself'],
             'older_than_days' => ['type' => 'integer', 'description' => 'For phone_scan_files/phone_trash_files: only screenshots older than this (default 30)'],
             'query'    => ['type' => 'string', 'description' => 'For phone_youtube_play: song/video to search and play'],
             'contact'  => ['type' => 'string', 'description' => 'For phone_call: contact name from the allowed list'],
             'direction' => ['type' => 'string', 'description' => 'For volume: up, down or mute (action volume changes the laptop sound; close_app closes a program by name, needs approval)'],
             'hours'    => ['type' => 'integer', 'description' => 'For claude_sessions: how many past hours to include (default 24)'],
             'question' => ['type' => 'string', 'description' => 'For screen_look: what to find out from the screenshot (optional)'],
             'window'   => ['type' => 'string', 'description' => 'For screen_look/window_read: part of a window title (e.g. "Claude") to bring to the front before the screenshot (optional)'],
             'goal'     => ['type' => 'string', 'description' => 'For operate: the whole job to do on the PC like a person (e.g. "open Claude, attach C:\\x\\a.php and ask it to audit it, then read the answer")'],
             'max_steps' => ['type' => 'integer', 'description' => 'For operate: step limit (default 15)'],
             'site'     => ['type' => 'string', 'description' => 'For vault_ask/vault_fill: site name the owner stored a login for'],
             'ops'      => ['type' => 'array', 'description' => 'For ui_control: steps {op: focus|click|type|key|wait|read, window, name, text, enter, keys, seconds}', 'items' => ['type' => 'object']],
             'engine'   => ['type' => 'string', 'enum' => AI_ENGINES, 'description' => 'For screen_look: which AI reads the screenshot (default: the brain engine)'],
             'project'  => ['type' => 'string', 'description' => 'For the *_read/*_work actions: project name from the PC agent\'s allowlist'],
             'prompt'   => ['type' => 'string', 'description' => 'For the *_read/*_work actions: the full, self-contained instruction for the AI CLI on that PC'],
             'continue' => ['type' => 'boolean', 'description' => 'For the *_read/*_work actions: continue the previous session of that project'],
         ], 'required' => ['device', 'action']]],
    ];
}

function run_tool(string $name, array $in, int $userId): string
{
    $pdo = db();
    try {
        switch ($name) {
            case 'add_task':
                try {
                    $id = task_add($userId, (string) ($in['title'] ?? ''), (string) ($in['category'] ?? 'other'), (string) ($in['details'] ?? ''),
                        (string) ($in['assignee'] ?? 'me'), isset($in['due']) ? (string) $in['due'] : null);
                } catch (InvalidArgumentException $e) {
                    return 'Error: ' . $e->getMessage();
                }
                return 'Task added with id ' . $id . (($in['assignee'] ?? '') === 'jarvis' ? '; Jarvis will work on it within a minute and post the result in chat.' : '.');

            case 'update_task':
                $tid = (int) ($in['id'] ?? 0);
                if (!task_get($userId, $tid)) {
                    return 'Error: us id ka task nahi mila';
                }
                if (!empty($in['status']) && !task_set_status($userId, $tid, (string) $in['status'])) {
                    return 'Error: status todo/doing/review/done me se ek ho';
                }
                if (!empty($in['note'])) {
                    task_log($tid, $userId, 'jarvis', mb_substr((string) $in['note'], 0, 1000));
                }
                return 'Task updated.';

            case 'run_task':
                return task_give_to_jarvis($userId, (int) ($in['id'] ?? 0))
                    ? 'Task handed to Jarvis; it starts within a minute and the result appears in chat.'
                    : 'Error: us id ka task nahi mila';

            case 'list_tasks':
                $sql = 'SELECT id, title, category, status, assignee FROM tasks WHERE user_id = ?' . (empty($in['include_done']) ? ' AND status <> "done"' : '') . ' ORDER BY id DESC LIMIT 50';
                $st = $pdo->prepare($sql);
                $st->execute([$userId]);
                $rows = $st->fetchAll();
                return $rows ? implode("\n", array_map(fn($r) => '#' . $r['id'] . ' [' . $r['category'] . '/' . $r['status'] . ($r['assignee'] === 'jarvis' ? '/jarvis' : '') . '] ' . $r['title'], $rows)) : 'No tasks.';

            case 'complete_task':
                return task_set_status($userId, (int) ($in['id'] ?? 0), 'done') ? 'Done.' : 'Error: us id ka task nahi mila';

            case 'add_note':
                $b = trim((string) ($in['body'] ?? ''));
                if ($b === '' || mb_strlen($b) > 2000) {
                    return 'Error: note 1-2000 akshar ka chahiye';
                }
                $pdo->prepare('INSERT INTO notes (user_id, body, created_at) VALUES (?,?,?)')->execute([$userId, $b, time()]);
                return 'Note saved.';

            case 'list_notes':
                $st = $pdo->prepare('SELECT id, body FROM notes WHERE user_id = ? ORDER BY id DESC LIMIT 20');
                $st->execute([$userId]);
                $rows = $st->fetchAll();
                return $rows ? implode("\n", array_map(fn($r) => '#' . $r['id'] . ': ' . $r['body'], $rows)) : 'No notes.';

            case 'project_note':
                return 'Saved note #' . memory_add($userId, (string) ($in['project'] ?? ''), (string) ($in['kind'] ?? 'status'), (string) ($in['text'] ?? ''));

            case 'project_overview':
                return memory_overview($userId, isset($in['project']) && trim((string) $in['project']) !== '' ? (string) $in['project'] : null);

            case 'remember_style':
                return 'Yaad rakh liya #' . memory_add($userId, '*', 'style', (string) ($in['text'] ?? ''));

            case 'chrome_profile_set':
                return chrome_profile_set($userId, (string) ($in['profile'] ?? ''), (string) ($in['purpose'] ?? ''), (string) ($in['sites'] ?? ''));

            case 'set_authority':
                return authority_set((string) ($in['action'] ?? ''), !empty($in['allow']), (string) ($GLOBALS['jarvis_user_text'] ?? ''));

            case 'list_devices':
                $st = $pdo->prepare('SELECT name, type, role, last_seen, blocked FROM devices WHERE user_id = ? ORDER BY id');
                $st->execute([$userId]);
                return implode("\n", array_map(
                    fn($d) => $d['name'] . ' (' . $d['type'] . ', ' . $d['role'] . ', '
                        . ($d['blocked'] ? 'blocked' : (time() - (int) $d['last_seen'] < 30 ? 'online' : 'offline')) . ')',
                    $st->fetchAll()
                ));

            case 'phone_action':
                return phone_action((string) ($in['action'] ?? ''), $in);

            case 'list_contacts':
                return implode(', ', array_keys(wa_contacts())) ?: 'No contacts configured.';

            case 'send_whatsapp':
                $id = queue_whatsapp($userId, (string) ($in['contact'] ?? ''), (string) ($in['text'] ?? ''));
                return 'Message #' . $id . ' to ' . strtolower(trim((string) $in['contact']))
                    . ' is prepared but NOT sent: the user must approve it in the app (Pending section).';

            case 'pc_command':
                $q = queue_command($userId, (string) ($in['device'] ?? ''), (string) ($in['action'] ?? ''), $in);
                if ($q['status'] === 'awaiting_confirm') {
                    return 'Queued as #' . $q['id'] . ' but NOT run yet: it needs the user\'s approval in the app (Pending section).';
                }
                if (!empty($GLOBALS['jarvis_no_wait'])) { // inside the agent's own request: don't block waiting for it
                    return 'Started as #' . $q['id'] . '; the result will show in the PC actions list.';
                }
                if (is_long_action((string) $in['action'])) {
                    return 'Started as #' . $q['id'] . ' without needing approval (read-only). It may take a while; the answer will appear in the chat when it finishes.';
                }
                $r = wait_for_command($q['id'], 8);
                if ($r['status'] === 'done') {
                    return 'Done. Result: ' . ($r['result'] ?? '');
                }
                if ($r['status'] === 'failed') {
                    return 'Failed: ' . ($r['result'] ?? '');
                }
                return 'Queued as #' . $q['id'] . '; the PC has not responded yet (it may be offline).';
        }
    } catch (InvalidArgumentException $e) {
        return 'Error: ' . $e->getMessage();
    }
    return 'Error: unknown tool ' . $name;
}
