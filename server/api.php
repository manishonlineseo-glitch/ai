<?php
declare(strict_types=1);

require __DIR__ . '/lib/db.php';
require __DIR__ . '/lib/auth.php';
require __DIR__ . '/lib/tools.php';
require __DIR__ . '/lib/whatsapp.php';
require __DIR__ . '/lib/claude.php';

if (cfg('require_https') && !is_https()) {
    fail('HTTPS zaroori hai', 400);
}

$method = $_SERVER['REQUEST_METHOD'];
$route = (string) ($_GET['r'] ?? '');

// Browsers can't add this header cross-site, so it blocks CSRF on top of SameSite=Strict.
if ($method === 'POST' && ($_SERVER['HTTP_X_REQUESTED_WITH'] ?? '') !== 'jarvis') {
    fail('Bad request', 400);
}

$pdo = db();
$in = $method === 'POST' ? body() : [];

function user_count(): int
{
    return (int) db()->query('SELECT COUNT(*) FROM users')->fetchColumn();
}

function device_type(mixed $t): string
{
    $t = (string) $t;
    return in_array($t, DEVICE_TYPES, true) ? $t : 'other';
}

switch ($route) {
    // ---------- session ----------
    case 'state':
        $d = current_device();
        json_out([
            'setup_needed' => user_count() === 0,
            'setup_key_required' => (string) cfg('setup_key') !== '',
            'user'         => $d && $d['role'] === 'client' ? $d['username'] : null,
            'device'       => $d && $d['role'] === 'client' ? ['id' => (int) $d['id'], 'name' => $d['name'], 'type' => $d['type']] : null,
            'device_types' => DEVICE_TYPES,
        ]);

    case 'setup':
        if (user_count() > 0) {
            fail('Setup ho chuka hai', 403);
        }
        // Until the owner exists the URL is public, so a setup key (config.php) stops strangers claiming the account.
        $key = (string) cfg('setup_key');
        if ($key !== '') {
            if (too_many_failures()) {
                fail('Bahut galat koshishen. 15 minute baad try karo.', 429);
            }
            if (!hash_equals($key, (string) ($in['setup_key'] ?? ''))) {
                record_failure();
                fail('Setup key galat hai', 403);
            }
        }
        $u = trim((string) ($in['username'] ?? ''));
        $p = (string) ($in['password'] ?? '');
        if (!preg_match('/^[A-Za-z0-9_.-]{3,32}$/', $u)) {
            fail('Username 3-32 akshar (a-z, 0-9, _ . -)');
        }
        if (strlen($p) < 12) {
            fail('Password kam se kam 12 akshar ka rakho');
        }
        $pdo->prepare('INSERT INTO users (username, pass_hash, created_at) VALUES (?,?,?)')
            ->execute([$u, password_hash($p, PASSWORD_DEFAULT), time()]);
        $uid = (int) $pdo->lastInsertId();
        set_device_cookie(create_device($uid, clean_device_name($in['device_name'] ?? 'Laptop'), device_type($in['device_type'] ?? ''), 'client'));
        json_out(['ok' => true]);

    case 'login':
        if (too_many_failures()) {
            fail('Bahut galat koshishen. 15 minute baad try karo.', 429);
        }
        $login = trim((string) ($in['username'] ?? ''));
        $st = $pdo->prepare('SELECT * FROM users WHERE username = ?');
        $st->execute([$login]);
        $user = $st->fetch();
        $dev = null; // a per-device ID (name + password set in the Devices tab)
        if (!$user) {
            $st = $pdo->prepare('SELECT * FROM device_logins WHERE login_name = ?');
            $st->execute([$login]);
            $dev = $st->fetch() ?: null;
        }
        // Always run one hash check so timing doesn't reveal valid usernames.
        $hash = $user['pass_hash'] ?? $dev['pass_hash'] ?? password_hash('dummy-password', PASSWORD_DEFAULT);
        $ok = password_verify((string) ($in['password'] ?? ''), $hash) && ($user || $dev);
        if (!$ok) {
            record_failure();
            fail('Username ya password galat hai', 401);
        }
        if ($dev) {
            // One device ID = one device: a new login replaces its older session.
            $pdo->prepare('DELETE FROM devices WHERE login_id = ?')->execute([$dev['id']]);
            set_device_cookie(create_device((int) $dev['user_id'], $dev['name'], device_type($dev['type']), 'client', (int) $dev['id']));
            json_out(['ok' => true]);
        }
        set_device_cookie(create_device((int) $user['id'], clean_device_name($in['device_name'] ?? ''), device_type($in['device_type'] ?? ''), 'client'));
        json_out(['ok' => true]);

    // One-time code so a new device can join without ever typing the owner's password.
    case 'pair_login':
        if (too_many_failures()) {
            fail('Bahut galat koshishen. 15 minute baad try karo.', 429);
        }
        $st = $pdo->prepare('SELECT id, user_id, name, type FROM pair_codes WHERE code_hash = ? AND expires_at > ?');
        $st->execute([pair_code_hash((string) ($in['code'] ?? '')), time()]);
        $pc = $st->fetch();
        $used = false;
        if ($pc) {
            $del = $pdo->prepare('DELETE FROM pair_codes WHERE id = ?');
            $del->execute([$pc['id']]);
            $used = $del->rowCount() === 1; // two requests can't both consume one code
        }
        if (!$used) {
            record_failure();
            fail('Code galat hai ya expire ho gaya', 401);
        }
        set_device_cookie(create_device((int) $pc['user_id'], $pc['name'], device_type($pc['type']), 'client'));
        json_out(['ok' => true]);

    case 'pair_create':
        $me = require_client();
        $name = clean_device_name($in['name'] ?? '');
        $pdo->prepare('DELETE FROM pair_codes WHERE expires_at < ?')->execute([time()]);
        $active = $pdo->prepare('SELECT COUNT(*) FROM pair_codes WHERE user_id = ?');
        $active->execute([$me['user_id']]);
        if ((int) $active->fetchColumn() >= 10) {
            fail('Pehle se 10 unused codes hain, thoda ruko ya unhe use karo');
        }
        $alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no 0/O/1/I/L, easy to read aloud
        $code = '';
        for ($i = 0; $i < 8; $i++) {
            $code .= $alphabet[random_int(0, strlen($alphabet) - 1)];
        }
        $pdo->prepare('INSERT INTO pair_codes (user_id, code_hash, name, type, expires_at) VALUES (?,?,?,?,?)')
            ->execute([$me['user_id'], pair_code_hash($code), $name, device_type($in['type'] ?? ''), time() + 900]);
        json_out(['code' => substr($code, 0, 4) . '-' . substr($code, 4), 'expires_in' => 900, 'name' => $name]);

    case 'logout':
        $d = require_client();
        $pdo->prepare('DELETE FROM devices WHERE id = ?')->execute([$d['id']]);
        setcookie(DEVICE_COOKIE, '', ['expires' => 1, 'path' => '/']);
        json_out(['ok' => true]);

    // ---------- command center ----------
    case 'status':
        $me = require_client();
        $uid = (int) $me['user_id'];
        $st = $pdo->prepare(
            'SELECT id, name, type, role, last_seen, cpu, ram, battery, metrics_at FROM devices
             WHERE user_id = ? AND blocked = 0 ORDER BY role DESC, id'
        );
        $st->execute([$uid]);
        $devices = [];
        $agents = [];
        foreach ($st->fetchAll() as $d) {
            $online = time() - (int) $d['last_seen'] < 30;
            $devices[] = ['name' => $d['name'], 'type' => $d['type'], 'role' => $d['role'], 'online' => $online, 'current' => (int) $d['id'] === (int) $me['id']];
            if ($d['role'] === 'agent') {
                $fresh = $online && time() - (int) $d['metrics_at'] < 60;
                $agents[] = [
                    'name' => $d['name'], 'online' => $online,
                    'cpu' => $fresh && $d['cpu'] !== null ? (float) $d['cpu'] : null,
                    'ram' => $fresh && $d['ram'] !== null ? (float) $d['ram'] : null,
                    'battery' => $fresh && $d['battery'] !== null ? (float) $d['battery'] : null,
                ];
            }
        }
        $tasks = $pdo->prepare('SELECT id, title FROM tasks WHERE user_id = ? AND done = 0 ORDER BY id DESC LIMIT 5');
        $tasks->execute([$uid]);
        $open = $pdo->prepare('SELECT COUNT(*) FROM tasks WHERE user_id = ? AND done = 0');
        $open->execute([$uid]);
        $pend = $pdo->prepare(
            'SELECT (SELECT COUNT(*) FROM commands WHERE user_id = :u AND status = "awaiting_confirm")
                  + (SELECT COUNT(*) FROM messages_out WHERE user_id = :u AND status = "awaiting_confirm")'
        );
        $pend->execute([':u' => $uid]);
        json_out([
            'devices'    => $devices,
            'agents'     => $agents,
            'tasks'      => $tasks->fetchAll(),
            'tasks_open' => (int) $open->fetchColumn(),
            'pending'    => (int) $pend->fetchColumn(),
            'ai'         => [
                'model'     => (string) (cfg('model') ?: 'claude-sonnet-5-5'),
                'key_set'   => (string) cfg('anthropic_api_key') !== '',
                'whatsapp'  => (string) cfg('whatsapp_token') !== '' && (string) cfg('whatsapp_phone_id') !== '',
                'contacts'  => count(wa_contacts()),
            ],
        ]);

    // ---------- devices ----------
    case 'devices':
        $me = require_client();
        $st = $pdo->prepare('SELECT id, name, type, role, last_seen, blocked, created_at FROM devices WHERE user_id = ? ORDER BY id');
        $st->execute([$me['user_id']]);
        $rows = array_map(function ($r) use ($me) {
            $r['id'] = (int) $r['id'];
            $r['blocked'] = (bool) $r['blocked'];
            $r['online'] = !$r['blocked'] && time() - (int) $r['last_seen'] < 30;
            $r['current'] = $r['id'] === (int) $me['id'];
            return $r;
        }, $st->fetchAll());
        json_out(['devices' => $rows]);

    case 'device_block':
    case 'device_delete':
    case 'device_rename':
        $me = require_client();
        $id = (int) ($in['id'] ?? 0);
        if ($id === (int) $me['id'] && $route !== 'device_rename') {
            fail('Apne is device par ye nahi kar sakte (logout use karo)');
        }
        if ($route === 'device_block') {
            $st = $pdo->prepare('UPDATE devices SET blocked = ? WHERE id = ? AND user_id = ?');
            $st->execute([empty($in['blocked']) ? 0 : 1, $id, $me['user_id']]);
        } elseif ($route === 'device_rename') {
            $st = $pdo->prepare('UPDATE devices SET name = ? WHERE id = ? AND user_id = ?');
            $st->execute([clean_device_name($in['name'] ?? ''), $id, $me['user_id']]);
        } else {
            $st = $pdo->prepare('DELETE FROM devices WHERE id = ? AND user_id = ?');
            $st->execute([$id, $me['user_id']]);
        }
        json_out(['ok' => $st->rowCount() > 0]);

    // ---------- per-device IDs: login name + password for each phone/TV/PC browser ----------
    case 'device_logins':
        $me = require_client();
        $st = $pdo->prepare(
            'SELECT l.id, l.login_name, l.name, l.type, l.created_at,
                    (SELECT MAX(last_seen) FROM devices d WHERE d.login_id = l.id) AS last_seen
             FROM device_logins l WHERE l.user_id = ? ORDER BY l.id'
        );
        $st->execute([$me['user_id']]);
        json_out(['logins' => $st->fetchAll()]);

    case 'device_login_save':
        $me = require_client();
        $id = (int) ($in['id'] ?? 0);
        $loginName = trim((string) ($in['login_name'] ?? ''));
        $pw = (string) ($in['password'] ?? '');
        $name = clean_device_name($in['name'] ?? '');
        if (!preg_match('/^[A-Za-z0-9_.-]{3,32}$/', $loginName)) {
            fail('Username 3-32 akshar (a-z, 0-9, _ . -)');
        }
        $own = $pdo->prepare('SELECT COUNT(*) FROM users WHERE lower(username) = lower(?)');
        $own->execute([$loginName]);
        $dup = $pdo->prepare('SELECT COUNT(*) FROM device_logins WHERE login_name = ? AND id <> ?');
        $dup->execute([$loginName, $id]);
        if ((int) $own->fetchColumn() > 0 || (int) $dup->fetchColumn() > 0) {
            fail('Ye username pehle se use me hai');
        }
        if ($pw !== '' || $id === 0) {
            if (strlen($pw) < 10 || !preg_match('/[A-Za-z]/', $pw) || !preg_match('/\d/', $pw)) {
                fail('Password kam se kam 10 akshar ka, usme letter aur number dono');
            }
        }
        if ($id === 0) {
            $cnt = $pdo->prepare('SELECT COUNT(*) FROM device_logins WHERE user_id = ?');
            $cnt->execute([$me['user_id']]);
            if ((int) $cnt->fetchColumn() >= 20) {
                fail('Bahut saare device IDs hain');
            }
            $pdo->prepare('INSERT INTO device_logins (user_id, login_name, pass_hash, name, type, created_at) VALUES (?,?,?,?,?,?)')
                ->execute([$me['user_id'], $loginName, password_hash($pw, PASSWORD_DEFAULT), $name, device_type($in['type'] ?? ''), time()]);
            json_out(['ok' => true, 'id' => (int) $pdo->lastInsertId()]);
        }
        $st = $pdo->prepare('UPDATE device_logins SET login_name = ?, name = ?, type = ? WHERE id = ? AND user_id = ?');
        $st->execute([$loginName, $name, device_type($in['type'] ?? ''), $id, $me['user_id']]);
        if ($st->rowCount() === 0) {
            fail('Device ID nahi mila', 404);
        }
        if ($pw !== '') {
            $pdo->prepare('UPDATE device_logins SET pass_hash = ? WHERE id = ?')->execute([password_hash($pw, PASSWORD_DEFAULT), $id]);
            // Password changed: that device must log in again.
            $pdo->prepare('DELETE FROM devices WHERE login_id = ? AND id <> ?')->execute([$id, $me['id']]);
        }
        $pdo->prepare('UPDATE devices SET name = ?, type = ? WHERE login_id = ?')->execute([$name, device_type($in['type'] ?? ''), $id]);
        json_out(['ok' => true, 'id' => $id]);

    case 'device_login_delete':
        $me = require_client();
        $id = (int) ($in['id'] ?? 0);
        $pdo->prepare('DELETE FROM devices WHERE login_id = ? AND id <> ?')->execute([$id, $me['id']]);
        $st = $pdo->prepare('DELETE FROM device_logins WHERE id = ? AND user_id = ?');
        $st->execute([$id, $me['user_id']]);
        json_out(['ok' => $st->rowCount() > 0]);

    case 'agent_create':
        $me = require_client();
        $name = clean_device_name($in['name'] ?? '');
        $token = create_device((int) $me['user_id'], $name, device_type($in['type'] ?? 'laptop'), 'agent');
        json_out(['token' => $token, 'note' => 'Ye token sirf abhi dikhega. Agent config me daal do.']);

    // ---------- tasks & notes ----------
    case 'tasks':
        $me = require_client();
        $st = $pdo->prepare('SELECT id, title, done FROM tasks WHERE user_id = ? ORDER BY done, id DESC LIMIT 200');
        $st->execute([$me['user_id']]);
        json_out(['tasks' => $st->fetchAll()]);

    case 'task_add':
        $me = require_client();
        json_out(['result' => run_tool('add_task', ['title' => $in['title'] ?? ''], (int) $me['user_id'])]);

    case 'task_toggle':
        $me = require_client();
        $pdo->prepare('UPDATE tasks SET done = ? WHERE id = ? AND user_id = ?')
            ->execute([empty($in['done']) ? 0 : 1, (int) ($in['id'] ?? 0), $me['user_id']]);
        json_out(['ok' => true]);

    case 'task_delete':
        $me = require_client();
        $pdo->prepare('DELETE FROM tasks WHERE id = ? AND user_id = ?')->execute([(int) ($in['id'] ?? 0), $me['user_id']]);
        json_out(['ok' => true]);

    case 'notes':
        $me = require_client();
        $st = $pdo->prepare('SELECT id, body, created_at FROM notes WHERE user_id = ? ORDER BY id DESC LIMIT 200');
        $st->execute([$me['user_id']]);
        json_out(['notes' => $st->fetchAll()]);

    case 'note_add':
        $me = require_client();
        json_out(['result' => run_tool('add_note', ['body' => $in['body'] ?? ''], (int) $me['user_id'])]);

    case 'note_delete':
        $me = require_client();
        $pdo->prepare('DELETE FROM notes WHERE id = ? AND user_id = ?')->execute([(int) ($in['id'] ?? 0), $me['user_id']]);
        json_out(['ok' => true]);

    // ---------- chat ----------
    case 'chat_history':
        $me = require_client();
        $st = $pdo->prepare('SELECT role, content FROM chat WHERE user_id = ? ORDER BY id DESC LIMIT 40');
        $st->execute([$me['user_id']]);
        json_out(['messages' => array_reverse($st->fetchAll())]);

    case 'chat_clear':
        $me = require_client();
        $pdo->prepare('DELETE FROM chat WHERE user_id = ?')->execute([$me['user_id']]);
        json_out(['ok' => true]);

    case 'chat':
        $me = require_client();
        $text = trim((string) ($in['text'] ?? ''));
        if ($text === '' || mb_strlen($text) > 2000) {
            fail('Message 1-2000 akshar ka chahiye');
        }
        $st = $pdo->prepare('SELECT COUNT(*) FROM chat WHERE user_id = ? AND role = "user" AND created_at > ?');
        $st->execute([$me['user_id'], time() - 60]);
        if ((int) $st->fetchColumn() >= (int) cfg('chat_rate_per_min')) {
            fail('Thoda ruko, bahut jaldi jaldi messages', 429);
        }
        try {
            $reply = run_chat((int) $me['user_id'], $text);
            json_out(['reply' => $reply, 'actions' => ui_actions()]);
        } catch (RuntimeException $e) {
            fail($e->getMessage(), 502);
        }

    // ---------- PC commands (browser side) ----------
    case 'commands':
        $me = require_client();
        $st = $pdo->prepare(
            'SELECT c.id, c.action, c.args, c.status, c.result, c.created_at, d.name AS device
             FROM commands c JOIN devices d ON d.id = c.device_id
             WHERE c.user_id = ? ORDER BY c.id DESC LIMIT 20'
        );
        $st->execute([$me['user_id']]);
        $rows = array_map(function ($r) {
            $r['args'] = json_decode($r['args'], true) ?: new stdClass();
            // Long Claude Code answers are fetched on demand (command_result), not on every poll.
            $r['result_len'] = mb_strlen((string) $r['result']);
            $r['result'] = $r['result'] === null ? null : mb_substr($r['result'], 0, 1500);
            return $r;
        }, $st->fetchAll());
        $st = $pdo->prepare(
            'SELECT id, channel, contact, body, status, result, created_at FROM messages_out
             WHERE user_id = ? ORDER BY id DESC LIMIT 20'
        );
        $st->execute([$me['user_id']]);
        json_out(['commands' => $rows, 'messages' => $st->fetchAll()]);

    case 'command_result':
        $me = require_client();
        $st = $pdo->prepare('SELECT action, status, result FROM commands WHERE id = ? AND user_id = ?');
        $st->execute([(int) ($_GET['id'] ?? 0), $me['user_id']]);
        $row = $st->fetch();
        if (!$row) {
            fail('Nahi mila', 404);
        }
        json_out($row);

    case 'message_decide':
        $me = require_client();
        [$ok, $msg] = decide_message((int) $me['user_id'], (int) ($in['id'] ?? 0), !empty($in['approve']));
        json_out(['ok' => $ok, 'result' => $msg]);

    case 'command_decide':
        $me = require_client();
        $new = empty($in['approve']) ? 'denied' : 'pending';
        $st = $pdo->prepare('UPDATE commands SET status = ?, updated_at = ? WHERE id = ? AND user_id = ? AND status = "awaiting_confirm"');
        $st->execute([$new, time(), (int) ($in['id'] ?? 0), $me['user_id']]);
        json_out(['ok' => $st->rowCount() > 0]);

    // ---------- PC agent side ----------
    case 'agent_poll':
        $agent = require_agent();
        // Optional live numbers the agent reports with each poll (0-100).
        $pct = static fn(string $k): ?float => isset($_GET[$k]) && is_numeric($_GET[$k]) ? max(0.0, min(100.0, (float) $_GET[$k])) : null;
        $pdo->prepare('UPDATE devices SET cpu = ?, ram = ?, battery = ?, metrics_at = ? WHERE id = ?')
            ->execute([$pct('cpu'), $pct('ram'), $pct('bat'), time(), $agent['id']]);
        // Claude Code tasks may run for many minutes; everything else should answer within two.
        $pdo->prepare(
            'UPDATE commands SET status = "failed", result = "timeout", updated_at = ?
             WHERE device_id = ? AND status = "running"
               AND updated_at < CASE WHEN action LIKE "claude\_%" ESCAPE "\" THEN ? ELSE ? END'
        )->execute([time(), $agent['id'], time() - 2400, time() - 120]);
        $pdo->prepare('UPDATE commands SET status = "expired", updated_at = ? WHERE device_id = ? AND status IN ("pending","awaiting_confirm") AND created_at < ?')
            ->execute([time(), $agent['id'], time() - 600]);
        $st = $pdo->prepare('SELECT id, action, args FROM commands WHERE device_id = ? AND status = "pending" ORDER BY id LIMIT 5');
        $st->execute([$agent['id']]);
        $rows = $st->fetchAll();
        $mark = $pdo->prepare('UPDATE commands SET status = "running", updated_at = ? WHERE id = ?');
        foreach ($rows as &$r) {
            $mark->execute([time(), $r['id']]);
            $r['id'] = (int) $r['id'];
            $r['args'] = json_decode($r['args'], true) ?: new stdClass();
        }
        json_out(['commands' => $rows]);

    case 'agent_result':
        $agent = require_agent();
        $act = $pdo->prepare('SELECT action FROM commands WHERE id = ? AND device_id = ?');
        $act->execute([(int) ($in['id'] ?? 0), $agent['id']]);
        $limit = str_starts_with((string) $act->fetchColumn(), 'claude_') ? 20000 : 2000;
        $st = $pdo->prepare('UPDATE commands SET status = ?, result = ?, updated_at = ? WHERE id = ? AND device_id = ? AND status = "running"');
        $st->execute([
            empty($in['ok']) ? 'failed' : 'done',
            mb_substr((string) ($in['result'] ?? ''), 0, $limit),
            time(), (int) ($in['id'] ?? 0), $agent['id'],
        ]);
        json_out(['ok' => $st->rowCount() > 0]);

    default:
        fail('Not found', 404);
}
