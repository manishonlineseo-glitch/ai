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

    // WhatsApp Business Cloud API (official, from Meta). Leave empty to disable.
    'whatsapp_token'    => '',
    'whatsapp_phone_id' => '',
    'whatsapp_api_base' => 'https://graph.facebook.com/v21.0',
    // Only these contacts can ever be messaged. Name => number with country code, digits only.
    // The AI sees the names, never the numbers, and can't message anyone else.
    'whatsapp_contacts' => [
        // 'mom' => '919812345678',
    ],
];
