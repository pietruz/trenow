<?php

require_once __DIR__ . '/config.php';

$regione = isset($_GET['regione']) ? (int)$_GET['regione'] : 0;
$refresh = ($_GET['refresh'] ?? '') === 'force';

if ($regione < 1 || $regione > 22) {
    http_response_code(400);
    echo json_encode(['error' => 'Regione non valida. Valori 1-22.']);
    exit;
}

$nomiRegioni = [
    1 => 'Lombardia',
    2 => 'Liguria',
    3 => 'Piemonte',
    4 => "Valle d'Aosta",
    5 => 'Lazio',
    6 => 'Marche',
    7 => 'Molise',
    8 => 'Emilia-Romagna',
    9 => 'Trentino-Alto Adige',
    10 => 'Friuli-Venezia Giulia',
    11 => 'Marche',
    12 => 'Veneto',
    13 => 'Toscana',
    14 => 'Sicilia',
    15 => 'Basilicata',
    16 => 'Puglia',
    17 => 'Calabria',
    18 => 'Campania',
    19 => 'Abruzzo',
    20 => 'Sardegna',
    21 => 'Trentino-Alto Adige',
    22 => 'Trentino-Alto Adige',
];

$stazioniRegionali = [
    'Abruzzo' => ['S07811', 'S07414', 'S08539'],
    'Basilicata' => ['S11420', 'S11458'],
    'Calabria' => ['S11781', 'S11749', 'S11739'],
    'Campania' => ['S09218', 'S09988', 'S09818', 'S09211', 'S09311'],
    'Emilia-Romagna' => ['S05043', 'S05254', 'S05014', 'S05032', 'S05712', 'S05071'],
    'Friuli-Venezia Giulia' => ['S03317', 'S03026', 'S02701', 'S03304'],
    'Lazio' => ['S08409', 'S08217', 'S08411', 'S08662', 'S08209'],
    'Liguria' => ['S04700', 'S04702', 'S06000', 'S04801', 'S04505'],
    'Lombardia' => ['S01700', 'S01645', 'S01820', 'S01717', 'S01529', 'S01322', 'S01807'],
    'Marche' => ['S07113', 'S07104', 'S07506'],
    'Molise' => ['S09459', 'S09053', 'S11019'],
    'Piemonte' => ['S00219', 'S00035', 'S00248', 'S00470', 'S00462', 'S00610'],
    'Puglia' => ['S11119', 'S11100', 'S11145', 'S11465', 'S11136', 'S11108'],
    'Sardegna' => ['S12891', 'S12807', 'S12855', 'S12878'],
    'Sicilia' => ['S12002', 'S12332', 'S12301', 'S12349'],
    'Toscana' => ['S06421', 'S06500', 'S06725', 'S06039', 'S06915', 'S06809'],
    'Trentino-Alto Adige' => ['S02038', 'S02026', 'S02011', 'S02216'],
    'Umbria' => ['S07020', 'S07226', 'S07217'],
    "Valle d'Aosta" => ['S00137'],
    'Veneto' => ['S02589', 'S02593', 'S02430', 'S02581', 'S02446', 'S02712'],
];

$nomeRegione = $nomiRegioni[$regione];
$stationIds = $stazioniRegionali[$nomeRegione] ?? [];

if (empty($stationIds)) {
    $res = ['regione' => $regione, 'nomeRegione' => $nomeRegione, 'timestamp' => date('c'), 'treni' => []];
    echo json_encode($res);
    exit;
}

$db = getDB();
$cacheKey = "treni_regione_{$regione}";
if ($db && !$refresh) {
    $stmt = $db->prepare("SELECT data FROM treni_cache WHERE chiave = ? AND last_updated > DATE_SUB(NOW(), INTERVAL 2 MINUTE)");
    $stmt->execute([$cacheKey]);
    $cached = $stmt->fetch();
    if ($cached) {
        header('Content-Type: application/json');
        echo $cached['data'];
        exit;
    }
}

$orario = viaggiatrenoDate();

$multi = curl_multi_init();
$handles = [];
foreach ($stationIds as $id) {
    foreach (['partenze', 'arrivi'] as $tipo) {
        $url = API_BASE . "/{$tipo}/{$id}/" . rawurlencode($orario);
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
        $handles[] = ['ch' => $ch];
    }
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
        // Filtra treni già arrivati, non partiti o annullati
        if (!empty($t['arrivato']) || !empty($t['nonPartito']) || ($t['provvedimento'] ?? 0) !== 0) continue;
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
    'nomeRegione' => $nomeRegione,
    'timestamp' => date('c'),
    'treni' => $treni,
];

$json = json_encode($result);

if ($db) {
    $stmt = $db->prepare("REPLACE INTO treni_cache (chiave, data) VALUES (?, ?)");
    $stmt->execute([$cacheKey, $json]);
}

header('Content-Type: application/json');
echo $json;
