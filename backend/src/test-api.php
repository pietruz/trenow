<?php

require_once __DIR__ . '/config.php';

$testUrl = API_BASE . "/cercaStazione/MILANO%20C";

$json = httpGet($testUrl, 10);

if ($json === false) {
    echo json_encode([
        'status' => 'error',
        'test_url' => $testUrl,
        'error' => httpGetLastError(),
        'allow_url_fopen' => ini_get('allow_url_fopen'),
        'curl_available' => function_exists('curl_init'),
    ], JSON_PRETTY_PRINT);
    exit;
}

$decoded = json_decode($json, true);
echo json_encode([
    'status' => 'ok',
    'test_url' => $testUrl,
    'response' => is_array($decoded) ? array_slice($decoded, 0, 2) : $decoded,
    'allow_url_fopen' => ini_get('allow_url_fopen'),
    'curl_available' => function_exists('curl_init'),
], JSON_PRETTY_PRINT);
