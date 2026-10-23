<?php
declare(strict_types=1);

/** Plain HTTPS JSON call. Returns [http code, decoded body, curl error]. */
function llm_http(string $url, array $headers, array $body, int $timeout): array
{
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_POST           => true,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => $timeout,
        CURLOPT_CONNECTTIMEOUT => 8,
        CURLOPT_HTTPHEADER     => array_merge(['Content-Type: application/json'], $headers),
        CURLOPT_POSTFIELDS     => json_encode($body, JSON_UNESCAPED_UNICODE),
    ]);
    $raw = curl_exec($ch);
    $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $err = curl_error($ch);
    curl_close($ch);
    return [$code, json_decode((string) $raw, true) ?: [], $err];
}

function llm_error_text(array $j, int $code, string $err): string
{
    return $err !== '' ? 'connect: ' . $err : ($j['error']['message'] ?? ('HTTP ' . $code));
}

/** Google Gemini. Tries each configured model in turn, because one model can be "high demand" while another is fine. */
function gemini_generate(string $prompt): string
{
    $key = (string) cfg('gemini_api_key');
    if ($key === '') {
        throw new RuntimeException('gemini_api_key set nahi hai');
    }
    $models = cfg('gemini_models');
    $models = is_array($models) && $models ? $models : ['gemini-3.1-flash-lite', 'gemini-3.5-flash'];
    $last = '';
    foreach ($models as $m) {
        [$code, $j, $err] = llm_http(
            'https://generativelanguage.googleapis.com/v1beta/models/' . rawurlencode((string) $m) . ':generateContent',
            ['x-goog-api-key: ' . $key],
            [
                'contents'         => [['role' => 'user', 'parts' => [['text' => $prompt]]]],
                'generationConfig' => ['responseMimeType' => 'application/json', 'temperature' => 0.3],
            ],
            $m === $models[0] ? 12 : 25
        );
        $text = $j['candidates'][0]['content']['parts'][0]['text'] ?? '';
        if ($code === 200 && $text !== '') {
            return $text;
        }
        $last = $m . ': ' . llm_error_text($j, $code, $err);
    }
    throw new RuntimeException('Gemini: ' . mb_substr($last, 0, 200));
}

/** OpenAI chat completions. */
function openai_generate(string $prompt): string
{
    $key = (string) cfg('openai_api_key');
    if ($key === '') {
        throw new RuntimeException('openai_api_key set nahi hai');
    }
    $model = (string) (cfg('openai_model') ?: 'gpt-5.4-mini');
    [$code, $j, $err] = llm_http(
        'https://api.openai.com/v1/chat/completions',
        ['Authorization: Bearer ' . $key],
        ['model' => $model, 'messages' => [['role' => 'user', 'content' => $prompt]], 'response_format' => ['type' => 'json_object']],
        40
    );
    $text = $j['choices'][0]['message']['content'] ?? '';
    if ($code === 200 && $text !== '') {
        return $text;
    }
    throw new RuntimeException('OpenAI: ' . mb_substr($model . ': ' . llm_error_text($j, $code, $err), 0, 200));
}

/** Plain-text Gemini answer (no JSON mode). Tries each configured model like gemini_generate(). */
function gemini_text(string $prompt, int $timeout = 40): string
{
    $key = (string) cfg('gemini_api_key');
    if ($key === '') {
        throw new RuntimeException('gemini_api_key set nahi hai');
    }
    $models = cfg('gemini_models');
    $models = is_array($models) && $models ? $models : ['gemini-3.1-flash-lite', 'gemini-3.5-flash'];
    $last = '';
    foreach ($models as $m) {
        [$code, $j, $err] = llm_http(
            'https://generativelanguage.googleapis.com/v1beta/models/' . rawurlencode((string) $m) . ':generateContent',
            ['x-goog-api-key: ' . $key],
            ['contents' => [['role' => 'user', 'parts' => [['text' => $prompt]]]], 'generationConfig' => ['temperature' => 0.4]],
            $timeout
        );
        $text = trim((string) ($j['candidates'][0]['content']['parts'][0]['text'] ?? ''));
        if ($code === 200 && $text !== '') {
            return $text;
        }
        $last = $m . ': ' . llm_error_text($j, $code, $err);
    }
    throw new RuntimeException('Gemini: ' . mb_substr($last, 0, 200));
}
