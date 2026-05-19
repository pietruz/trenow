<?php

require_once __DIR__ . '/config.php';

try {
    $db = getDB();
    if (!$db) {
        $dbStatus = 'errore: database non raggiungibile';
    } else {
        $stmt = $db->query("SELECT COUNT(*) as cnt FROM stazioni");
        $count = $stmt->fetch()['cnt'];
        $dbStatus = "ok, $count stazioni";
    }
} catch (Throwable $e) {
    $dbStatus = 'errore: ' . $e->getMessage();
}

echo json_encode([
    'server_time' => date('c'),
    'php_version' => PHP_VERSION,
    'allow_url_fopen' => ini_get('allow_url_fopen'),
    'curl_available' => function_exists('curl_init'),
    'db_status' => $dbStatus,
    'routes' => [
        '/api/stazioni' => 'Elenco stazioni (con cache)',
        '/api/cerca?query=...' => 'Ricerca stazioni',
        '/api/partenze?stazione=...' => 'Partenze da stazione',
        '/api/arrivi?stazione=...' => 'Arrivi a stazione',
        '/api/treno?num=...' => 'Dettagli treno',
        '/api/test-api' => 'Test connesione Viaggiatreno',
        '/api/ping' => 'Questa pagina',
    ],
], JSON_PRETTY_PRINT);
