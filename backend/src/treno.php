<?php

require_once __DIR__ . '/config.php';

$numero = $_GET['num'] ?? '';
$codOrigine = $_GET['orig'] ?? '';
$data = $_GET['data'] ?? '';

if (empty($numero)) {
    http_response_code(400);
    echo json_encode(['error' => 'Parametro num richiesto']);
    exit;
}

if (empty($codOrigine)) {
    $url = API_BASE . "/cercaNumeroTrenoTrenoAutocomplete/{$numero}";
    $body = httpGet($url, 10);

    if ($body === false || trim($body) === '') {
        http_response_code(404);
        echo json_encode(['error' => 'Treno non trovato']);
        exit;
    }

    $lines = array_filter(explode("\n", trim($body)));
    $results = [];
    foreach ($lines as $line) {
        $parts = explode('|', trim($line));
        if (count($parts) >= 2) {
            $subParts = explode(' - ', $parts[0], 2);
            $detailParts = explode('-', $parts[1]);
            $results[] = [
                'numero' => $subParts[0] ?? $numero,
                'origine' => $subParts[1] ?? '',
                'codiceOrigine' => $detailParts[1] ?? '',
                'timestamp' => $detailParts[2] ?? '',
            ];
        }
    }

    if (empty($results)) {
        http_response_code(404);
        echo json_encode(['error' => 'Treno non trovato']);
        exit;
    }

    if (count($results) === 1 && empty($codOrigine)) {
        $codOrigine = $results[0]['codiceOrigine'];
    } else {
        echo json_encode(['disambigua' => $results]);
        exit;
    }
}

if (empty($data)) {
    $data = strtotime('today midnight') * 1000;
}

$url = API_BASE . "/andamentoTreno/{$codOrigine}/{$numero}/{$data}";
$json = httpGet($url, 15);

if ($json === false || $json === '') {
    http_response_code(204);
    echo json_encode(['error' => 'Dettagli non disponibili (HTTP 204)']);
    exit;
}

$dettaglio = json_decode($json, true);
if ($dettaglio === null) {
    http_response_code(502);
    echo json_encode(['error' => 'Risposta non valida da Viaggiatreno']);
    exit;
}

$db = getDB();
if ($db && isset($dettaglio['fermate']) && is_array($dettaglio['fermate'])) {
    $stmt = $db->prepare("SELECT id, lat, lon FROM stazioni WHERE id = ?");

    foreach ($dettaglio['fermate'] as &$fermata) {
        $id = $fermata['id'] ?? '';
        if (!empty($id)) {
            $stmt->execute([$id]);
            $geo = $stmt->fetch();
            if ($geo) {
                $fermata['lat'] = (float)$geo['lat'];
                $fermata['lon'] = (float)$geo['lon'];
            }
        }
    }
    unset($fermata);
}

echo json_encode($dettaglio);
