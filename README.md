# TreNow — Monitoraggio Treni in Tempo Reale

## 1. Panoramica Funzionale

**TreNow** è un'applicazione web per monitorare i treni in tempo reale in Italia su mappa interattiva, usando le API pubbliche di **Viaggiatreno** (RFI).

### Funzionalità

| Funzionalità | Descrizione |
|-------------|-------------|
| **Ricerca treni** | Ricerca per numero treno con autocompletamento |
| **Ricerca stazioni** | Ricerca stazioni con indicatori sulla mappa |
| **Partenze/Arrivi** | Tab partenze e arrivi per stazione |
| **Mappa interattiva** | OpenStreetMap via Leaflet, markers stazioni |
| **Percorso treno** | Tracciato verde (completato) e marrone (rimanente) |
| **Dettaglio treno** | Lista fermate con orari reali e ritardi |
| **Aggiornamento automatico** | Refresh configurabile 5–120 secondi |
| **Design responsive** | Mobile (bottom sheet) e Desktop (floating card) |

### Flusso utente

1. Ricerca un numero treno o clicca una stazione sulla mappa
2. Il pannello mostra i dettagli del treno/stazione
3. Il percorso viene tracciato sulla mappa con stato completato/rimanente
4. Refresh automatico con countdown

---

## 2. Architettura

```
BROWSER (Angular 19)
  ┌─────────┐   ┌────────────┐   ┌─────────────┐   ┌────────────┐
  │   Map   │   │   Search   │   │Train Detail │   │  Station   │
  │ Leaflet │   │ Component  │   │  Component  │   │   Panel    │
  └────┬────┘   └─────┬──────┘   └──────┬──────┘   └──────┬─────┘
       └──────────────┴──────────────────┴─────────────────┘
                              │
                     ┌────────┴────────┐
                     │  ApiService     │
                     └────────┬────────┘
                              │ HTTP
SERVER (PHP 8.x)              ▼
  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐
  │ stazioni │ │  cerca   │ │  treno   │ │partenze  │
  │  .php    │ │  .php    │ │  .php    │ │  .php    │
  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘
       └────────────┴────────────┴────────────┘
                     │
                     ▼
              ┌────────────┐     ┌────────────┐
              │ Viaggiatreno│     │  MariaDB   │
              │  API (ext)  │     │  (cache)   │
              └────────────┘     └────────────┘
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
│   │   │   ├── search/          # Ricerca stazione/treno
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
│   │   └── ping.php             # Health check
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
| `ping.php` | Health check DB |

### Logiche chiave

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

**Sticky Fermate**
- Intestazione "Fermate" fissa in alto nel pannello dettaglio treno
- Solo la lista fermate scorre (`overflow-y: auto`)

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

### Sicurezza

- `backend/src/config.php` in `.gitignore` (non tracciato)
- Template `config.php.dist` con placeholder per nuovi sviluppatori
- `deploy/` e `trenow-deploy.zip` esclusi dal repository
