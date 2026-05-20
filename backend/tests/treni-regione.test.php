<?php

$failures = 0;
$total = 0;

function test(string $name, bool $condition): void {
    global $total, $failures;
    $total++;
    if ($condition) {
        echo "  OK $name\n";
    } else {
        echo "  FAIL $name\n";
        $failures++;
    }
}

$urls = [
    'Puglia' => 'http://localhost:8080/api/treni-regione?regione=16&refresh=force',
    'Lombardia' => 'http://localhost:8080/api/treni-regione?regione=1&refresh=force',
    'Lazio' => 'http://localhost:8080/api/treni-regione?regione=5&refresh=force',
];

foreach ($urls as $nome => $url) {
    echo "\n--- $nome ---\n";

    $response = @file_get_contents($url);
    test("HTTP response non vuota", $response !== false);

    $data = json_decode($response, true);
    test("JSON valido", $data !== null);
    test("regione presente", isset($data['regione']));
    test("nomeRegione presente e non vuoto", !empty($data['nomeRegione']));
    test("timestamp presente", isset($data['timestamp']));
    test("treni è un array", isset($data['treni']) && is_array($data['treni']));

    $treni = $data['treni'] ?? [];
    test("almeno un treno trovato", count($treni) > 0);

    // deduplicazione
    $keys = array_map(fn($t) => ($t['numeroTreno'] ?? '') . '-' . ($t['codOrigine'] ?? ''), $treni);
    test("nessun duplicato", count($keys) === count(array_unique($keys)));

    // struttura del primo treno
    if (count($treni) > 0) {
        $t = $treni[0];
        test("treno ha numeroTreno", isset($t['numeroTreno']));
        test("treno ha codOrigine", isset($t['codOrigine']));
        test("treno ha destinazione", isset($t['destinazione']));
        test("treno ha orarioPartenza", isset($t['orarioPartenza']));
    }
}

echo "\n=== RISULTATO: $total test, $failures fallimenti ===\n";
exit($failures > 0 ? 1 : 0);
