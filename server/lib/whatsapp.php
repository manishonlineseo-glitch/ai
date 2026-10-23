<?php
declare(strict_types=1);

/** name (lowercase) => digits-only number, from config.php. */
function wa_contacts(): array
{
    $out = [];
    foreach ((array) (cfg('whatsapp_contacts') ?? []) as $name => $num) {
        $num = preg_replace('/\D/', '', (string) $num) ?? '';
        if ($num !== '' && strlen($num) >= 8 && strlen($num) <= 15) {
            $out[strtolower(trim((string) $name))] = $num;
        }
    }
    return $out;
}

/** Queue a WhatsApp message. It is only sent after the owner taps Approve. */
function queue_whatsapp(int $userId, string $contact, string $text): int
{
    $contacts = wa_contacts();
    $key = strtolower(trim($contact));
    if (!isset($contacts[$key])) {
        throw new InvalidArgumentException(
            'Ye contact allowed list me nahi hai. Available: ' . (implode(', ', array_keys($contacts)) ?: 'koi nahi')
        );
    }
    $text = trim($text);
    if ($text === '' || mb_strlen($text) > 1000) {
        throw new InvalidArgumentException('Message 1-1000 akshar ka chahiye');
    }
    db()->prepare(
        'INSERT INTO messages_out (user_id, channel, contact, recipient, body, status, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?)'
    )->execute([$userId, 'whatsapp', $key, $contacts[$key], $text, 'awaiting_confirm', time(), time()]);
    return (int) db()->lastInsertId();
}

/** Calls Meta's Cloud API. Returns [ok, human readable result]. */
function whatsapp_send(string $to, string $text): array
{
    $token = (string) cfg('whatsapp_token');
    $phoneId = (string) cfg('whatsapp_phone_id');
    if ($token === '' || !preg_match('/^\d+$/', $phoneId)) {
        return [false, 'WhatsApp config.php me set nahi hai (whatsapp_token, whatsapp_phone_id)'];
    }
    $base = rtrim((string) (cfg('whatsapp_api_base') ?: 'https://graph.facebook.com/v21.0'), '/');
    $ch = curl_init($base . '/' . $phoneId . '/messages');
    curl_setopt_array($ch, [
        CURLOPT_POST           => true,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 20,
        CURLOPT_HTTPHEADER     => ['Authorization: Bearer ' . $token, 'Content-Type: application/json'],
        CURLOPT_POSTFIELDS     => json_encode([
            'messaging_product' => 'whatsapp',
            'to'                => $to,
            'type'              => 'text',
            'text'              => ['body' => $text],
        ], JSON_UNESCAPED_UNICODE),
    ]);
    $raw = curl_exec($ch);
    $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $err = curl_error($ch);
    curl_close($ch);

    if ($raw === false) {
        return [false, 'WhatsApp se connect nahi hua: ' . $err];
    }
    $j = json_decode($raw, true);
    if ($code >= 400 || !is_array($j)) {
        $msg = $j['error']['message'] ?? substr($raw, 0, 200);
        if ((int) ($j['error']['code'] ?? 0) === 131047) {
            $msg .= ' (24 ghante se us contact ne reply nahi kiya; pehle approved template message bhejna padega)';
        }
        return [false, 'WhatsApp error ' . $code . ': ' . $msg];
    }
    return [true, 'bhej diya (id ' . ($j['messages'][0]['id'] ?? '?') . ')'];
}

/** Owner decision from the app. Sends at most once (atomic status change). */
function decide_message(int $userId, int $id, bool $approve): array
{
    $pdo = db();
    $st = $pdo->prepare(
        'UPDATE messages_out SET status = ?, updated_at = ? WHERE id = ? AND user_id = ? AND status = "awaiting_confirm"'
    );
    $st->execute([$approve ? 'sending' : 'denied', time(), $id, $userId]);
    if ($st->rowCount() === 0) {
        return [false, 'Ye message ab pending nahi hai'];
    }
    if (!$approve) {
        return [true, 'denied'];
    }
    $row = $pdo->prepare('SELECT recipient, body FROM messages_out WHERE id = ?');
    $row->execute([$id]);
    $m = db_fetch($row);
    [$ok, $res] = whatsapp_send($m['recipient'], $m['body']);
    $pdo->prepare('UPDATE messages_out SET status = ?, result = ?, updated_at = ? WHERE id = ?')
        ->execute([$ok ? 'sent' : 'failed', $res, time(), $id]);
    return [$ok, $res];
}
