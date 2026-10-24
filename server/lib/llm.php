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

/**
 * One Gemini call. A model whose free daily quota is used up is skipped until its quota returns (the error says when),
 * so it costs no time on every message; every failure is also appended to data/llm_errors.log to explain a bad day later.
 * Returns the text or throws.
 */
function gemini_call(string $model, array $body, int $timeout): string
{
    $until = (int) kv_get('gem_block_' . $model);
    if ($until > time()) {
        throw new RuntimeException($model . ': quota khatam, ' . round(($until - time()) / 3600, 1) . ' ghante baad wapas');
    }
    [$code, $j, $err] = llm_http(
        'https://generativelanguage.googleapis.com/v1beta/models/' . rawurlencode($model) . ':generateContent',
        ['x-goog-api-key: ' . (string) cfg('gemini_api_key')],
        $body,
        $timeout
    );
    $text = trim((string) ($j['candidates'][0]['content']['parts'][0]['text'] ?? ''));
    if ($code === 200 && $text !== '') {
        return $text;
    }
    $msg = llm_error_text($j, $code, $err);
    if ($code === 429) { // quota: per day => wait until it returns, per minute => a short pause
        $perDay = false;
        $delay = 30;
        foreach ($j['error']['details'] ?? [] as $d) {
            foreach ($d['violations'] ?? [] as $v) {
                $perDay = $perDay || str_contains((string) ($v['quotaId'] ?? ''), 'PerDay');
            }
            if (isset($d['retryDelay'])) {
                $delay = (int) $d['retryDelay'];
            }
        }
        kv_set('gem_block_' . $model, (string) (time() + ($perDay ? min(max($delay, 600), 86400) : 30)));
    }
    @file_put_contents(__DIR__ . '/../data/llm_errors.log', gmdate('c') . " gemini $model HTTP $code " . mb_substr($msg, 0, 200) . "\n", FILE_APPEND);
    throw new RuntimeException($model . ': ' . mb_substr($msg, 0, 120));
}

function gemini_models(): array
{
    $models = cfg('gemini_models');
    return is_array($models) && $models ? $models : ['gemini-3.1-flash-lite', 'gemini-3.5-flash'];
}

/** Google Gemini with a JSON answer. Tries each configured model in turn. */
function gemini_generate(string $prompt): string
{
    if ((string) cfg('gemini_api_key') === '') {
        throw new RuntimeException('gemini_api_key set nahi hai');
    }
    $last = '';
    foreach (gemini_models() as $i => $m) {
        try {
            return gemini_call((string) $m, [
                'contents'         => [['role' => 'user', 'parts' => [['text' => $prompt]]]],
                'generationConfig' => ['responseMimeType' => 'application/json', 'temperature' => 0.3],
            ], $i === 0 ? 12 : 25);
        } catch (RuntimeException $e) {
            $last .= ($last ? ' | ' : '') . $e->getMessage();
        }
    }
    throw new RuntimeException('Gemini: ' . mb_substr($last, 0, 260));
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

/** Plain-text Gemini answer (no JSON mode). */
function gemini_text(string $prompt, int $timeout = 40): string
{
    if ((string) cfg('gemini_api_key') === '') {
        throw new RuntimeException('gemini_api_key set nahi hai');
    }
    $last = '';
    foreach (gemini_models() as $m) {
        try {
            return gemini_call((string) $m, [
                'contents'         => [['role' => 'user', 'parts' => [['text' => $prompt]]]],
                'generationConfig' => ['temperature' => 0.4],
            ], $timeout);
        } catch (RuntimeException $e) {
            $last .= ($last ? ' | ' : '') . $e->getMessage();
        }
    }
    throw new RuntimeException('Gemini: ' . mb_substr($last, 0, 260));
}

/** Gemini reads a photo or PDF (prescription, lab report, question paper, notes) and answers in text. */
function gemini_vision(string $prompt, string $mime, string $b64): string
{
    if ((string) cfg('gemini_api_key') === '') {
        throw new RuntimeException('gemini_api_key set nahi hai');
    }
    $last = '';
    foreach (gemini_models() as $m) {
        try {
            return gemini_call((string) $m, [
                'contents'         => [['role' => 'user', 'parts' => [['text' => $prompt], ['inline_data' => ['mime_type' => $mime, 'data' => $b64]]]]],
                'generationConfig' => ['temperature' => 0.3],
            ], 60);
        } catch (RuntimeException $e) {
            $last .= ($last ? ' | ' : '') . $e->getMessage();
        }
    }
    throw new RuntimeException('Gemini: ' . mb_substr($last, 0, 260));
}

/** Text to speech with Gemini. Returns raw 16-bit mono PCM at 24 kHz (base64) or throws. voice: Kore (female), Charon/Puck (male)... */
function gemini_tts(string $text, string $voice = 'Kore', string $style = ''): string
{
    if ((string) cfg('gemini_api_key') === '') {
        throw new RuntimeException('gemini_api_key set nahi hai');
    }
    $last = '';
    foreach (['gemini-3.8-flash-lite-tts', 'gemini-3.8-flash-tts', 'gemini-2.5-flash-preview-tts'] as $m) {
        [$code, $j, $err] = llm_http('https://generativelanguage.googleapis.com/v1beta/models/' . $m . ':generateContent', ['x-goog-api-key: ' . (string) cfg('gemini_api_key')], [
            'contents'         => [['role' => 'user', 'parts' => [['text' => $text]]]],
            'generationConfig' => ['responseModalities' => ['AUDIO'], 'speechConfig' => ['voiceConfig' => ['prebuiltVoiceConfig' => ['voiceName' => $voice]]]],
        ], 30);
        $b64 = $j['candidates'][0]['content']['parts'][0]['inlineData']['data'] ?? '';
        if ($code === 200 && $b64 !== '') {
            return (string) $b64;
        }
        $last .= ($last ? ' | ' : '') . $m . ': ' . mb_substr(llm_error_text($j, $code, $err), 0, 80);
    }
    throw new RuntimeException('TTS: ' . $last);
}

/** Speech to text for a short WAV clip (what the other person said on the phone). Returns the text ("" when only noise). */
function gemini_stt(string $wavB64, string $lang = 'Hindi/Hinglish'): string
{
    $out = gemini_vision("Transcribe exactly what the person says in this phone-call clip ($lang). Reply with only the words spoken, in the language/script they used (Hindi in Roman letters is fine). If there is only silence, noise or no clear speech, reply with exactly: [silence]", 'audio/wav', $wavB64);
    $out = trim($out);
    return stripos($out, '[silence]') !== false ? '' : $out;
}
