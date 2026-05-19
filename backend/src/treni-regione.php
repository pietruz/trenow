<?php

require_once __DIR__ . '/config.php';

$regione = isset($_GET['regione']) ? (int)$_GET['regione'] : 0;
$refresh = ($_GET['refresh'] ?? '') === 'force';
$limit = isset($_GET['limite']) ? min((int)$_GET['limite'], 80) : 20;

if ($regione < 1 || $regione > 22) {
    http_response_code(400);
    echo json_encode(['error' => 'Regione non valida. Valori 1-22.']);
    exit;
}

$nomiRegioni = [
    1 => 'Abruzzo', 2 => 'Basilicata', 3 => 'Calabria', 4 => 'Campania',
    5 => 'Emilia-Romagna', 6 => 'Friuli-Venezia Giulia', 7 => 'Lazio', 8 => 'Liguria',
    9 => 'Lombardia', 10 => 'Marche', 11 => 'Molise', 12 => 'Piemonte',
    13 => 'Puglia', 14 => 'Sardegna', 15 => 'Sicilia', 16 => 'Toscana',
    17 => 'Trentino-Alto Adige', 18 => 'Umbria', 19 => "Valle d'Aosta", 20 => 'Veneto',
    21 => 'Extra', 22 => 'Extra',
];

$db = getDB();
if (!$db) {
    http_response_code(500);
    echo json_encode(['error' => 'Database non disponibile']);
    exit;
}

$cacheKey = "treni_regione_{$regione}";
if (!$refresh) {
    $stmt = $db->prepare("SELECT data FROM treni_cache WHERE chiave = ? AND last_updated > DATE_SUB(NOW(), INTERVAL 2 MINUTE)");
    $stmt->execute([$cacheKey]);
    $cached = $stmt->fetch();
    if ($cached) {
        header('Content-Type: application/json');
        echo $cached['data'];
        exit;
    }
}

$stmt = $db->prepare("SELECT id, nome FROM stazioni WHERE regione = ? AND lat != 0 ORDER BY LENGTH(nome) DESC LIMIT ?");
$stmt->execute([$regione, $limit]);
$stazioni = $stmt->fetchAll();

if (empty($stazioni)) {
    $res = ['regione' => $regione, 'nomeRegione' => $nomiRegioni[$regione], 'timestamp' => date('c'), 'treni' => []];
    echo json_encode($res);
    exit;
}

$orario = viaggiatrenoDate();

$multi = curl_multi_init();
$handles = [];
foreach ($stazioni as $i => $s) {
    $url = API_BASE . "/partenze/{$s['id']}/" . rawurlencode($orario);
    $ch = curl_init();
    curl_setopt_array($ch, [
        CURLOPT_URL => $url,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 8,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_USERAGENT => 'Mozilla/5.0 (compatible; TrainTracker/1.0)',
        CURLOPT_SSL_VERIFYPEER => false,
    ]);
    curl_multi_add_handle($multi, $ch);
    $handles[$i] = ['ch' => $ch, 'nome' => $s['nome']];
}

$running = null;
do {
    curl_multi_exec($multi, $running);
    if ($running > 0) {
        curl_multi_select($multi, 5);
    }
} while ($running > 0);

$treni = [];
$seen = [];
foreach ($handles as $h) {
    $body = curl_multi_getcontent($h['ch']);
    $httpCode = curl_getinfo($h['ch'], CURLINFO_HTTP_CODE);
    curl_multi_remove_handle($multi, $h['ch']);
    curl_close($h['ch']);

    if ($body === false || $httpCode !== 200) continue;

    $decoded = json_decode($body, true);
    if (!is_array($decoded)) continue;

    foreach ($decoded as $t) {
        $key = ($t['numeroTreno'] ?? '') . '-' . ($t['codOrigine'] ?? '');
        if ($key === '-' || isset($seen[$key])) continue;
        $seen[$key] = true;
        $treni[] = $t;
    }
}
curl_multi_close($multi);

usort($treni, function ($a, $b) {
    return ($a['orarioPartenza'] ?? 0) - ($b['orarioPartenza'] ?? 0);
});

$result = [
    'regione' => $regione,
    'nomeRegione' => $nomiRegioni[$regione],
    'timestamp' => date('c'),
    'treni' => $treni,
];

$json = json_encode($result);

$stmt = $db->prepare("REPLACE INTO treni_cache (chiave, data) VALUES (?, ?)");
$stmt->execute([$cacheKey, $json]);

header('Content-Type: application/json');
echo $json;
