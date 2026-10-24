<?php
declare(strict_types=1);

// Errors go to a private log (data/ is closed to the web) so a 500 can always be explained.
ini_set('log_errors', '1');
ini_set('error_log', __DIR__ . '/data/php_errors.log');

require __DIR__ . '/lib/db.php';
require __DIR__ . '/lib/auth.php';
require __DIR__ . '/lib/tools.php';
require __DIR__ . '/lib/whatsapp.php';
require __DIR__ . '/lib/llm.php';
require __DIR__ . '/lib/skills.php';
require __DIR__ . '/lib/reflex.php';
require __DIR__ . '/lib/knowledge.php';
require __DIR__ . '/lib/tasks.php';
require __DIR__ . '/lib/brain.php';
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

const DOWNLOAD_FILES = ['JarvisAgent.exe' => 'Windows app (laptop/PC)', 'Jarvis.apk' => 'Android app'];

function downloads_dir(): string
{
    return (string) (cfg('downloads_dir') ?: dirname((string) cfg('db_path')) . '/downloads');
}

function status_payload(array $me): array
{
    $pdo = db();
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
    $tasks = $pdo->prepare('SELECT id, title, category, status, assignee FROM tasks WHERE user_id = ? AND status <> "done" ORDER BY CASE status WHEN "doing" THEN 0 WHEN "review" THEN 1 ELSE 2 END, id DESC LIMIT 5');
    $tasks->execute([$uid]);
    $open = $pdo->prepare('SELECT COUNT(*) FROM tasks WHERE user_id = ? AND status <> "done"');
    $open->execute([$uid]);
    $pend = $pdo->prepare(
        'SELECT (SELECT COUNT(*) FROM commands WHERE user_id = :u AND status = "awaiting_confirm")
              + (SELECT COUNT(*) FROM messages_out WHERE user_id = :u AND status = "awaiting_confirm")'
    );
    $pend->execute([':u' => $uid]);
    return [
        'devices'    => $devices,
        'agents'     => $agents,
        'tasks'      => $tasks->fetchAll(),
        'tasks_open' => (int) $open->fetchColumn(),
        'pending'    => (int) $pend->fetchColumn(),
        'ai'         => [
            'model'     => (string) (cfg('model') ?: 'claude-sonnet-5-5'),
            'key_set'   => (string) cfg('anthropic_api_key') !== '',
            'brain'     => brain_mode(),
            'engine'    => brain_engine(),
            'laptop_online' => online_agent($uid) !== null,
            'learning'  => skill_stats($uid),
            'chain'     => brain_status($uid)['chain'],
            'ready'     => brain_status($uid)['ready'],
            'whatsapp'  => (string) cfg('whatsapp_token') !== '' && (string) cfg('whatsapp_phone_id') !== '',
            'contacts'  => count(wa_contacts()),
        ],
    ];}

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
        $user = db_fetch($st);
        $dev = null; // a per-device ID (name + password set in the Devices tab)
        if (!$user) {
            $st = $pdo->prepare('SELECT * FROM device_logins WHERE login_name = ?');
            $st->execute([$login]);
            $dev = db_fetch($st);
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
        $st = $pdo->prepare('SELECT id, user_id, name, type FROM pair_codes WHERE code_hash = ? AND expires_at > ? AND role = "client"');
        $st->execute([pair_code_hash((string) ($in['code'] ?? '')), time()]);
        $pc = db_fetch($st);
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

    // The Windows app trades a one-time code for its own agent token (no JSON editing, no password).
    case 'agent_pair':
        if (too_many_failures()) {
            fail('Bahut galat koshishen. 15 minute baad try karo.', 429);
        }
        // An app can also redeem a code from the "Naya device jodo" card: the owner made it, it is one-time and expires in 15 minutes anyway.
        $st = $pdo->prepare('SELECT id, user_id, name, type FROM pair_codes WHERE code_hash = ? AND expires_at > ?');
        $st->execute([pair_code_hash((string) ($in['code'] ?? '')), time()]);
        $pc = db_fetch($st);
        $used = false;
        if ($pc) {
            $del = $pdo->prepare('DELETE FROM pair_codes WHERE id = ?');
            $del->execute([$pc['id']]);
            $used = $del->rowCount() === 1;
        }
        if (!$used) {
            record_failure();
            fail('Code galat hai ya expire ho gaya', 401);
        }
        json_out(['token' => create_device((int) $pc['user_id'], $pc['name'], $pc['type'] === 'android' ? 'android' : 'laptop', 'agent'), 'name' => $pc['name']]);

    case 'downloads':
        $me = require_client();
        $dir = downloads_dir();
        $files = [];
        foreach (DOWNLOAD_FILES as $f => $label) {
            if (is_file($dir . '/' . $f)) {
                $files[] = ['file' => $f, 'label' => $label, 'size' => filesize($dir . '/' . $f), 'date' => filemtime($dir . '/' . $f)];
            }
        }
        json_out(['files' => $files]);

    case 'download': // apps are served only to a logged-in device, never from a public URL
        $me = require_client();
        $f = (string) ($_GET['file'] ?? '');
        $path = downloads_dir() . '/' . $f;
        if (!isset(DOWNLOAD_FILES[$f]) || !is_file($path)) {
            fail('File nahi mili', 404);
        }
        header('Content-Type: application/octet-stream');
        header('Content-Length: ' . filesize($path));
        header('Content-Disposition: attachment; filename="' . $f . '"');
        header('Cache-Control: no-store');
        readfile($path);
        exit;

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
        $pdo->prepare('INSERT INTO pair_codes (user_id, code_hash, name, type, expires_at, role) VALUES (?,?,?,?,?,?)')
            ->execute([$me['user_id'], pair_code_hash($code), $name, device_type($in['type'] ?? ''), time() + 900, ($in['role'] ?? '') === 'agent' ? 'agent' : 'client']);
        json_out(['code' => substr($code, 0, 4) . '-' . substr($code, 4), 'expires_in' => 900, 'name' => $name]);

    case 'logout':
        $d = require_client();
        $pdo->prepare('DELETE FROM devices WHERE id = ?')->execute([$d['id']]);
        setcookie(DEVICE_COOKIE, '', ['expires' => 1, 'path' => '/']);
        json_out(['ok' => true]);

    // ---------- what Jarvis has learned ----------
    case 'skills':
        $me = require_client();
        $st = $pdo->prepare('SELECT id, template, plan, seen_count, used_count, enabled, created_at, last_used FROM skills WHERE user_id = ? ORDER BY used_count DESC, seen_count DESC, id DESC LIMIT 200');
        $st->execute([$me['user_id']]);
        $rows = array_map(function ($r) {
            $plan = json_decode($r['plan'], true) ?: [];
            $r['does'] = implode(' + ', array_map(function ($a) {
                $in = $a['input'] ?? [];
                return ($a['tool'] ?? '?') . (isset($in['action']) ? ':' . $in['action'] : '');
            }, $plan));
            unset($r['plan']);
            $r['active'] = (int) $r['seen_count'] >= skill_min_seen();
            return $r;
        }, $st->fetchAll());
        json_out(['skills' => $rows, 'stats' => skill_stats((int) $me['user_id']), 'min_seen' => skill_min_seen()]);

    case 'skill_toggle':
        $me = require_client();
        $st = $pdo->prepare('UPDATE skills SET enabled = ? WHERE id = ? AND user_id = ?');
        $st->execute([empty($in['enabled']) ? 0 : 1, (int) ($in['id'] ?? 0), $me['user_id']]);
        json_out(['ok' => $st->rowCount() > 0]);

    case 'skill_delete':
        $me = require_client();
        $st = $pdo->prepare('DELETE FROM skills WHERE id = ? AND user_id = ?');
        $st->execute([(int) ($in['id'] ?? 0), $me['user_id']]);
        json_out(['ok' => $st->rowCount() > 0]);

    case 'brain_export': // training data for a future local model: one JSON object per line
        $me = require_client();
        header('Content-Type: application/x-ndjson; charset=utf-8');
        header('Content-Disposition: attachment; filename="jarvis-training-data.jsonl"');
        header('Cache-Control: no-store');
        $st = $pdo->prepare('SELECT text, provider, plan, created_at FROM brain_log WHERE user_id = ? AND ok = 1 ORDER BY id');
        $st->execute([$me['user_id']]);
        while ($r = $st->fetch()) {
            echo json_encode(['input' => $r['text'], 'output' => json_decode($r['plan'], true), 'teacher' => $r['provider'], 'at' => (int) $r['created_at']], JSON_UNESCAPED_UNICODE), "\n";
        }
        exit;

    // ---------- command center ----------
    case 'status':
        $me = require_client();
        json_out(status_payload($me));

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
        $st = $pdo->prepare(
            'SELECT id, title, category, status, assignee, due, details, done, created_at, done_at, run_state,
                    (SELECT COUNT(*) FROM task_log l WHERE l.task_id = tasks.id) AS notes
             FROM tasks WHERE user_id = ? ORDER BY CASE status WHEN "doing" THEN 0 WHEN "review" THEN 1 WHEN "todo" THEN 2 ELSE 3 END, id DESC LIMIT 300'
        );
        $st->execute([$me['user_id']]);
        json_out(['tasks' => $st->fetchAll(), 'categories' => CATEGORY_LABEL, 'statuses' => STATUS_LABEL]);

    case 'task_add':
        $me = require_client();
        try {
            $id = task_add((int) $me['user_id'], (string) ($in['title'] ?? ''), (string) ($in['category'] ?? 'other'),
                (string) ($in['details'] ?? ''), (string) ($in['assignee'] ?? 'me'), ($in['due'] ?? '') !== '' ? (string) $in['due'] : null);
        } catch (InvalidArgumentException $e) {
            json_out(['result' => 'Error: ' . $e->getMessage()]);
        }
        json_out(['result' => 'Task added with id ' . $id, 'id' => $id]);

    case 'task_status':
        $me = require_client();
        json_out(['ok' => task_set_status((int) $me['user_id'], (int) ($in['id'] ?? 0), (string) ($in['status'] ?? ''))]);

    case 'task_toggle': // checkbox in the Command Center
        $me = require_client();
        json_out(['ok' => task_set_status((int) $me['user_id'], (int) ($in['id'] ?? 0), empty($in['done']) ? 'todo' : 'done')]);

    case 'task_note':
        $me = require_client();
        $text = trim((string) ($in['text'] ?? ''));
        if ($text === '' || !task_get((int) $me['user_id'], (int) ($in['id'] ?? 0))) {
            fail('Note khali hai ya task nahi mila');
        }
        task_log((int) $in['id'], (int) $me['user_id'], 'user', mb_substr($text, 0, 2000));
        json_out(['ok' => true]);

    case 'task_run':
        $me = require_client();
        json_out(['ok' => task_give_to_jarvis((int) $me['user_id'], (int) ($in['id'] ?? 0))]);

    case 'task_detail':
        $me = require_client();
        $task = task_get((int) $me['user_id'], (int) ($_GET['id'] ?? 0));
        if (!$task) {
            fail('Nahi mila', 404);
        }
        $st = $pdo->prepare('SELECT author, text, created_at FROM task_log WHERE task_id = ? ORDER BY id');
        $st->execute([$task['id']]);
        json_out(['task' => $task, 'log' => $st->fetchAll()]);

    case 'task_delete':
        $me = require_client();
        $pdo->prepare('DELETE FROM tasks WHERE id = ? AND user_id = ?')->execute([(int) ($in['id'] ?? 0), $me['user_id']]);
        json_out(['ok' => true]);

    // ---------- reports, routines, scheduler ----------
    case 'reports':
        $me = require_client();
        $st = $pdo->prepare('SELECT id, kind, body, created_at FROM reports WHERE user_id = ? ORDER BY id DESC LIMIT 12');
        $st->execute([$me['user_id']]);
        json_out(['reports' => $st->fetchAll()]);

    case 'report_now':
        $me = require_client();
        $kind = ($in['kind'] ?? '') === 'morning' ? 'morning' : 'evening';
        json_out(['body' => report_build((int) $me['user_id'], $kind)]);

    case 'routines':
        $me = require_client();
        routines_seed((int) $me['user_id']);
        $st = $pdo->prepare('SELECT id, kind, title, query, hhmm, enabled, last_run_date FROM routines WHERE user_id = ? ORDER BY hhmm, id');
        $st->execute([$me['user_id']]);
        json_out(['routines' => $st->fetchAll()]);

    case 'routine_save':
        $me = require_client();
        $kind = (string) ($in['kind'] ?? '');
        $hhmm = (string) ($in['hhmm'] ?? '');
        $title = trim((string) ($in['title'] ?? ''));
        if (!in_array($kind, ['report_morning', 'report_evening', 'news', 'research'], true) || !preg_match('/^([01]\d|2[0-3]):[0-5]\d$/', $hhmm) || $title === '' || mb_strlen($title) > 120) {
            fail('Routine ka type, samay (HH:MM) aur naam sahi daalo');
        }
        $query = mb_substr(trim((string) ($in['query'] ?? '')), 0, 500);
        if (!empty($in['id'])) {
            $pdo->prepare('UPDATE routines SET kind = ?, title = ?, query = ?, hhmm = ?, enabled = ? WHERE id = ? AND user_id = ?')
                ->execute([$kind, $title, $query, $hhmm, empty($in['enabled']) ? 0 : 1, (int) $in['id'], $me['user_id']]);
        } else {
            $pdo->prepare('INSERT INTO routines (user_id, kind, title, query, hhmm, enabled) VALUES (?,?,?,?,?,1)')
                ->execute([$me['user_id'], $kind, $title, $query, $hhmm]);
        }
        json_out(['ok' => true]);

    case 'routine_delete':
        $me = require_client();
        $pdo->prepare('DELETE FROM routines WHERE id = ? AND user_id = ?')->execute([(int) ($in['id'] ?? 0), $me['user_id']]);
        json_out(['ok' => true]);

    case 'tick': // called about once a minute by the open web page and by the PC agent; does the due work
        if (!current_device()) {
            fail('Login karo', 401);
        }
        json_out(scheduler_run());

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
        if ((int) $st->fetchColumn() >= ((int) cfg('chat_rate_per_min') ?: 20)) {
            fail('Thoda ruko, bahut jaldi jaldi messages', 429);
        }
        $uid = (int) $me['user_id'];
        try {
            // Tries the configured brains in order (config.php 'brain' / 'brain_order'): Gemini, OpenAI, Claude API, or the laptop.
            json_out(chat_with_brains($uid, $text));
        } catch (RuntimeException $e) {
            fail($e->getMessage(), 502);
        }

    case 'chat_poll':
        $me = require_client();
        $st = $pdo->prepare('SELECT status, final, created_at FROM commands WHERE id = ? AND user_id = ? AND action = "brain_chat"');
        $st->execute([(int) ($_GET['id'] ?? 0), $me['user_id']]);
        $row = db_fetch($st);
        if (!$row) {
            json_out(['done' => true, 'error' => 'Ye sawal purana ho gaya tha, dobara bhejo']);
        }
        if ($row['final'] !== null) {
            json_out(['done' => true] + (json_decode($row['final'], true) ?: ['error' => 'Jawab padh nahi paya']));
        }
        if (time() - (int) $row['created_at'] > 240) {
            $pdo->prepare('UPDATE commands SET status = "failed", result = "timeout", updated_at = ? WHERE id = ? AND status IN ("pending","running")')
                ->execute([time(), (int) ($_GET['id'] ?? 0)]);
            json_out(['done' => true, 'error' => 'Laptop ne waqt par jawab nahi diya (agent band ya CLI login nahi?)']);
        }
        json_out(['done' => false, 'status' => $row['status']]);

    // ---------- PC commands (browser side) ----------
    case 'commands':
        $me = require_client();
        $st = $pdo->prepare(
            'SELECT c.id, c.action, c.args, c.status, c.result, c.created_at, d.name AS device
             FROM commands c JOIN devices d ON d.id = c.device_id
             WHERE c.user_id = ? AND c.action <> "brain_chat" ORDER BY c.id DESC LIMIT 20'
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
        $out = ['commands' => $rows, 'messages' => $st->fetchAll()];
        if (($_GET['hud'] ?? '') === '1') {
            $out['status'] = status_payload($me);
        }
        json_out($out);

    case 'command_result':
        $me = require_client();
        $st = $pdo->prepare('SELECT action, status, result FROM commands WHERE id = ? AND user_id = ?');
        $st->execute([(int) ($_GET['id'] ?? 0), $me['user_id']]);
        $row = db_fetch($st);
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
        $projects = array_values(array_filter(
            array_slice(explode(',', (string) ($_GET['projects'] ?? '')), 0, 20),
            fn($p) => preg_match('/^[A-Za-z0-9 _.\-]{1,40}$/', $p)
        ));
        $pdo->prepare('UPDATE devices SET cpu = ?, ram = ?, battery = ?, metrics_at = ?, projects = ? WHERE id = ?')
            ->execute([$pct('cpu'), $pct('ram'), $pct('bat'), time(), json_encode($projects), $agent['id']]);
        // Claude Code tasks may run for many minutes; everything else should answer within two.
        $pdo->prepare(
            'UPDATE commands SET status = "failed", result = "timeout", updated_at = ?
             WHERE device_id = ? AND status = "running"
               AND updated_at < CASE WHEN action LIKE "%\_read" ESCAPE "\" OR action LIKE "%\_work" ESCAPE "\" OR action IN ("screen_look","window_read") THEN ? ELSE ? END'
        )->execute([time(), $agent['id'], time() - 2400, time() - 120]);
        $pdo->prepare('UPDATE commands SET status = "expired", updated_at = ? WHERE device_id = ? AND status IN ("pending","awaiting_confirm") AND created_at < ?')
            ->execute([time(), $agent['id'], time() - 600]);
        // Long poll: hold the request up to `wait` seconds (max 20) until a command shows up, so the agent asks
        // 3 times a minute instead of every 4 seconds. Fewer requests also keeps the host's firewall calm.
        @set_time_limit(40);
        $wait = min(max((int) ($_GET['wait'] ?? 0), 0), 20);
        $until = time() + $wait;
        $st = $pdo->prepare('SELECT id, action, args FROM commands WHERE device_id = ? AND status = "pending" ORDER BY id LIMIT 5');
        do {
            $st->execute([$agent['id']]);
            $rows = $st->fetchAll();
            $st->closeCursor();
            if ($rows || time() >= $until) {
                break;
            }
            sleep(1);
        } while (true);
        if ($wait > 0) { // heartbeat at the end of the wait too, so the PC never looks offline between polls
            $pdo->prepare('UPDATE devices SET last_seen = ? WHERE id = ?')->execute([time(), $agent['id']]);
        }
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
        $action = (string) $act->fetchColumn();
        $limit = is_long_action($action) || $action === 'brain_chat' ? 20000 : 2000;
        $st = $pdo->prepare('UPDATE commands SET status = ?, result = ?, updated_at = ? WHERE id = ? AND device_id = ? AND status = "running"');
        $st->execute([
            empty($in['ok']) ? 'failed' : 'done',
            mb_substr((string) ($in['result'] ?? ''), 0, $limit),
            time(), (int) ($in['id'] ?? 0), $agent['id'],
        ]);
        if ($st->rowCount() > 0 && $action === 'brain_chat') {
            finalize_brain((int) $in['id']); // run the planned tools and store the answer for the phone
        }
        if ($st->rowCount() > 0 && $action === 'web_research') {
            task_apply_result((int) $in['id']); // write the findings into the task that asked for them
        }
        json_out(['ok' => $st->rowCount() > 0]);

    default:
        fail('Not found', 404);
}
