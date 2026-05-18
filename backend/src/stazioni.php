<?php

require_once __DIR__ . '/config.php';

$db = getDB();

$stmt = $db->query("SELECT COUNT(*) as cnt FROM stazioni");
$count = $stmt->fetch()['cnt'];

if ($count === 0) {
    $regioni = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22];

    $totali = 0;
    foreach ($regioni as $reg) {
        $url = API_BASE . "/elencoStazioni/{$reg}";
        $json = httpGet($url, 20);
        if ($json === false) continue;

        $elenco = json_decode($json, true);
        if (!is_array($elenco)) continue;

        $insert = $db->prepare(
            "INSERT IGNORE INTO stazioni (id, nome, nome_breve, lat, lon, regione) VALUES (?, ?, ?, ?, ?, ?)"
        );

        foreach ($elenco as $s) {
            if (empty($s['codiceStazione'])) continue;
            $nome = $s['localita']['nomeLungo'] ?? '';
            $breve = $s['localita']['nomeBreve'] ?? '';
            $lat = $s['lat'] ?? 0;
            $lon = $s['lon'] ?? 0;
            if ($lat == 0 && $lon == 0) continue;

            $insert->execute([$s['codiceStazione'], $nome, $breve, $lat, $lon, $reg]);
            $totali++;
        }
    }
}

$stmt = $db->query("SELECT id, nome, nome_breve, lat, lon, regione FROM stazioni ORDER BY nome");
$stazioni = $stmt->fetchAll();

echo json_encode($stazioni);
