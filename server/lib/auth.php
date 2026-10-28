<?php
declare(strict_types=1);

const DEVICE_COOKIE = 'jv_dev';
const AGENT_TOKEN_DAYS = 30;
const LOGIN_FAILS_PER_ACCOUNT = 8;   // per IP + username, 15 minutes
const LOGIN_FAILS_PER_IP = 40;       // per IP over all usernames, 15 minutes
const DEVICE_TYPES = [
    'laptop', 'home_desktop', 'tv', 'android', 'iphone',
    'work_android', 'work_iphone', 'other',
];

function json_out(array $data, int $code = 200): never
{
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function fail(string $msg, int $code = 400): never
{
    json_out(['error' => $msg], $code);
}

function is_https(): bool
{
    return (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
        || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
}

function body(): array
{
    $raw = file_get_contents('php://input', false, null, 0, 65537);
    if ($raw === false || $raw === '') {
        return [];
    }
    if (strlen($raw) > 65536) {
        fail('Request bahut badi hai', 413);
    }
    $j = json_decode($raw, true);
    return is_array($j) ? $j : [];
}

function new_token(): string
{
    return bin2hex(random_bytes(32));
}

/** Device making this request (cookie for browsers, header for the PC agent). */
function current_device(): ?array
{
    static $done = false, $dev = null;
    if ($done) {
        return $dev;
    }
    $done = true;

    $tok = null;
    $h = $_SERVER['HTTP_X_AGENT_TOKEN'] ?? '';
    if (preg_match('/^[a-f0-9]{64}$/', $h)) {
        $tok = $h;
    } elseif (!empty($_COOKIE[DEVICE_COOKIE]) && preg_match('/^[a-f0-9]{64}$/', $_COOKIE[DEVICE_COOKIE])) {
        $tok = $_COOKIE[DEVICE_COOKIE];
    }
    if ($tok === null) {
        return null;
    }

    $st = db()->prepare(
        'SELECT d.*, u.username FROM devices d JOIN users u ON u.id = d.user_id
         WHERE d.token_hash = ? AND d.blocked = 0'
    );
    $st->execute([hash('sha256', $tok)]);
    $dev = db_fetch($st);
    // Agent tokens made by a device-ID sign-in live 30 days; the app signs in again by itself with its saved password.
    if ($dev && $dev['role'] === 'agent' && $dev['login_id'] !== null && time() - (int) $dev['created_at'] > AGENT_TOKEN_DAYS * 86400) {
        db()->prepare('DELETE FROM devices WHERE id = ?')->execute([$dev['id']]);
        return null;
    }
    if ($dev && time() - (int) $dev['last_seen'] > 10) {
        db()->prepare('UPDATE devices SET last_seen = ? WHERE id = ?')->execute([time(), $dev['id']]);
        $dev['last_seen'] = time();
    }
    return $dev;
}

function require_client(): array
{
    $d = current_device();
    if (!$d || $d['role'] !== 'client') {
        fail('Login karo', 401);
    }
    return $d;
}

function require_agent(): array
{
    $d = current_device();
    if (!$d || $d['role'] !== 'agent') {
        fail('Agent token galat ya block hai', 401);
    }
    return $d;
}

function set_device_cookie(string $token): void
{
    setcookie(DEVICE_COOKIE, $token, [
        'expires'  => time() + 86400 * 365,
        'path'     => '/',
        'secure'   => is_https(),
        'httponly' => true,
        'samesite' => 'Strict',
    ]);
}

function create_device(int $userId, string $name, string $type, string $role, ?int $loginId = null): string
{
    $count = (int) db()->query('SELECT COUNT(*) FROM devices WHERE user_id = ' . (int) $userId)->fetchColumn();
    if ($count >= 40) {
        fail('Bahut saare devices hain, pehle purane delete karo', 400);
    }
    $token = new_token();
    db()->prepare(
        'INSERT INTO devices (user_id, name, type, role, token_hash, created_at, last_seen, user_agent, login_id)
         VALUES (?,?,?,?,?,?,?,?,?)'
    )->execute([
        $userId, $name, $type, $role, hash('sha256', $token), time(), time(),
        substr($_SERVER['HTTP_USER_AGENT'] ?? '', 0, 200), $loginId,
    ]);
    return $token;
}

function clean_device_name(mixed $n): string
{
    $n = trim((string) $n);
    $n = preg_replace('/[\x00-\x1f<>]/u', '', $n) ?? '';
    if ($n === '' || mb_strlen($n) > 40) {
        fail('Device ka naam 1-40 akshar ka chahiye');
    }
    return $n;
}

function pair_code_hash(string $code): string
{
    return hash('sha256', strtoupper(preg_replace('/[^A-Za-z0-9]/', '', $code) ?? ''));
}

/**
 * Brute-force limit. A wrong password counts against "this IP + this username" (8 in 15 minutes) and against the IP overall (40),
 * so a laptop retrying a stale saved password locks out only its own device ID, never the owner's browser on the same home network.
 */
function too_many_failures(string $who = ''): bool
{
    $ip = $_SERVER['REMOTE_ADDR'] ?? '0';
    db()->prepare('DELETE FROM login_attempts WHERE ts < ?')->execute([time() - 900]);
    $count = function (string $key): int {
        $st = db()->prepare('SELECT COUNT(*) FROM login_attempts WHERE ip = ? AND ts > ?');
        $st->execute([$key, time() - 900]);
        return (int) $st->fetchColumn();
    };
    if ($count($ip) >= LOGIN_FAILS_PER_IP) {
        return true;
    }
    return $count($ip . '|' . mb_strtolower($who)) >= LOGIN_FAILS_PER_ACCOUNT;
}

function record_failure(string $who = ''): void
{
    $ip = $_SERVER['REMOTE_ADDR'] ?? '0';
    $ins = db()->prepare('INSERT INTO login_attempts (ip, ts) VALUES (?, ?)');
    $ins->execute([$ip, time()]);
    $key = $ip . '|' . mb_strtolower($who);
    $ins->execute([$key, time()]);
    $st = db()->prepare('SELECT COUNT(*) FROM login_attempts WHERE ip = ? AND ts > ?');
    $st->execute([$key, time() - 900]);
    if ((int) $st->fetchColumn() === LOGIN_FAILS_PER_ACCOUNT) {
        security_alert('Bahut galat login koshishen (' . ($who !== '' ? $who : 'code') . ', IP ' . $ip . '), 15 minute ke liye roka gaya', 0, 'lockout');
    }
}

/**
 * Tell the owner something security-relevant happened: always written to data/security.log, and shown as a notification on the
 * phone when the phone agent is online. At most one phone message per kind every 5 minutes.
 */
function security_alert(string $text, int $userId = 0, string $kind = 'general'): void
{
    @file_put_contents(__DIR__ . '/../data/security.log', gmdate('c') . " [$kind] $text\n", FILE_APPEND);
    try {
        $last = (int) kv_get('alert_last_' . $kind);
        if ($last > time() - 300) {
            return;
        }
        kv_set('alert_last_' . $kind, (string) time());
        $uid = $userId ?: (int) db()->query('SELECT id FROM users ORDER BY id LIMIT 1')->fetchColumn();
        if (!$uid) {
            return;
        }
        $st = db()->prepare('SELECT id FROM devices WHERE user_id = ? AND role = "agent" AND type = "android" AND blocked = 0 AND last_seen > ? ORDER BY last_seen DESC LIMIT 1');
        $st->execute([$uid, time() - 120]);
        if ($phone = db_fetch($st)) {
            db()->prepare('INSERT INTO commands (user_id, device_id, action, args, status, created_at, updated_at) VALUES (?,?,?,?,?,?,?)')
                ->execute([$uid, $phone['id'], 'phone_notify', json_encode(['text' => mb_substr('Jarvis security: ' . $text, 0, 300)], JSON_UNESCAPED_UNICODE), 'pending', time(), time()]);
        }
    } catch (Throwable $e) {
        // an alert must never break the request that caused it
    }
}
