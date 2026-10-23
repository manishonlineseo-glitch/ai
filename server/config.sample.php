<?php
// Copy this file to config.php and fill it in. config.php is git-ignored.
return [
    // Server-side only. Never put this key in JavaScript or in the agent.
    'anthropic_api_key' => '',
    'model'             => 'claude-sonnet-5-5',

    // Keep true on the live site (HTTPS). Set false only for local testing.
    'require_https'     => true,

    // Move this outside public_html if your host allows it.
    'db_path'           => __DIR__ . '/data/app.sqlite',

    'timezone'          => 'Asia/Kolkata',

    // PC actions that run without asking you first. Everything else
    // waits in "Pending" until you tap Approve in the app.
    'no_confirm_actions' => ['cpu_status', 'speak'],

    'chat_rate_per_min' => 20,
];
