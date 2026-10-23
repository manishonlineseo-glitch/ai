<?php
declare(strict_types=1);

const DEVICE_COOKIE = 'jv_dev';
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
    $dev = $st->fetch() ?: null;
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

function create_device(int $userId, string $name, string $type, string $role): string
{
    $count = (int) db()->query('SELECT COUNT(*) FROM devices WHERE user_id = ' . (int) $userId)->fetchColumn();
    if ($count >= 40) {
        fail('Bahut saare devices hain, pehle purane delete karo', 400);
    }
    $token = new_token();
    db()->prepare(
        'INSERT INTO devices (user_id, name, type, role, token_hash, created_at, last_seen, user_agent)
         VALUES (?,?,?,?,?,?,?,?)'
    )->execute([
        $userId, $name, $type, $role, hash('sha256', $token), time(), time(),
        substr($_SERVER['HTTP_USER_AGENT'] ?? '', 0, 200),
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

function too_many_failures(): bool
{
    $ip = $_SERVER['REMOTE_ADDR'] ?? '0';
    db()->prepare('DELETE FROM login_attempts WHERE ts < ?')->execute([time() - 900]);
    $st = db()->prepare('SELECT COUNT(*) FROM login_attempts WHERE ip = ? AND ts > ?');
    $st->execute([$ip, time() - 900]);
    return (int) $st->fetchColumn() >= 8;
}

function record_failure(): void
{
    db()->prepare('INSERT INTO login_attempts (ip, ts) VALUES (?, ?)')
        ->execute([$_SERVER['REMOTE_ADDR'] ?? '0', time()]);
}
