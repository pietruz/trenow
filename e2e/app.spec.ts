import { test, expect, Page } from '@playwright/test';

async function clickResultItem(page: Page, text: string) {
  const el = page.locator('.result-item').filter({ hasText: text });
  await expect(el).toBeVisible({ timeout: 10000 });
  await el.evaluate(el => el.click());
}

async function clickToggle(page: Page, name: string) {
  const btn = page.getByRole('button', { name });
  // On mobile the toggle is inside the sidebar which may be closed
  const isMobile = await page.evaluate(() => window.innerWidth <= 768);
  if (isMobile) {
    // Open sidebar via FAB if needed
    const sidebar = page.locator('.sidebar');
    const hasOpen = await sidebar.evaluate(el => el.classList.contains('open'));
    if (!hasOpen) {
      await page.locator('.fab').click();
      await page.waitForTimeout(300);
    }
  }
  await btn.evaluate(el => el.click());
}

test.describe('TreNow — test funzionali', () => {

  test('01 — homepage si carica con mappa e toggle', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.header-title')).toHaveText('TreNow');
    const toggleButtons = page.locator('.toggle button');
    await expect(toggleButtons).toHaveCount(3);
    await expect(toggleButtons.nth(0)).toHaveText('Stazione');
    await expect(toggleButtons.nth(1)).toHaveText('Treno');
    await expect(toggleButtons.nth(2)).toHaveText('Regione');
    await expect(page.locator('.leaflet-container')).toBeVisible();
  });

  test('02 — apertura/chiusura impostazioni', async ({ page }) => {
    await page.goto('/');
    await page.click('.settings-btn');
    await expect(page.locator('.settings-modal')).toBeVisible();
    await expect(page.locator('text=Intervallo aggiornamento')).toBeVisible();
    await expect(page.locator('text=5s')).toBeVisible();
    await expect(page.locator('text=2 min')).toBeVisible();
    await page.click('.settings-close');
    await expect(page.locator('.settings-modal')).not.toBeVisible();
  });

  test('03 — cambio intervallo refresh via slider', async ({ page }) => {
    await page.goto('/');
    await page.click('.settings-btn');
    const slider = page.locator('input[type="range"]');
    await slider.fill('30');
    await expect(page.locator('.settings-value')).toHaveText('30 secondi');
    const stored = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('trenow_settings') || '{}')
    );
    expect(stored.refreshInterval).toBe(30);
    await page.click('.settings-close');
  });

  test('04 — ricerca stazione Roma Termini', async ({ page }) => {
    await page.goto('/');
    await page.getByPlaceholder('Nome stazione').fill('Roma');
    await page.getByPlaceholder('Nome stazione').press('Enter');
    await clickResultItem(page, 'ROMA TERMINI');
    await expect(page.locator('.station-panel')).toBeVisible();
    await expect(page.locator('text=Partenze')).toBeVisible();
    await expect(page.locator('text=Arrivi')).toBeVisible();
  });

  test('05 — cambio tab Arrivi in stazione', async ({ page }) => {
    await page.goto('/');
    await page.getByPlaceholder('Nome stazione').fill('Roma');
    await page.getByPlaceholder('Nome stazione').press('Enter');
    await clickResultItem(page, 'ROMA TERMINI');
    await expect(page.locator('.station-panel')).toBeVisible();
    await page.getByRole('button', { name: 'Arrivi' }).evaluate(el => el.click());
    await expect(page.getByRole('button', { name: 'Arrivi' })).toHaveAttribute('class', /active/);
  });

  test('06 — ricerca treno 9511 mostra dettaglio con polling', async ({ page }) => {
    test.setTimeout(35000);
    await page.goto('/');
    await clickToggle(page, 'Treno');
    await page.getByPlaceholder('Cerca treno (es. 2107)').fill('9511');
    await page.getByPlaceholder('Cerca treno (es. 2107)').press('Enter');
    await expect(page.locator('.aa-overlay app-train-detail')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('.overlay-route')).toContainText('MILANO CENTRALE');
    await expect(page.locator('.overlay-route')).toContainText('LECCE');
    // polling attivo o treno già arrivato: uno dei due casi è valido
    const hasCountdown = await page.locator('.countdown-indicator').count();
    if (hasCountdown === 0) {
      await expect(page.locator('.aa-overlay .ritardo')).toBeVisible();
    }
  });

  test('07 — refresh interval cambia durante polling attivo', async ({ page }) => {
    test.setTimeout(35000);
    await page.goto('/');
    await clickToggle(page, 'Treno');
    await page.getByPlaceholder('Cerca treno (es. 2107)').fill('9511');
    await page.getByPlaceholder('Cerca treno (es. 2107)').press('Enter');
    await expect(page.locator('.aa-overlay app-train-detail')).toBeVisible({ timeout: 15000 });

    await page.click('.settings-btn');
    const slider = page.locator('input[type="range"]');
    await slider.fill('45');
    await expect(page.locator('.settings-value')).toHaveText('45 secondi');
    await page.click('.settings-close');

    const stored = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('trenow_settings') || '{}')
    );
    expect(stored.refreshInterval).toBe(45);
  });

  test('08 — Regione Lazio restituisce treni', async ({ page }) => {
    test.setTimeout(30000);
    await page.goto('/');
    await clickToggle(page, 'Regione');
    await page.selectOption('.regione-select', 'Lazio');
    const response = await page.waitForResponse(r =>
      r.url().includes('/api/treni-regione') && r.status() === 200,
      { timeout: 15000 }
    );
    const data = await response.json();
    expect(data.regione).toBe(5);
    expect(data.nomeRegione).toBe('Lazio');
    expect(data.treni.length).toBeGreaterThan(0);
    await expect(page.locator('.region-bar-label')).toContainText('Lazio');
  });

  test('09 — regioni diverse danno risultati diversi', async ({ page }) => {
    test.setTimeout(35000);
    await page.goto('/');
    await clickToggle(page, 'Regione');

    await page.selectOption('.regione-select', 'Lazio');
    const r1 = await page.waitForResponse(r =>
      r.url().includes('/api/treni-regione') && r.status() === 200,
      { timeout: 15000 }
    );
    const d1 = await r1.json();
    expect(d1.nomeRegione).toBe('Lazio');
    expect(d1.regione).toBe(5);

    await page.click('.region-bar-close');
    await page.waitForTimeout(500);
    await clickToggle(page, 'Regione');
    await page.waitForTimeout(300);

    await page.selectOption('.regione-select', 'Lombardia');
    const r2 = await page.waitForResponse(r =>
      r.url().includes('/api/treni-regione') && r.status() === 200,
      { timeout: 15000 }
    );
    const d2 = await r2.json();
    expect(d2.nomeRegione).toBe('Lombardia');
    expect(d2.regione).toBe(1);
    expect(d1.regione).not.toBe(d2.regione);
  });

  test('10 — Umbria ora seleziona regione 11 (Umbria)', async ({ page }) => {
    test.setTimeout(35000);
    await page.goto('/');
    await clickToggle(page, 'Regione');

    await page.selectOption('.regione-select', 'Marche');
    const r1 = await page.waitForResponse(r =>
      r.url().includes('/api/treni-regione') && r.status() === 200,
      { timeout: 15000 }
    );
    const d1 = await r1.json();
    expect(d1.regione).toBe(6);
    expect(d1.nomeRegione).toBe('Marche');

    await page.click('.region-bar-close');
    await page.waitForTimeout(300);
    await clickToggle(page, 'Regione');

    await page.selectOption('.regione-select', 'Umbria');
    const r2 = await page.waitForResponse(r =>
      r.url().includes('/api/treni-regione') && r.status() === 200,
      { timeout: 15000 }
    );
    const d2 = await r2.json();
    expect(d2.regione).toBe(11);
    expect(d2.nomeRegione).toBe('Umbria');
    expect(d1.regione).not.toBe(d2.regione);
  });

  test('11 — regioni duplicate ora hanno rfi unici (Valle d\'Aosta, Trentino)', async ({ page }) => {
    test.setTimeout(35000);
    await page.goto('/');
    await clickToggle(page, 'Regione');

    await page.selectOption('.regione-select', "Valle d'Aosta");
    const r1 = await page.waitForResponse(r =>
      r.url().includes('/api/treni-regione') && r.status() === 200,
      { timeout: 15000 }
    );
    const d1 = await r1.json();
    expect(d1.regione).toBe(4);
    expect(d1.nomeRegione).toBe("Valle d'Aosta");

    await page.click('.region-bar-close');
    await page.waitForTimeout(300);
    await clickToggle(page, 'Regione');

    await page.selectOption('.regione-select', 'Trentino-Alto Adige');
    const r2 = await page.waitForResponse(r =>
      r.url().includes('/api/treni-regione') && r.status() === 200,
      { timeout: 15000 }
    );
    const d2 = await r2.json();
    expect(d2.regione).toBe(9);
    expect(d2.nomeRegione).toBe('Trentino-Alto Adige');
    expect(d1.regione).not.toBe(d2.regione);
  });

  test('12 — ricerca treno inesistente mostra dialog', async ({ page }) => {
    await page.goto('/');
    await clickToggle(page, 'Treno');
    await page.waitForTimeout(300);
    await page.getByPlaceholder('Cerca treno (es. 2107)').fill('99999999');
    const [dialog] = await Promise.all([
      page.waitForEvent('dialog', { timeout: 5000 }),
      page.getByPlaceholder('Cerca treno (es. 2107)').press('Enter')
    ]);
    expect(dialog.message()).toContain('non trovato');
    await dialog.accept();
  });

  test('13 — click su chiudi stazione torna alla home', async ({ page }) => {
    await page.goto('/');
    await page.getByPlaceholder('Nome stazione').fill('Roma');
    await page.getByPlaceholder('Nome stazione').press('Enter');
    await clickResultItem(page, 'ROMA TERMINI');
    await expect(page.locator('.station-panel')).toBeVisible();
    await page.locator('.reset-btn').evaluate(el => el.click());
    await expect(page.locator('.station-panel')).not.toBeVisible();
  });

  test('14 — cambio toggle Stazione→Treno→Regione', async ({ page }) => {
    await page.goto('/');

    await clickToggle(page, 'Treno');
    await expect(page.getByPlaceholder('Cerca treno (es. 2107)')).toBeVisible();

    await clickToggle(page, 'Stazione');
    await expect(page.getByPlaceholder('Nome stazione')).toBeVisible();

    await clickToggle(page, 'Regione');
    await expect(page.locator('.regione-select')).toBeVisible();
  });

  test('15 — layout mobile: stazione apre sidebar', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await page.getByPlaceholder('Nome stazione').fill('Roma');
    await page.getByPlaceholder('Nome stazione').press('Enter');
    await clickResultItem(page, 'ROMA TERMINI');
    await expect(page.locator('.station-panel')).toBeVisible();
    const box = await page.locator('.sidebar').boundingBox();
    expect(box).not.toBeNull();
    if (box) {
      expect(box.width).toBeGreaterThan(300);
    }
  });

  test('16 — tracciato bicolore completato/rimanente', async ({ page }) => {
    test.setTimeout(30000);
    await page.goto('/');
    await clickToggle(page, 'Treno');
    await page.getByPlaceholder('Cerca treno (es. 2107)').fill('9511');
    await page.getByPlaceholder('Cerca treno (es. 2107)').press('Enter');
    await expect(page.locator('.aa-overlay app-train-detail')).toBeVisible({ timeout: 15000 });

    const colors = await page.evaluate(() => {
      const pane = document.querySelector('.leaflet-overlay-pane');
      if (!pane) return null;
      const paths = pane.querySelectorAll('path');
      const found: string[] = [];
      paths.forEach(p => {
        const stroke = p.getAttribute('stroke');
        if (stroke) found.push(stroke);
      });
      return found;
    });
    expect(colors).not.toBeNull();
    expect(colors!.some(c => c === '#059669' || c === '#0a0')).toBe(true);
  });

  test('17 — regione mode mostra marker treni animati', async ({ page }) => {
    test.setTimeout(30000);
    await page.goto('/');
    await clickToggle(page, 'Regione');
    await page.selectOption('.regione-select', 'Lazio');
    const resp = await page.waitForResponse(r =>
      r.url().includes('/api/treni-regione') && r.status() === 200,
      { timeout: 15000 }
    );
    const data = await resp.json();
    await expect(async () => {
      const count = await page.locator('.train-marker').count();
      expect(count).toBeGreaterThan(0);
    }).toPass({ timeout: 10000 });
  });
});
