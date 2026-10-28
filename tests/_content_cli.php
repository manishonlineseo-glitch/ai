<?php
// Test helper: php _content_cli.php <site_dir>   (JSON on stdin, JSON on stdout). Used by tests/content_test.py only.
$site = $argv[1];
chdir($site);
foreach (['db', 'auth', 'memory', 'tools', 'content_rules', 'llm', 'knowledge', 'tasks'] as $lib) {
    require "lib/$lib.php";
}
$in = json_decode(stream_get_contents(STDIN), true);
$gen = function (array $drafts, array &$calls) {
    $i = 0;
    return function (string $prompt) use (&$i, $drafts, &$calls) {
        $calls[] = $prompt;
        return $drafts[min($i++, count($drafts) - 1)];
    };
};
switch ($in['op']) {
    case 'check':
        echo json_encode(content_check($in['doc']));
        break;
    case 'parse':
        echo json_encode(content_parse($in['raw']));
        break;
    case 'rules':
        echo json_encode(['rules' => content_rules_text(), 'human' => content_human_rules()]);
        break;
    case 'write':
        $calls = [];
        $w = content_write(1, $in['brief'], $gen($in['drafts'], $calls), $in['budget'] ?? 95);
        echo json_encode(['pass' => $w['result']['pass'], 'rounds' => $w['rounds'], 'failed' => $w['result']['failed'], 'calls' => $calls, 'doc' => $w['doc']]);
        break;
    case 'task': // a whole content task through the scheduler's own code path
        $calls = [];
        $GLOBALS['jarvis_content_generator'] = $gen($in['drafts'], $calls);
        $id = task_add(1, $in['title'], 'content', $in['details'], 'jarvis');
        $t = task_get(1, $id);
        task_execute($t);
        $t = task_get(1, $id);
        $log = db()->query("SELECT text FROM task_log WHERE task_id = $id ORDER BY id")->fetchAll(PDO::FETCH_COLUMN);
        echo json_encode(['status' => $t['status'], 'log' => $log, 'calls' => count($calls)]);
        break;
    case 'run_tool_add_task':
        echo json_encode(run_tool('add_task', ['title' => $in['title'], 'category' => 'content', 'details' => $in['details'], 'assignee' => 'jarvis'], 1));
        break;
}
