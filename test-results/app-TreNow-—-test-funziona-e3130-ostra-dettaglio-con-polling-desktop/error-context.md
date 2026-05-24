# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: app.spec.ts >> TreNow — test funzionali >> 06 — ricerca treno 9511 mostra dettaglio con polling
- Location: e2e/app.spec.ts:82:7

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByText(/In orario|ritardo|anticipo/)
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 5000ms
  - waiting for getByText(/In orario|ritardo|anticipo/)

```

```yaml
- banner:
  - text: TreNow
  - button "Impostazioni":
    - img
- img
- button "Zoom in"
- button "Zoom out"
- link "Leaflet":
  - /url: https://leafletjs.com
- text: ©
- link "OpenStreetMap":
  - /url: https://www.openstreetmap.org/copyright
- text: contributors Frecciarossa 9511
- button "✕"
- text: "MILANO CENTRALE → LECCE in orario Ultimo rilevamento:"
- strong: LECCE
- heading "Fermate" [level=4]
- button "Collassa fermate":
  - img
- button "✕"
- text: "MILANO CENTRALE Bin: 16 06:10 06:12 2 min MILANO ROGOREDO Bin: 8 06:20 06:24 4 min REGGIO EMILIA AV MEDIOPADANA Bin: 4 06:56 07:05 9 min BOLOGNA C.LE/AV Bin: 19 07:27 07:30 3 min FIRENZE SANTA MARIA NOVELLA Bin: 11 08:14 08:15 2 min ROMA TERMINI Bin: 10 10:00 10:04 4 min CASERTA Bin: 1 11:09 11:10 2 min BENEVENTO Bin: 4 12:07 12:08 1 min FOGGIA Bin: 1 13:17 13:18 1 min BARLETTA Bin: 1 13:46 13:47 2 min BARI CENTRALE Bin: 1 14:27 14:27 BRINDISI Bin: 2 15:30 15:30 1 min LECCE -3 min"
```

# Test source

```ts
  1   | import { test, expect, Page } from '@playwright/test';
  2   | 
  3   | async function clickResultItem(page: Page, text: string) {
  4   |   const el = page.locator('.result-item').filter({ hasText: text });
  5   |   await expect(el).toBeVisible({ timeout: 10000 });
  6   |   await el.evaluate(el => el.click());
  7   | }
  8   | 
  9   | async function clickToggle(page: Page, name: string) {
  10  |   const btn = page.getByRole('button', { name });
  11  |   // On mobile the toggle is inside the sidebar which may be closed
  12  |   const isMobile = await page.evaluate(() => window.innerWidth <= 768);
  13  |   if (isMobile) {
  14  |     // Open sidebar via FAB if needed
  15  |     const sidebar = page.locator('.sidebar');
  16  |     const hasOpen = await sidebar.evaluate(el => el.classList.contains('open'));
  17  |     if (!hasOpen) {
  18  |       await page.locator('.fab').click();
  19  |       await page.waitForTimeout(300);
  20  |     }
  21  |   }
  22  |   await btn.evaluate(el => el.click());
  23  | }
  24  | 
  25  | test.describe('TreNow — test funzionali', () => {
  26  | 
  27  |   test('01 — homepage si carica con mappa e toggle', async ({ page }) => {
  28  |     await page.goto('/');
  29  |     await expect(page.locator('.header-title')).toHaveText('TreNow');
  30  |     const toggleButtons = page.locator('.toggle button');
  31  |     await expect(toggleButtons).toHaveCount(3);
  32  |     await expect(toggleButtons.nth(0)).toHaveText('Stazione');
  33  |     await expect(toggleButtons.nth(1)).toHaveText('Treno');
  34  |     await expect(toggleButtons.nth(2)).toHaveText('Regione');
  35  |     await expect(page.locator('.leaflet-container')).toBeVisible();
  36  |   });
  37  | 
  38  |   test('02 — apertura/chiusura impostazioni', async ({ page }) => {
  39  |     await page.goto('/');
  40  |     await page.click('.settings-btn');
  41  |     await expect(page.locator('.settings-modal')).toBeVisible();
  42  |     await expect(page.locator('text=Intervallo aggiornamento')).toBeVisible();
  43  |     await expect(page.locator('text=5s')).toBeVisible();
  44  |     await expect(page.locator('text=2 min')).toBeVisible();
  45  |     await page.click('.settings-close');
  46  |     await expect(page.locator('.settings-modal')).not.toBeVisible();
  47  |   });
  48  | 
  49  |   test('03 — cambio intervallo refresh via slider', async ({ page }) => {
  50  |     await page.goto('/');
  51  |     await page.click('.settings-btn');
  52  |     const slider = page.locator('input[type="range"]');
  53  |     await slider.fill('30');
  54  |     await expect(page.locator('.settings-value')).toHaveText('30 secondi');
  55  |     const stored = await page.evaluate(() =>
  56  |       JSON.parse(localStorage.getItem('trenow_settings') || '{}')
  57  |     );
  58  |     expect(stored.refreshInterval).toBe(30);
  59  |     await page.click('.settings-close');
  60  |   });
  61  | 
  62  |   test('04 — ricerca stazione Roma Termini', async ({ page }) => {
  63  |     await page.goto('/');
  64  |     await page.getByPlaceholder('Nome stazione').fill('Roma');
  65  |     await page.getByPlaceholder('Nome stazione').press('Enter');
  66  |     await clickResultItem(page, 'ROMA TERMINI');
  67  |     await expect(page.locator('.station-panel')).toBeVisible();
  68  |     await expect(page.locator('text=Partenze')).toBeVisible();
  69  |     await expect(page.locator('text=Arrivi')).toBeVisible();
  70  |   });
  71  | 
  72  |   test('05 — cambio tab Arrivi in stazione', async ({ page }) => {
  73  |     await page.goto('/');
  74  |     await page.getByPlaceholder('Nome stazione').fill('Roma');
  75  |     await page.getByPlaceholder('Nome stazione').press('Enter');
  76  |     await clickResultItem(page, 'ROMA TERMINI');
  77  |     await expect(page.locator('.station-panel')).toBeVisible();
  78  |     await page.getByRole('button', { name: 'Arrivi' }).evaluate(el => el.click());
  79  |     await expect(page.getByRole('button', { name: 'Arrivi' })).toHaveAttribute('class', /active/);
  80  |   });
  81  | 
  82  |   test('06 — ricerca treno 9511 mostra dettaglio con polling', async ({ page }) => {
  83  |     test.setTimeout(35000);
  84  |     await page.goto('/');
  85  |     await clickToggle(page, 'Treno');
  86  |     await page.getByPlaceholder('Cerca treno (es. 2107)').fill('9511');
  87  |     await page.getByPlaceholder('Cerca treno (es. 2107)').press('Enter');
  88  |     await expect(page.locator('.aa-overlay app-train-detail')).toBeVisible({ timeout: 15000 });
  89  |     await expect(page.locator('.overlay-route')).toContainText('MILANO CENTRALE');
  90  |     await expect(page.locator('.overlay-route')).toContainText('LECCE');
  91  |     // polling attivo o treno già arrivato: uno dei due casi è valido
  92  |     const hasCountdown = await page.locator('.countdown-indicator').count();
  93  |     if (hasCountdown === 0) {
> 94  |       await expect(page.getByText(/In orario|ritardo|anticipo/)).toBeVisible();
      |                                                                  ^ Error: expect(locator).toBeVisible() failed
  95  |     }
  96  |   });
  97  | 
  98  |   test('07 — refresh interval cambia durante polling attivo', async ({ page }) => {
  99  |     test.setTimeout(35000);
  100 |     await page.goto('/');
  101 |     await clickToggle(page, 'Treno');
  102 |     await page.getByPlaceholder('Cerca treno (es. 2107)').fill('9511');
  103 |     await page.getByPlaceholder('Cerca treno (es. 2107)').press('Enter');
  104 |     await expect(page.locator('.aa-overlay app-train-detail')).toBeVisible({ timeout: 15000 });
  105 | 
  106 |     await page.click('.settings-btn');
  107 |     const slider = page.locator('input[type="range"]');
  108 |     await slider.fill('45');
  109 |     await expect(page.locator('.settings-value')).toHaveText('45 secondi');
  110 |     await page.click('.settings-close');
  111 | 
  112 |     const stored = await page.evaluate(() =>
  113 |       JSON.parse(localStorage.getItem('trenow_settings') || '{}')
  114 |     );
  115 |     expect(stored.refreshInterval).toBe(45);
  116 |   });
  117 | 
  118 |   test('08 — Regione Lazio restituisce treni', async ({ page }) => {
  119 |     test.setTimeout(30000);
  120 |     await page.goto('/');
  121 |     await clickToggle(page, 'Regione');
  122 |     await page.selectOption('.regione-select', 'Lazio');
  123 |     const response = await page.waitForResponse(r =>
  124 |       r.url().includes('/api/treni-regione') && r.status() === 200,
  125 |       { timeout: 15000 }
  126 |     );
  127 |     const data = await response.json();
  128 |     expect(data.regione).toBe(5);
  129 |     expect(data.nomeRegione).toBe('Lazio');
  130 |     expect(data.treni.length).toBeGreaterThan(0);
  131 |     await expect(page.locator('.region-bar-label')).toContainText('Lazio');
  132 |   });
  133 | 
  134 |   test('09 — regioni diverse danno risultati diversi', async ({ page }) => {
  135 |     test.setTimeout(35000);
  136 |     await page.goto('/');
  137 |     await clickToggle(page, 'Regione');
  138 | 
  139 |     await page.selectOption('.regione-select', 'Lazio');
  140 |     const r1 = await page.waitForResponse(r =>
  141 |       r.url().includes('/api/treni-regione') && r.status() === 200,
  142 |       { timeout: 15000 }
  143 |     );
  144 |     const d1 = await r1.json();
  145 |     expect(d1.nomeRegione).toBe('Lazio');
  146 |     expect(d1.regione).toBe(5);
  147 | 
  148 |     await page.click('.region-bar-close');
  149 |     await page.waitForTimeout(500);
  150 |     await clickToggle(page, 'Regione');
  151 |     await page.waitForTimeout(300);
  152 | 
  153 |     await page.selectOption('.regione-select', 'Lombardia');
  154 |     const r2 = await page.waitForResponse(r =>
  155 |       r.url().includes('/api/treni-regione') && r.status() === 200,
  156 |       { timeout: 15000 }
  157 |     );
  158 |     const d2 = await r2.json();
  159 |     expect(d2.nomeRegione).toBe('Lombardia');
  160 |     expect(d2.regione).toBe(1);
  161 |     expect(d1.regione).not.toBe(d2.regione);
  162 |   });
  163 | 
  164 |   test('10 — Umbria ora seleziona regione 11 (Umbria)', async ({ page }) => {
  165 |     test.setTimeout(35000);
  166 |     await page.goto('/');
  167 |     await clickToggle(page, 'Regione');
  168 | 
  169 |     await page.selectOption('.regione-select', 'Marche');
  170 |     const r1 = await page.waitForResponse(r =>
  171 |       r.url().includes('/api/treni-regione') && r.status() === 200,
  172 |       { timeout: 15000 }
  173 |     );
  174 |     const d1 = await r1.json();
  175 |     expect(d1.regione).toBe(6);
  176 |     expect(d1.nomeRegione).toBe('Marche');
  177 | 
  178 |     await page.click('.region-bar-close');
  179 |     await page.waitForTimeout(300);
  180 |     await clickToggle(page, 'Regione');
  181 | 
  182 |     await page.selectOption('.regione-select', 'Umbria');
  183 |     const r2 = await page.waitForResponse(r =>
  184 |       r.url().includes('/api/treni-regione') && r.status() === 200,
  185 |       { timeout: 15000 }
  186 |     );
  187 |     const d2 = await r2.json();
  188 |     expect(d2.regione).toBe(11);
  189 |     expect(d2.nomeRegione).toBe('Umbria');
  190 |     expect(d1.regione).not.toBe(d2.regione);
  191 |   });
  192 | 
  193 |   test('11 — regioni duplicate ora hanno rfi unici (Valle d\'Aosta, Trentino)', async ({ page }) => {
  194 |     test.setTimeout(35000);
```