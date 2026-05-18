<?php

require_once __DIR__ . '/config.php';

$query = $_GET['query'] ?? '';
if (strlen($query) < 2) {
    echo json_encode([]);
    exit;
}

$url = API_BASE . "/cercaStazione/" . rawurlencode(strtoupper($query));
$json = httpGet($url, 10);

if ($json === false) {
    http_response_code(502);
    echo json_encode(['error' => 'API Viaggiatreno non raggiungibile']);
    exit;
}

echo $json;
