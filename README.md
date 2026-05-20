# TreNow — Monitoraggio Treni in Tempo Reale

<img width="1600" height="900" alt="image" src="https://github.com/user-attachments/assets/54bfc61b-ed01-45f9-bf41-0762b5761c06" />


## 1. Panoramica Funzionale

**TreNow** è un'applicazione web per monitorare i treni in tempo reale in Italia su mappa interattiva, usando le API pubbliche di **Viaggiatreno** (RFI).

### Funzionalità

| Funzionalità | Descrizione |
|-------------|-------------|
| **Ricerca treni** | Ricerca per numero treno con autocompletamento |
| **Ricerca stazioni** | Ricerca stazioni con indicatori sulla mappa |
| **Filtro regione** | Seleziona una regione per vedere tutti i treni attivi |
| **Tracciato treno** | Percorso completo con marker animato |
| **Partenze/Arrivi** | Tab partenze e arrivi per stazione |
| **Mappa interattiva** | OpenStreetMap via Leaflet, markers stazioni |
| **Percorso treno** | Tracciato verde (completato) e marrone (rimanente) |
| **Dettaglio treno** | Lista fermate con orari reali e ritardi |
| **Animazione marker** | Posizione treno aggiornata ogni 1s su stima temporale |
| **Aggiornamento automatico** | Refresh configurabile 5–120 secondi |
| **Design responsive** | Mobile (bottom sheet) e Desktop (floating card) |

### Flusso utente

1. **Ricerca treno/stazione**: cerca un numero treno o clicca una stazione
2. **Esplora regione**: seleziona una regione dal menu → tutti i treni attivi appaiono sulla mappa con marker colorati per tipo
3. **Clicca un treno**: apre il dettaglio completo con tracciato bicolore
4. **Reset**: il pulsante sulla barra regione o il toggle stazione/treno/regione riportano alla ricerca

---

## 2. Architettura

```
BROWSER (Angular 19)
  ┌─────────┐  ┌───────┐  ┌───────────┐  ┌────────────┐  ┌──────────┐
  │   Map   │  │ Search│  │Regione    │  │Train Detail│  │  Station │
  │ Leaflet │  │       │  │(markers)  │  │  Component │  │   Panel  │
  └────┬────┘  └───┬───┘  └─────┬─────┘  └──────┬──────┘  └────┬─────┘
       └───────────┴────────────┴────────────────┴──────────────┘
                              │
                     ┌────────┴────────┐
                     │  ApiService     │
                     └────────┬────────┘
                              │ HTTP
SERVER (PHP 8.x)              ▼
  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────┐
  │ stazioni │ │  cerca   │ │  treno   │ │partenze  │ │treni-regione │
  │  .php    │ │  .php    │ │  .php    │ │  .php    │ │   .php       │
  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘ └──────┬───────┘
       └────────────┴────────────┴────────────┘              │
                              │                              ▼
                              ▼                      ┌──────────────┐
                      ┌────────────┐                 │ Tabella      │
                      │ Viaggiatreno│                │ stazioni +   │
                      │  API (ext)  │                │ treni_cache  │
                      └────────────┘                 └──────────────┘
```

### Stack

| Layer | Tecnologia |
|-------|------------|
| Frontend | Angular 19, Leaflet 1.9, TypeScript |
| Backend | PHP 8.x (nativo, no framework) |
| Database | MariaDB |
| Dev server | Docker (PHP-FPM + Nginx + MariaDB) |
| Produzione | cPanel (Apache + MariaDB + PHP) |
| Mappe | OpenStreetMap (tile gratuiti) |
| API esterna | Viaggiatreno (RFI) |

---

## 3. Dettagli Tecnici

### Struttura directory

```
trenow/
├── frontend/                    # Angular 19
│   ├── src/app/
│   │   ├── components/
│   │   │   ├── search/          # Ricerca stazione/treno/regione
│   │   │   ├── train-detail/    # Dettaglio treno + fermate
│   │   │   └── station-panel/   # Partenze/arrivi stazione
│   │   ├── services/
│   │   │   └── api.service.ts   # HTTP verso backend PHP
│   │   ├── pipes/
│   │   │   └── tipo-treno.pipe.ts  # "R" → "Regionale", etc.
│   │   ├── models/
│   │   │   ├── stazione.ts
│   │   │   └── treno.ts
│   │   ├── app.component.{ts,html,css}
│   │   └── app.config.ts
│   ├── public/
│   │   └── favicon.svg
│   └── package.json
│
├── backend/                     # PHP API
│   ├── src/
│   │   ├── config.php           # DB + helper (non tracciato)
│   │   ├── config.php.dist      # Template placeholder
│   │   ├── treno.php            # GET /treno.php?num=&orig=
│   │   ├── stazioni.php         # GET /stazioni.php
│   │   ├── cerca.php            # GET /cerca.php?q=
│   │   ├── partenze.php         # GET /partenze.php?stazione=
│   │   ├── arrivi.php           # GET /arrivi.php?stazione=
│   │   ├── treni-regione.php    # GET /treni-regione.php?regione=N
│   │   └── ping.php             # Health check
│   ├── tests/
│   │   └── treni-regione.test.php
│   ├── init.sql                 # Schema DB
│   ├── Dockerfile
│   └── nginx.conf
│
├── docker-compose.yml           # Ambiente sviluppo locale
└── README.md
```

### API Backend

| Endpoint | Descrizione |
|----------|-------------|
| `stazioni.php` | Lista stazioni (cache DB + Viaggiatreno) |
| `cerca.php?q=` | Ricerca stazioni per nome |
| `treno.php?num=&orig=&data=` | Dettaglio treno (fermate, orari, ritardi) |
| `partenze.php?stazione=` | Prossime partenze |
| `arrivi.php?stazione=` | Prossimi arrivi |
| `treni-regione.php?regione=N` | Treni attivi in una regione (hub station) |
| `ping.php` | Health check DB |

### Filtro Regione

L'endpoint `treni-regione.php` accetta `?regione=N` (1-22, compartimenti RFI) e:

1. Usa una **mappa statica** di stazioni hub regionali (78 stazioni per 20 regioni)
2. Per ogni hub, interroga in parallelo (`curl_multi`) sia `/partenze` che `/arrivi`
3. Deduplica per `numeroTreno-codOrigine`
4. Filtra treni già arrivati, non partiti o annullati
5. Cache 2 minuti su tabella `treni_cache`

### Logiche chiave

**Animazione marker regione (1/s)**
- Posizione calcolata per segmento tra due fermate consecutive
- `progress = (now - (partenza_teorica + ritardo)) / (arrivo_teorico - partenza_teorica)`
- Se `stazioneUltimoRilevamento` non è nella lista fermate, recupera coordinate da `stazioni[]` e calcola posizione geografica intermedia
- Interpolazione lineare lat/lon tra le due fermate

**Colori marker per tipo treno**
- REG (Regionale) → verde `#16a34a`
- FR (Frecciarossa) → rosso `#dc2626`
- IC (InterCity) → grigio `#6b7280`
- ICN (InterCityNotte) → blu `#1e40af`
- Altri → palette dedicata (un colore per tipo)

**Icona marker**
- SVG con badge etichetta `compNumeroTreno`
- Colore testo automatico (bianco/scuro) in base alla luminanza dello sfondo

**Percorso treno (Approccio C)**
- Posizione primaria: `stazioneUltimoRilevamento`
- Fallback: `partenzaReale` / `arrivoReale` delle fermate
- Tracciato verde: fermate completate; marrone: rimanenti
- Marker evidenzia ultimo rilevamento

**Tipo treno**
- Pipe `tipoTrenoLabel` con mappa statica (R→Regionale, FR→Frecciarossa, EC→Eurocity, I→Intercity, etc.)
- Catena fallback: `categoriaDescrizione → (categoria | pipe : compNumeroTreno) → (tipoTreno | pipe)`

**Overlay desktop (Android Auto style)**
- Card floating fissa: `left: 16px; bottom: 16px; width: 380px`
- Z-index gestito per sovrapposizione mappa
- Click sull'overlay o sul contenuto chiude il dettaglio

**Offset mappa**
- Quando l'overlay è visibile, `fitBounds` usa `paddingTopLeft: [400, 0]` per centrare la mappa

**Responsive**
- Mobile: bottom sheet 70dvh, drag handle, FAB toggle, overlay sfondo
- Desktop: floating card con animazione `aaSlideUp`

**Refresh automatico**
- Countdown circolare SVG (14px) nel train-overlay
- Intervallo configurabile 5–120 secondi, persistito in `localStorage`

### Quick Start (sviluppo locale)

```bash
# Backend (Docker)
docker compose up -d

# Frontend (Angular dev server)
cd frontend
npm install
ng serve
```

### Deploy (cPanel)

```bash
cd frontend
ng build --base-href=/trenow/
# Copiare frontend/dist/browser/* in /trenow/
# Copiare backend/src/*.php in /trenow/api/
# Importare backend/init.sql via phpMyAdmin
# Configurare DB_USER / DB_PASS in config.php sul server
```

### Test

```bash
php backend/tests/treni-regione.test.php
```

### Sicurezza

- `backend/src/config.php` in `.gitignore` (non tracciato)
- Template `config.php.dist` con placeholder per nuovi sviluppatori
- `deploy/` e `trenow-deploy.zip` esclusi dal repository
