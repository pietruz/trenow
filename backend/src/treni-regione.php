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
    1 => 'Lombardia, Emilia',
    2 => 'Liguria',
    3 => 'Piemonte, Valle d\'Aosta',
    4 => 'Valle d\'Aosta',
    5 => 'Lazio, Campania',
    6 => 'Marche, Umbria',
    7 => 'Molise, Campania',
    8 => 'Emilia-Romagna',
    9 => 'Trentino',
    10 => 'Friuli-Venezia Giulia',
    11 => 'Marche',
    12 => 'Veneto, Trentino',
    13 => 'Toscana',
    14 => 'Sicilia',
    15 => 'Basilicata',
    16 => 'Puglia',
    17 => 'Calabria',
    18 => 'Campania',
    19 => 'Abruzzo',
    20 => 'Sardegna',
    21 => 'Alto Adige',
    22 => 'Alto Adige',
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

$stmt = $db->prepare("SELECT id, nome FROM stazioni WHERE regione = ? AND lat != 0 ORDER BY LENGTH(nome) DESC");
$stmt->execute([$regione]);
$stazioni = array_slice($stmt->fetchAll(), 0, $limit);

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
