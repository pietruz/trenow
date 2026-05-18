<?php

require_once __DIR__ . '/config.php';

$stazione = $_GET['stazione'] ?? '';
if (empty($stazione)) {
    http_response_code(400);
    echo json_encode(['error' => 'Parametro stazione richiesto']);
    exit;
}

$orario = $_GET['orario'] ?? viaggiatrenoDate();
$url = API_BASE . "/partenze/{$stazione}/" . rawurlencode($orario);

$json = httpGet($url, 15);

if ($json === false) {
    http_response_code(502);
    echo json_encode([
        'error' => 'API Viaggiatreno non raggiungibile',
        'detail' => httpGetLastError(),
    ]);
    exit;
}

$decoded = json_decode($json, true);
if ($decoded === null && $json !== 'null') {
    http_response_code(502);
    echo json_encode([
        'error' => 'Risposta non valida da Viaggiatreno',
        'raw' => substr($json, 0, 500),
    ]);
    exit;
}

echo $json;
