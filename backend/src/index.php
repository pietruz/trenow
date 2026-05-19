<?php

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

$requestUri = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$method = $_SERVER['REQUEST_METHOD'];

$routes = [
    '/api/stazioni'   => 'stazioni.php',
    '/api/cerca'      => 'cerca.php',
    '/api/partenze'   => 'partenze.php',
    '/api/arrivi'     => 'arrivi.php',
    '/api/treno'      => 'treno.php',
    '/api/test-api'   => 'test-api.php',
    '/api/ping'       => 'ping.php',
    '/api/treni-regione' => 'treni-regione.php',
];

if (isset($routes[$requestUri])) {
    require __DIR__ . '/' . $routes[$requestUri];
} else {
    http_response_code(404);
    echo json_encode(['error' => 'Not found']);
}
