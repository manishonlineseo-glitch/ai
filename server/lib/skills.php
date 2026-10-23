<?php
declare(strict_types=1);

/**
 * Jarvis learns from its teacher (Gemini/OpenAI/laptop AI).
 *
 * Every plan the teacher makes for a command is logged (training data). When a command is turned into the same plan
 * twice and all its tools worked, it becomes a "skill": the sentence with the changing parts (contact, task text,
 * device) turned into slots, plus the plan with the same slots. Next time the same kind of sentence is answered
 * from the skill, instantly and without any AI call. Skills run through the same approval rules as any plan.
 * Open-ended chat and anything new still goes to the teacher.
 */

const SKILL_MIN_TEXT = 3;
const SKILL_MAX_TEXT = 300;
const SKILL_NEVER_LEARN = ['claude_work', 'gemini_work', 'codex_work', 'shutdown', 'restart'];

/** Light normalisation: trim, collapse spaces, drop trailing punctuation. Case and inner punctuation are kept for slot values. */
function skill_clean(string $text): string
{
    $t = preg_replace('/\s+/u', ' ', trim($text)) ?? '';
    return trim(preg_replace('/[\s.!?\x{0964}]+$/u', '', $t) ?? '');
}

function skill_min_seen(): int
{
    return max(1, (int) (cfg('skill_min_seen') ?: 2));
}

/** Names that can fill an "entity" slot right now: contacts, devices, PC projects. */
function skill_entities(int $userId): array
{
    $names = array_keys(wa_contacts());
    $st = db()->prepare('SELECT name, projects FROM devices WHERE user_id = ? AND blocked = 0');
    $st->execute([$userId]);
    foreach ($st->fetchAll() as $d) {
        $names[] = $d['name'];
        foreach (json_decode((string) $d['projects'], true) ?: [] as $p) {
            $names[] = $p;
        }
    }
    $names = array_values(array_unique(array_map(fn($n) => mb_strtolower((string) $n), $names)));
    usort($names, fn($a, $b) => mb_strlen($b) <=> mb_strlen($a)); // longest first so "home-pc" wins over "home"
    return $names;
}

/** Every string leaf of an array: [path, value]. */
function skill_leaves(array $node, array $path = []): array
{
    $out = [];
    foreach ($node as $k => $v) {
        if (is_array($v)) {
            $out = array_merge($out, skill_leaves($v, array_merge($path, [$k])));
        } elseif (is_string($v)) {
            $out[] = [array_merge($path, [$k]), $v];
        }
    }
    return $out;
}

function skill_replace_leaf(array &$node, array $path, string $with): void
{
    $ref = &$node;
    foreach ($path as $p) {
        $ref = &$ref[$p];
    }
    $ref = $with;
}

function skill_word_edge(string $text, int $pos, int $len): bool
{
    $before = $pos === 0 ? '' : mb_substr($text, $pos - 1, 1);
    $after = mb_substr($text, $pos + $len, 1);
    $isWord = fn(string $c) => $c !== '' && preg_match('/[\p{L}\p{N}_]/u', $c) === 1;
    return !$isWord($before) && !$isWord($after);
}

/**
 * Turn (sentence, plan) into a template with slots. Returns null when the plan should not be learned.
 * ['template', 'slots' => [n => 'entity'|'text'], 'plan' => actions with "{n}" placeholders, 'reply']
 */
function skill_templatize(int $userId, string $text, array $plan): ?array
{
    $clean = skill_clean($text);
    if (mb_strlen($clean) < SKILL_MIN_TEXT || mb_strlen($clean) > SKILL_MAX_TEXT || !$plan['actions']) {
        return null;
    }
    $actions = [];
    foreach ($plan['actions'] as $a) {
        if (!is_array($a) || !is_array($a['input'] ?? null)) {
            return null;
        }
        if (in_array((string) ($a['input']['action'] ?? ''), SKILL_NEVER_LEARN, true)) {
            return null;
        }
        $actions[] = ['tool' => (string) ($a['tool'] ?? ''), 'input' => $a['input']];
    }

    $entities = skill_entities($userId);
    $lower = mb_strtolower($clean);
    $found = []; // [start, length, original value, kind, action index, leaf path]
    foreach ($actions as $i => $a) {
        foreach (skill_leaves($a['input']) as [$path, $value]) {
            $v = trim($value);
            if (mb_strlen($v) < 3 || in_array(end($path), ['action', 'engine'], true)) {
                continue;
            }
            $pos = mb_strpos($lower, mb_strtolower($v));
            if ($pos === false || !skill_word_edge($lower, $pos, mb_strlen($v))) {
                if (mb_strlen($v) > 120) {
                    return null; // a long rewritten prompt that is not in the sentence: too specific to reuse
                }
                continue;
            }
            $found[] = [$pos, mb_strlen($v), $v, in_array(mb_strtolower($v), $entities, true) ? 'entity' : 'text', $i, $path];
        }
    }
    usort($found, fn($x, $y) => [$x[0], -$x[1]] <=> [$y[0], -$y[1]]);

    // build the template left to right, skipping overlaps
    $template = '';
    $cursor = 0;
    $slots = [];
    $byValue = []; // lower value => slot number
    foreach ($found as [$pos, $len, $val, $kind]) {
        if ($pos < $cursor) {
            continue;
        }
        $key = mb_strtolower($val);
        if (!isset($byValue[$key])) {
            $n = count($slots) + 1;
            $byValue[$key] = $n;
            $slots[$n] = $kind;
            $template .= mb_substr($clean, $cursor, $pos - $cursor) . '{' . $n . '}';
            $cursor = $pos + $len;
        }
    }
    $template .= mb_substr($clean, $cursor);
    if (count($slots) > 3 || preg_match('/^\{\d\}$/', $template)) {
        return null; // too many moving parts, or the whole sentence would be a wildcard
    }
    foreach ($found as [, , $val, , $i, $path]) {
        $n = $byValue[mb_strtolower($val)] ?? null;
        if ($n !== null) {
            skill_replace_leaf($actions[$i]['input'], $path, '{' . $n . '}');
        }
    }
    $reply = (string) $plan['reply'];
    foreach ($byValue as $val => $n) {
        $reply = preg_replace('/' . preg_quote((string) $val, '/') . '/iu', '{' . $n . '}', $reply) ?? $reply;
    }
    return ['template' => $template, 'slots' => $slots, 'plan' => $actions, 'reply' => mb_substr($reply, 0, 600)];
}

/** Record a teacher exchange and, when it worked, strengthen or create the matching skill. */
function skill_learn(int $userId, string $text, string $provider, array $plan, bool $ok): void
{
    $pdo = db();
    $pdo->prepare('INSERT INTO brain_log (user_id, text, provider, plan, ok, created_at) VALUES (?,?,?,?,?,?)')
        ->execute([$userId, mb_substr($text, 0, 1000), $provider, json_encode($plan, JSON_UNESCAPED_UNICODE), $ok ? 1 : 0, time()]);
    if (!$ok || $provider === 'skill') {
        return;
    }
    $t = skill_templatize($userId, $text, $plan);
    if ($t === null) {
        return;
    }
    $planJson = json_encode($t['plan'], JSON_UNESCAPED_UNICODE);
    $st = $pdo->prepare('SELECT id, plan FROM skills WHERE user_id = ? AND template = ?');
    $st->execute([$userId, $t['template']]);
    $row = db_fetch($st);
    if (!$row) {
        $pdo->prepare('INSERT INTO skills (user_id, template, slots, plan, reply, created_at) VALUES (?,?,?,?,?,?)')
            ->execute([$userId, $t['template'], json_encode($t['slots']), $planJson, $t['reply'], time()]);
    } elseif ($row['plan'] === $planJson) {
        $pdo->prepare('UPDATE skills SET seen_count = seen_count + 1, reply = ? WHERE id = ?')->execute([$t['reply'], $row['id']]);
    } else { // the teacher changed its mind: keep the newest plan and start counting again
        $pdo->prepare('UPDATE skills SET plan = ?, reply = ?, slots = ?, seen_count = 1 WHERE id = ?')
            ->execute([$planJson, $t['reply'], json_encode($t['slots']), $row['id']]);
    }
}

/** Try to answer from a learned skill. Returns ['reply', 'actions', 'skill_id'] or null. */
function skill_match(int $userId, string $text): ?array
{
    $clean = skill_clean($text);
    if ($clean === '' || mb_strlen($clean) > SKILL_MAX_TEXT) {
        return null;
    }
    $st = db()->prepare('SELECT * FROM skills WHERE user_id = ? AND enabled = 1 AND seen_count >= ?');
    $st->execute([$userId, skill_min_seen()]);
    $entities = null;
    $best = null;
    foreach ($st->fetchAll() as $s) {
        $slots = json_decode($s['slots'], true) ?: [];
        $parts = preg_split('/\{(\d)\}/', $s['template'], -1, PREG_SPLIT_DELIM_CAPTURE);
        $re = '';
        $order = [];
        foreach ($parts as $i => $part) {
            if ($i % 2 === 0) {
                $re .= preg_quote($part, '/');
                continue;
            }
            $n = (int) $part;
            $order[] = $n;
            if (($slots[$n] ?? 'text') === 'entity') {
                $entities ??= skill_entities($userId);
                $re .= $entities ? '(' . implode('|', array_map(fn($e) => preg_quote($e, '/'), $entities)) . ')' : '(?!)';
            } else {
                $re .= '(.{1,200}?)';
            }
        }
        if (!preg_match('/^' . $re . '$/iu', $clean, $m)) {
            continue;
        }
        $fill = [];
        foreach ($order as $k => $n) {
            $fill[$n] = $m[$k + 1];
        }
        $staticLen = mb_strlen(preg_replace('/\{\d\}/', '', $s['template']) ?? '');
        if ($best === null || $staticLen > $best['len']) {
            $best = ['skill' => $s, 'fill' => $fill, 'len' => $staticLen];
        }
    }
    if ($best === null) {
        return null;
    }
    $sub = fn(string $v) => preg_replace_callback('/\{(\d)\}/', fn($mm) => $best['fill'][(int) $mm[1]] ?? $mm[0], $v) ?? $v;
    $actions = json_decode($best['skill']['plan'], true) ?: [];
    array_walk_recursive($actions, function (&$v) use ($sub) {
        if (is_string($v)) {
            $v = $sub($v);
        }
    });
    db()->prepare('UPDATE skills SET used_count = used_count + 1, last_used = ? WHERE id = ?')->execute([time(), $best['skill']['id']]);
    return ['reply' => $sub((string) $best['skill']['reply']), 'actions' => $actions, 'skill_id' => (int) $best['skill']['id']];
}

/** Numbers for the Command Center and the "Seekha" tab. */
function skill_stats(int $userId): array
{
    $pdo = db();
    $st = $pdo->prepare('SELECT provider, COUNT(*) c FROM brain_log WHERE user_id = ? AND created_at > ? GROUP BY provider');
    $st->execute([$userId, time() - 30 * 86400]);
    $by = [];
    foreach ($st->fetchAll() as $r) {
        $by[$r['provider']] = (int) $r['c'];
    }
    $total = array_sum($by);
    $learned = $pdo->prepare('SELECT COUNT(*) FROM skills WHERE user_id = ? AND enabled = 1 AND seen_count >= ?');
    $learned->execute([$userId, skill_min_seen()]);
    $pending = $pdo->prepare('SELECT COUNT(*) FROM skills WHERE user_id = ? AND seen_count < ?');
    $pending->execute([$userId, skill_min_seen()]);
    return [
        'skills'       => (int) $learned->fetchColumn(),
        'learning'     => (int) $pending->fetchColumn(),
        'requests_30d' => $total,
        'local_30d'    => $by['skill'] ?? 0,
        'local_pct'    => $total ? (int) round(100 * ($by['skill'] ?? 0) / $total) : 0,
        'by_provider'  => $by,
    ];
}
