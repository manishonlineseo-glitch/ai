<?php
declare(strict_types=1);

/**
 * Jarvis' long-term memory as a "smart employee": what each project is doing and what comes next, how the owner likes to work,
 * which Chrome profile belongs to which job, and which kinds of actions the owner has allowed Jarvis to do without asking.
 */

/** Never become automatic, whatever the owner says in chat: these need a tap on the phone (power off, deleting files, phone calls). */
const AUTHORITY_HARD_STOP = ['shutdown', 'restart', 'phone_trash_files', 'phone_call', 'vault_fill'];

function memory_add(int $uid, string $scope, string $kind, string $text): int
{
    $scope = mb_substr(trim($scope) !== '' ? trim($scope) : '*', 0, 60);
    $kind = in_array($kind, ['status', 'next', 'done', 'decision', 'style', 'fact'], true) ? $kind : 'status';
    $text = mb_substr(trim($text), 0, 600);
    if ($text === '') {
        throw new InvalidArgumentException('text khali hai');
    }
    return (int) db_retry(function () use ($uid, $scope, $kind, $text) {
        db()->prepare('INSERT INTO memory (user_id, scope, kind, text, created_at) VALUES (?,?,?,?,?)')->execute([$uid, $scope, $kind, $text, time()]);
        return db()->lastInsertId();
    });
}

/** Where every project stands: the latest status and the open next steps, newest first. */
function memory_overview(int $uid, ?string $project = null): string
{
    $pdo = db();
    $sql = 'SELECT scope, kind, text, created_at FROM memory WHERE user_id = ? AND scope <> "*" AND kind <> "style"' . ($project ? ' AND lower(scope) = lower(?)' : '') . ' ORDER BY id DESC LIMIT 60';
    $st = $pdo->prepare($sql);
    $st->execute($project ? [$uid, $project] : [$uid]);
    $by = [];
    foreach ($st->fetchAll() as $r) {
        $by[$r['scope']][] = $r;
    }
    if (!$by) {
        return $project ? "Project '$project' ke baare me abhi koi yaaddasht nahi." : 'Abhi kisi project ki yaaddasht nahi.';
    }
    $out = '';
    foreach ($by as $scope => $rows) {
        $out .= "PROJECT $scope:\n";
        foreach (array_slice($rows, 0, $project ? 15 : 4) as $r) {
            $out .= '  - [' . $r['kind'] . ', ' . date('d M', (int) $r['created_at']) . '] ' . $r['text'] . "\n";
        }
    }
    return trim($out);
}

function memory_styles(int $uid, int $limit = 8): array
{
    $st = db()->prepare('SELECT text FROM memory WHERE user_id = ? AND kind = "style" ORDER BY id DESC LIMIT ?');
    $st->execute([$uid, $limit]);
    return array_column($st->fetchAll(), 'text');
}

// ---------------------------------------------------------------- Chrome profiles

/** Save the profile list the laptop reported (keeps the purpose/sites the owner already told us). */
function chrome_profiles_sync(int $uid, string $json): int
{
    $list = json_decode($json, true);
    if (!is_array($list)) {
        return 0;
    }
    $n = 0;
    db_retry(function () use ($uid, $list, &$n) {
        $ins = db()->prepare(
            'INSERT INTO chrome_profiles (user_id, dir, name, email, gaia, updated_at) VALUES (?,?,?,?,?,?)
             ON CONFLICT(user_id, dir) DO UPDATE SET name = excluded.name, email = excluded.email, gaia = excluded.gaia, updated_at = excluded.updated_at'
        );
        foreach ($list as $p) {
            if (!is_array($p) || !preg_match('/^(Default|Profile \d{1,3})$/', (string) ($p['dir'] ?? ''))) {
                continue;
            }
            $ins->execute([$uid, $p['dir'], mb_substr((string) ($p['name'] ?? ''), 0, 80), mb_substr((string) ($p['email'] ?? ''), 0, 120), mb_substr((string) ($p['gaia'] ?? ''), 0, 80), time()]);
            $n++;
        }
    });
    return $n;
}

function chrome_profiles_list(int $uid): array
{
    $st = db()->prepare('SELECT dir, name, email, gaia, purpose, sites FROM chrome_profiles WHERE user_id = ? ORDER BY CAST(REPLACE(REPLACE(dir, "Default", "0"), "Profile ", "") AS INTEGER)');
    $st->execute([$uid]);
    return $st->fetchAll();
}

/** Tell Jarvis what a profile is for. `profile` may be the folder (Profile 23), the name, or the email. */
function chrome_profile_set(int $uid, string $profile, string $purpose, string $sites): string
{
    $p = strtolower(trim($profile));
    foreach (chrome_profiles_list($uid) as $row) {
        if (in_array($p, [strtolower($row['dir']), strtolower($row['name']), strtolower($row['email']), strtolower($row['gaia'])], true)) {
            db()->prepare('UPDATE chrome_profiles SET purpose = ?, sites = ? WHERE user_id = ? AND dir = ?')
                ->execute([mb_substr($purpose, 0, 200), mb_substr($sites, 0, 300), $uid, $row['dir']]);
            return 'Saved: ' . $row['dir'] . ' (' . $row['name'] . ') = ' . $purpose;
        }
    }
    return 'Error: aisa Chrome profile nahi mila. Pehle laptop se profile list mangao (pc_command chrome_profiles).';
}

/** Compact profile table for the prompt, only when the request is about browsing / accounts / sites. */
function chrome_context(int $uid, string $text): string
{
    if (!preg_match('/chrome|browser|profile|login|log in|site|website|blog|seo|wordpress|account|gmail|search console|analytics|ads|facebook|instagram|youtube|khol|open/iu', $text)) {
        return '';
    }
    $rows = chrome_profiles_list($uid);
    if (!$rows) {
        return '';
    }
    $out = "CHROME PROFILES on the laptop (use pc_command open_url with profile = the dir; pick by purpose/email; if unsure which one, ask once and then chrome_profile_set it):\n";
    foreach ($rows as $r) {
        $out .= '- ' . $r['dir'] . ' | ' . $r['name'] . ' | ' . $r['email'] . ($r['purpose'] ? ' | FOR: ' . $r['purpose'] : '') . ($r['sites'] ? ' | sites: ' . $r['sites'] : '') . "\n";
    }
    return $out;
}

// ---------------------------------------------------------------- standing authority

function authority_list(): array
{
    $v = json_decode((string) kv_get('authority_extra'), true);
    return is_array($v) ? array_values(array_diff($v, AUTHORITY_HARD_STOP)) : [];
}

/** Allow (or take back) an action without asking. Only when the owner's own message says so; the hard-stop list never opens. */
function authority_set(string $action, bool $allow, string $userText): string
{
    if (!in_array($action, PC_ACTIONS, true)) {
        return 'Error: unknown action ' . $action;
    }
    if (in_array($action, AUTHORITY_HARD_STOP, true)) {
        return 'Error: ' . $action . ' hamesha aapke tap se hi chalega (safety).';
    }
    if (!preg_match('/khud|bina pooch|bina puch|puchhe bina|poochhe bina|permission|authority|adhikar|approve mat|approval mat|auto|without asking|freely|full access|poori chhoot|chhoot/iu', $userText)) {
        return 'Error: ye badlav tabhi hota hai jab aap khud chat me saaf bolo (jaise "codex_work ke liye bina puchhe kaam karo").';
    }
    $cur = authority_list();
    $cur = $allow ? array_values(array_unique(array_merge($cur, [$action]))) : array_values(array_diff($cur, [$action]));
    kv_set('authority_extra', json_encode($cur));
    return ($allow ? 'Ab ' . $action . ' bina puchhe chalega.' : $action . ' ke liye dobara approval lagega.') . ' Chalu list: ' . (implode(', ', $cur) ?: '(koi extra nahi)');
}

// ---------------------------------------------------------------- prompt context

/** Everything Jarvis remembers that is worth showing to the AI for this request (kept small). */
function memory_context(int $uid, string $text): string
{
    $out = '';
    $overview = memory_overview($uid);
    if (!str_starts_with($overview, 'Abhi kisi')) {
        $out .= "PROJECT MEMORY (what each project is doing and what comes next; update it with project_note after real progress):\n" . $overview . "\n";
    }
    if ($styles = memory_styles($uid)) {
        $out .= "HOW THE OWNER LIKES TO WORK (learned; follow it):\n- " . implode("\n- ", $styles) . "\n";
    }
    if ($extra = authority_list()) {
        $out .= "OWNER HAS ALLOWED WITHOUT ASKING: " . implode(', ', $extra) . "\n";
    }
    return $out . chrome_context($uid, $text);
}
