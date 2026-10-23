<?php
declare(strict_types=1);

const PC_ACTIONS = ['cpu_status', 'speak', 'open_url', 'open_app', 'lock', 'shutdown', 'restart', 'cancel_shutdown'];

/** Validate and normalise arguments for one PC action; throws on anything odd. */
function clean_pc_args(string $action, array $in): array
{
    if (!in_array($action, PC_ACTIONS, true)) {
        throw new InvalidArgumentException('Unknown action: ' . $action);
    }
    switch ($action) {
        case 'open_url':
            $url = trim((string) ($in['url'] ?? ''));
            $p = parse_url($url);
            if (!$p || !in_array(strtolower($p['scheme'] ?? ''), ['http', 'https'], true) || empty($p['host']) || strlen($url) > 500) {
                throw new InvalidArgumentException('url http(s) wala hona chahiye');
            }
            return ['url' => $url];
        case 'open_app':
            $app = trim((string) ($in['app'] ?? ''));
            if (!preg_match('/^[A-Za-z0-9 _.\-]{1,40}$/', $app)) {
                throw new InvalidArgumentException('app ka naam galat hai');
            }
            return ['app' => $app];
        case 'speak':
            $text = trim((string) ($in['text'] ?? ''));
            if ($text === '' || mb_strlen($text) > 300) {
                throw new InvalidArgumentException('text 1-300 akshar ka chahiye');
            }
            return ['text' => $text];
        default:
            return [];
    }
}

function find_agent(int $userId, string $name): ?array
{
    $st = db()->prepare(
        'SELECT * FROM devices WHERE user_id = ? AND role = "agent" AND blocked = 0 AND lower(name) = lower(?)'
    );
    $st->execute([$userId, $name]);
    return $st->fetch() ?: null;
}

/** Queue a command for a PC agent. Risky actions wait for the owner's approval. */
function queue_command(int $userId, string $deviceName, string $action, array $in): array
{
    $agent = find_agent($userId, $deviceName);
    if (!$agent) {
        throw new InvalidArgumentException('Is naam ka PC agent nahi mila: ' . $deviceName);
    }
    $args = clean_pc_args($action, $in);
    $status = in_array($action, cfg('no_confirm_actions') ?? [], true) ? 'pending' : 'awaiting_confirm';
    db()->prepare(
        'INSERT INTO commands (user_id, device_id, action, args, status, created_at, updated_at) VALUES (?,?,?,?,?,?,?)'
    )->execute([$userId, $agent['id'], $action, json_encode($args, JSON_UNESCAPED_UNICODE), $status, time(), time()]);
    return ['id' => (int) db()->lastInsertId(), 'status' => $status, 'device_id' => (int) $agent['id']];
}

function wait_for_command(int $id, int $seconds): array
{
    $st = db()->prepare('SELECT status, result FROM commands WHERE id = ?');
    for ($i = 0; $i < $seconds * 2; $i++) {
        $st->execute([$id]);
        $row = $st->fetch();
        if ($row && in_array($row['status'], ['done', 'failed'], true)) {
            return $row;
        }
        usleep(500000);
    }
    return ['status' => 'pending', 'result' => null];
}

function claude_tools(): array
{
    return [
        ['name' => 'add_task', 'description' => 'Add a to-do task for the user.',
         'input_schema' => ['type' => 'object', 'properties' => ['title' => ['type' => 'string']], 'required' => ['title']]],
        ['name' => 'list_tasks', 'description' => 'List the user\'s tasks (open ones by default).',
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
        ['name' => 'pc_command',
         'description' => 'Send an action to one of the user\'s PCs (a device with role agent). Risky actions are '
            . 'held until the user approves them in the app; say so instead of claiming they ran.',
         'input_schema' => ['type' => 'object', 'properties' => [
             'device' => ['type' => 'string', 'description' => 'Exact PC agent name from list_devices'],
             'action' => ['type' => 'string', 'enum' => PC_ACTIONS],
             'url'    => ['type' => 'string', 'description' => 'For open_url'],
             'app'    => ['type' => 'string', 'description' => 'For open_app: a name from the agent\'s allowlist'],
             'text'   => ['type' => 'string', 'description' => 'For speak'],
         ], 'required' => ['device', 'action']]],
    ];
}

function run_tool(string $name, array $in, int $userId): string
{
    $pdo = db();
    try {
        switch ($name) {
            case 'add_task':
                $t = trim((string) ($in['title'] ?? ''));
                if ($t === '' || mb_strlen($t) > 200) {
                    return 'Error: title 1-200 akshar ka chahiye';
                }
                $pdo->prepare('INSERT INTO tasks (user_id, title, created_at) VALUES (?,?,?)')->execute([$userId, $t, time()]);
                return 'Task added with id ' . $pdo->lastInsertId();

            case 'list_tasks':
                $sql = 'SELECT id, title, done FROM tasks WHERE user_id = ?' . (empty($in['include_done']) ? ' AND done = 0' : '') . ' ORDER BY id DESC LIMIT 50';
                $st = $pdo->prepare($sql);
                $st->execute([$userId]);
                $rows = $st->fetchAll();
                if (!$rows) {
                    return 'No tasks.';
                }
                return implode("\n", array_map(fn($r) => '#' . $r['id'] . ($r['done'] ? ' [done] ' : ' [open] ') . $r['title'], $rows));

            case 'complete_task':
                $st = $pdo->prepare('UPDATE tasks SET done = 1 WHERE id = ? AND user_id = ?');
                $st->execute([(int) ($in['id'] ?? 0), $userId]);
                return $st->rowCount() ? 'Done.' : 'Error: us id ka task nahi mila';

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

            case 'list_devices':
                $st = $pdo->prepare('SELECT name, type, role, last_seen, blocked FROM devices WHERE user_id = ? ORDER BY id');
                $st->execute([$userId]);
                return implode("\n", array_map(
                    fn($d) => $d['name'] . ' (' . $d['type'] . ', ' . $d['role'] . ', '
                        . ($d['blocked'] ? 'blocked' : (time() - (int) $d['last_seen'] < 30 ? 'online' : 'offline')) . ')',
                    $st->fetchAll()
                ));

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
