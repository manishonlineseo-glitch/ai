<?php
declare(strict_types=1);

const SCHEMA_VERSION = 6;

function cfg(?string $key = null)
{
    static $c = null;
    if ($c === null) {
        $file = __DIR__ . '/../config.php';
        $c = require (is_file($file) ? $file : __DIR__ . '/../config.sample.php');
        date_default_timezone_set($c['timezone'] ?? 'UTC');
    }
    return $key === null ? $c : ($c[$key] ?? null);
}

function db(): PDO
{
    static $pdo = null;
    if ($pdo) {
        return $pdo;
    }
    $path = (string) cfg('db_path');
    if (!is_dir(dirname($path))) {
        mkdir(dirname($path), 0750, true);
    }
    $pdo = new PDO('sqlite:' . $path, null, null, [
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ]);
    // Many callers at once (PC agent every 4 s, each open app every 4 s, the scheduler): WAL lets readers and the one
    // writer work side by side, and a writer waits up to 10 s for another writer instead of failing at once.
    $pdo->exec('PRAGMA busy_timeout = 10000');
    $pdo->exec('PRAGMA journal_mode = WAL');
    $pdo->exec('PRAGMA synchronous = NORMAL');
    $pdo->exec('PRAGMA foreign_keys = ON');
    // Schema changes run once per version, not on every request (they take write locks).
    if ((int) $pdo->query('PRAGMA user_version')->fetchColumn() < SCHEMA_VERSION) {
        try {
            migrate($pdo);
        } catch (PDOException $e) { // another request migrated at the same moment
            if (!str_contains($e->getMessage(), 'duplicate column') && !str_contains($e->getMessage(), 'locked')) {
                throw $e;
            }
        }
        $pdo->exec('PRAGMA user_version = ' . SCHEMA_VERSION);
    }
    return $pdo;
}

/** One row (or null) and the read cursor is released at once, so the next write in this request can never trip over it. */
function db_fetch(PDOStatement $st): ?array
{
    $row = $st->fetch();
    $st->closeCursor();
    return $row ?: null;
}

function migrate(PDO $pdo): void
{
    migrate_tables($pdo);
    // Columns added after the first release (SQLite has no ADD COLUMN IF NOT EXISTS).
    $have = array_column($pdo->query('PRAGMA table_info(devices)')->fetchAll(), 'name');
    foreach (['cpu' => 'REAL', 'ram' => 'REAL', 'battery' => 'REAL', 'metrics_at' => 'INTEGER', 'login_id' => 'INTEGER', 'projects' => 'TEXT'] as $col => $type) {
        if (!in_array($col, $have, true)) {
            $pdo->exec("ALTER TABLE devices ADD COLUMN $col $type");
        }
    }
    $haveTasks = array_column($pdo->query('PRAGMA table_info(tasks)')->fetchAll(), 'name');
    foreach ([
        'category' => 'TEXT NOT NULL DEFAULT "other"', 'status' => 'TEXT NOT NULL DEFAULT "todo"', 'details' => 'TEXT',
        'assignee' => 'TEXT NOT NULL DEFAULT "me"', 'priority' => 'INTEGER NOT NULL DEFAULT 0', 'due' => 'TEXT',
        'done_at' => 'INTEGER', 'updated_at' => 'INTEGER', 'run_state' => 'TEXT',
    ] as $col => $type) {
        if (!in_array($col, $haveTasks, true)) {
            $pdo->exec("ALTER TABLE tasks ADD COLUMN $col $type");
        }
    }
    $pdo->exec('UPDATE tasks SET status = "done" WHERE done = 1 AND status = "todo"');
    $haveCmd = array_column($pdo->query('PRAGMA table_info(commands)')->fetchAll(), 'name');
    if (!in_array('final', $haveCmd, true)) {
        $pdo->exec('ALTER TABLE commands ADD COLUMN final TEXT');
    }
}

function migrate_tables(PDO $pdo): void
{
    $pdo->exec('
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY,
            username TEXT NOT NULL UNIQUE,
            pass_hash TEXT NOT NULL,
            created_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS devices (
            id INTEGER PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            name TEXT NOT NULL,
            type TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT "client",
            token_hash TEXT NOT NULL UNIQUE,
            created_at INTEGER NOT NULL,
            last_seen INTEGER NOT NULL DEFAULT 0,
            blocked INTEGER NOT NULL DEFAULT 0,
            user_agent TEXT
        );
        CREATE TABLE IF NOT EXISTS tasks (
            id INTEGER PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            title TEXT NOT NULL,
            done INTEGER NOT NULL DEFAULT 0,
            created_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS notes (
            id INTEGER PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            body TEXT NOT NULL,
            created_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS commands (
            id INTEGER PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            device_id INTEGER NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
            action TEXT NOT NULL,
            args TEXT NOT NULL DEFAULT "{}",
            status TEXT NOT NULL,
            result TEXT,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_cmd_dev ON commands(device_id, status);
        CREATE TABLE IF NOT EXISTS messages_out (
            id INTEGER PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            channel TEXT NOT NULL,
            contact TEXT NOT NULL,
            recipient TEXT NOT NULL,
            body TEXT NOT NULL,
            status TEXT NOT NULL,
            result TEXT,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS chat (
            id INTEGER PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            role TEXT NOT NULL,
            content TEXT NOT NULL,
            created_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS device_logins (
            id INTEGER PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            login_name TEXT NOT NULL UNIQUE COLLATE NOCASE,
            pass_hash TEXT NOT NULL,
            name TEXT NOT NULL,
            type TEXT NOT NULL,
            created_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS task_log (
            id INTEGER PRIMARY KEY,
            task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            author TEXT NOT NULL,
            text TEXT NOT NULL,
            created_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_tasklog ON task_log(task_id);
        CREATE TABLE IF NOT EXISTS routines (
            id INTEGER PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            kind TEXT NOT NULL,
            title TEXT NOT NULL,
            query TEXT NOT NULL DEFAULT "",
            hhmm TEXT NOT NULL,
            enabled INTEGER NOT NULL DEFAULT 1,
            last_run_date TEXT
        );
        CREATE TABLE IF NOT EXISTS reports (
            id INTEGER PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            kind TEXT NOT NULL,
            body TEXT NOT NULL,
            created_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS kv (
            k TEXT PRIMARY KEY,
            v TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS skills (
            id INTEGER PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            template TEXT NOT NULL,
            slots TEXT NOT NULL DEFAULT "[]",
            plan TEXT NOT NULL,
            reply TEXT NOT NULL DEFAULT "",
            seen_count INTEGER NOT NULL DEFAULT 1,
            used_count INTEGER NOT NULL DEFAULT 0,
            enabled INTEGER NOT NULL DEFAULT 1,
            created_at INTEGER NOT NULL,
            last_used INTEGER,
            UNIQUE (user_id, template)
        );
        CREATE TABLE IF NOT EXISTS brain_log (
            id INTEGER PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            text TEXT NOT NULL,
            provider TEXT NOT NULL,
            plan TEXT NOT NULL,
            ok INTEGER NOT NULL DEFAULT 1,
            created_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS pair_codes (
            id INTEGER PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            code_hash TEXT NOT NULL UNIQUE,
            name TEXT NOT NULL,
            type TEXT NOT NULL,
            expires_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS login_attempts (
            ip TEXT NOT NULL,
            ts INTEGER NOT NULL
        );
    ');
}
