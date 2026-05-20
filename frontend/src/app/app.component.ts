import { Component, AfterViewInit, signal, viewChild, ElementRef, OnDestroy, HostListener } from '@angular/core';
import { SearchComponent } from './components/search/search.component';
import { TrainDetailComponent } from './components/train-detail/train-detail.component';
import { StationPanelComponent } from './components/station-panel/station-panel.component';
import { ApiService } from './services/api.service';
import { Stazione, CercaStazione } from './models/stazione';
import { DettaglioTreno, TrenoRegione, Fermata } from './models/treno';
import { TipoTrenoLabelPipe } from './pipes/tipo-treno.pipe';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import * as L from 'leaflet';

const TRAIN_COLORS = [
  '#e41a1c', '#377eb8', '#4daf4a', '#984ea3', '#ff7f00',
  '#ffff33', '#a65628', '#f781bf', '#999999', '#66c2a5',
  '#fc8d62', '#8da0cb', '#e78ac3', '#a6d854', '#ffd92f',
  '#e5c494', '#b3b3b3', '#8dd3c7', '#ffffb3', '#bebada',
];

interface TrenoAnimato {
  marker: L.Marker;
  partenza: TrenoRegione;
  dettaglio: DettaglioTreno;
  fermate: Fermata[];
  colore: string;
  ultimoRilevIdx: number;
  ultimoRilevTime: number;
}

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [SearchComponent, TrainDetailComponent, StationPanelComponent, TipoTrenoLabelPipe],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css',
})
export class AppComponent implements AfterViewInit, OnDestroy {
  mapContainer = viewChild.required<ElementRef<HTMLDivElement>>('mapContainer');
  searchComp = viewChild<SearchComponent>('searchComp');

  selectedTrain = signal<DettaglioTreno | null>(null);
  selectedStation = signal<CercaStazione | null>(null);
  refreshCountdown = signal(0);
  countdownOffset = signal(0);
  sidebarOpen = signal(false);
  isMobile = signal(false);
  isDragging = signal(false);
  dragOffset = signal(0);
  showSearch = signal(true);
  settings = signal(this.loadSettings());
  showSettings = signal(false);
  regionFilterActive = signal(false);
  regionName = signal('');

  private get overlayPadding(): [number, number] {
    return !this.isMobile() && (this.showSearch() || this.selectedStation() || this.selectedTrain())
      ? [400, 0]
      : [0, 0];
  }

  private loadSettings(): { refreshInterval: number } {
    try {
      const stored = localStorage.getItem('trenow_settings');
      if (stored) return JSON.parse(stored);
    } catch {}
    return { refreshInterval: 10 };
  }

  private saveSettings(s: { refreshInterval: number }) {
    localStorage.setItem('trenow_settings', JSON.stringify(s));
  }

  updateRefreshInterval(event: Event) {
    const val = Number((event.target as HTMLInputElement).value);
    const s = { refreshInterval: val };
    this.settings.set(s);
    this.saveSettings(s);
  }

  private map!: L.Map;
  private stazioniLayer!: L.LayerGroup;
  private completedPath!: L.Polyline | null;
  private remainingPath!: L.Polyline | null;
  private markersLayer!: L.LayerGroup;
  private stazioni: Stazione[] = [];
  private refreshInterval: ReturnType<typeof setInterval> | null = null;
  private countdownInterval: ReturnType<typeof setInterval> | null = null;
  private lastTrainQuery: { num: string; orig: string; data?: string } | null = null;
  private lastValidRilevamentoCoords: [number, number] | null = null;
  private totalCoords = 0;
  private touchStartY = 0;
  private touchStartPct = 0;
  private savedMapCenter: L.LatLng | null = null;
  private savedMapZoom: number | null = null;
  /* regione */
  private treniRegioneLayer!: L.LayerGroup;
  private treniAnimati: TrenoAnimato[] = [];
  private animInterval: ReturnType<typeof setInterval> | null = null;
  private regioneRefreshInterval: ReturnType<typeof setInterval> | null = null;
  private regioneRfi = 0;

  constructor(private api: ApiService) {
    this.checkScreenSize();
  }

  ngAfterViewInit() {
    this.initMap();
    this.loadStazioni();
  }

  ngOnDestroy() {
    this.stopRefresh();
    this.stopAnimazione();
  }

  @HostListener('window:resize')
  private checkScreenSize() {
    this.isMobile.set(window.innerWidth <= 768);
    if (!this.isMobile()) {
      this.sidebarOpen.set(true);
    }
  }

  toggleSidebar() {
    this.sidebarOpen.update(v => !v);
  }

  showTrainSearch() {
    this.showSearch.set(true);
  }

  openTrainDetail() {
    this.showSearch.set(false);
  }

  closeSidebarMobile() {
    if (this.isMobile()) {
      this.sidebarOpen.set(false);
    }
  }

  onTouchStart(e: TouchEvent) {
    if (!this.isMobile()) return;
    this.touchStartY = e.touches[0].clientY;
    this.touchStartPct = this.sidebarOpen() ? 0 : 100;
    this.isDragging.set(true);
    this.dragOffset.set(this.touchStartPct);
  }

  onTouchMove(e: TouchEvent) {
    if (!this.isDragging()) return;
    const deltaY = e.touches[0].clientY - this.touchStartY;
    const sidebarH = window.innerHeight * 0.7;
    const pctDelta = (deltaY / sidebarH) * 100;
    const newOffset = Math.max(0, Math.min(100, this.touchStartPct + pctDelta));
    this.dragOffset.set(newOffset);
  }

  onTouchEnd() {
    if (!this.isDragging()) return;
    this.isDragging.set(false);
    this.sidebarOpen.set(this.dragOffset() < 40);
  }

  private initMap() {
    this.map = L.map(this.mapContainer().nativeElement, {
      center: [41.9, 12.5],
      zoom: 6,
      zoomControl: false,
    });

    L.control.zoom({ position: this.isMobile() ? 'bottomleft' : 'bottomright' }).addTo(this.map);

    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(this.map);

    this.markersLayer = L.layerGroup().addTo(this.map);
    this.stazioniLayer = L.layerGroup();
    this.treniRegioneLayer = L.layerGroup();

    this.requestGeolocation();
  }

  private requestGeolocation() {
    if (!navigator.geolocation) return;

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude: lat, longitude: lon } = pos.coords;
        const latDelta = 0.45;
        const lonDelta = 0.45 / Math.cos(lat * Math.PI / 180);
        const bounds = L.latLngBounds(
          [lat - latDelta, lon - lonDelta],
          [lat + latDelta, lon + lonDelta]
        );
        this.map.fitBounds(bounds, { paddingTopLeft: this.overlayPadding, paddingBottomRight: [20, 20], maxZoom: 12, animate: true });
      },
      () => {},
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 }
    );
  }

  private loadStazioni() {
    this.api.getStazioni().subscribe({
      next: (stazioni) => {
        this.stazioni = stazioni;
        this.showStazioni(stazioni);
      }
    });
  }

  private showStazioni(stazioni: Stazione[]) {
    this.stazioniLayer.clearLayers();

    for (const s of stazioni) {
      if (!s.lat || !s.lon) continue;
      const r = this.isMobile() ? 8 : 5;
      const marker = L.circleMarker([s.lat, s.lon], {
        radius: r,
        color: '#2563eb',
        fillColor: '#2563eb',
        fillOpacity: 0.8,
        weight: 1,
      });

      marker.on('click', () => {
        this.savedMapCenter = this.map.getCenter();
        this.savedMapZoom = this.map.getZoom();
        this.map.fitBounds(L.latLngBounds([s.lat, s.lon], [s.lat, s.lon]), { paddingTopLeft: this.overlayPadding, paddingBottomRight: [0, 0], maxZoom: 14, animate: true });
        this.selectedTrain.set(null);
        this.showSearch.set(false);
        this.selectedStation.set({
          nomeLungo: s.nome,
          nomeBreve: s.nome_breve,
          label: null,
          id: s.id
        });
        if (this.isMobile()) {
          this.sidebarOpen.set(true);
        }
        if (!this.map.hasLayer(this.stazioniLayer)) {
          this.stazioniLayer.addTo(this.map);
        }
      });

      this.stazioniLayer.addLayer(marker);
    }

    this.stazioniLayer.addTo(this.map);
  }

  onTrainSelected(treno: DettaglioTreno) {
    this.selectedStation.set(null);
    this.selectedTrain.set(treno);
    this.showSearch.set(false);
    if (this.isMobile()) {
      this.sidebarOpen.set(false);
    }

    if (this.regionFilterActive()) {
      this.stopAnimazione();
      this.treniAnimati = [];
      this.treniRegioneLayer.clearLayers();
      if (this.map.hasLayer(this.treniRegioneLayer)) this.treniRegioneLayer.remove();
      this.regionFilterActive.set(false);
      this.regionName.set('');
      this.regioneRfi = 0;
      this.searchComp()?.reset();
    }

    const lastPassed = this.showTrainPath(treno);
    this.stazioniLayer.remove();

    const isCancelled = treno.provvedimento !== 0 ||
      (!!treno.subTitle && treno.subTitle.toLowerCase().includes('cancellat'));

    if (isCancelled || (this.totalCoords > 0 && lastPassed >= this.totalCoords - 1)) {
      this.stopRefresh();
    } else {
      this.startRefresh(treno);
    }
  }

  onStationSelected(stazione: CercaStazione) {
    this.stopRefresh();
    this.selectedTrain.set(null);
    this.selectedStation.set(stazione);
    this.showSearch.set(false);
    this.flyToStation(stazione.id);
    if (!this.map.hasLayer(this.stazioniLayer)) {
      this.stazioniLayer.addTo(this.map);
    }
  }

  onRegionSelected(rfi: number) {
    this.stopRefresh();
    this.stopAnimazione();
    this.resetAllInner();
    this.regioneRfi = rfi;

    const regioneCenters: Record<number, [number, number]> = {
      1: [45.5, 9.5],
      2: [44.4, 8.9],
      3: [45.0, 7.5],
      4: [45.7, 7.3],
      5: [41.9, 12.5],
      6: [43.5, 13.5],
      7: [41.5, 14.5],
      8: [44.5, 11.0],
      9: [46.2, 11.2],
      10: [46.0, 13.0],
      11: [43.5, 13.5],
      12: [45.5, 12.0],
      13: [43.5, 11.0],
      14: [37.5, 14.0],
      15: [40.5, 16.0],
      16: [41.0, 16.5],
      17: [38.5, 16.5],
      18: [40.8, 14.5],
      19: [42.3, 13.8],
      20: [40.0, 9.0],
      21: [46.5, 11.3],
      22: [46.9, 11.4],
    };
    const c = regioneCenters[rfi];
    if (c) {
      this.map.fitBounds(L.latLngBounds(c, c), { maxZoom: 9, animate: true });
    }

    this.api.getTreniRegione(rfi, 40).subscribe({
      next: (res) => {
        this.regionName.set(res.nomeRegione);
        this.regionFilterActive.set(true);
        this.showSearch.set(false);

        this.stazioniLayer.remove();
        this.markersLayer.remove();
        this.treniRegioneLayer.clearLayers();
        if (this.completedPath) { this.completedPath.remove(); this.completedPath = null; }
        if (this.remainingPath) { this.remainingPath.remove(); this.remainingPath = null; }

        const sliced = res.treni.slice(0, 30);
        const obs = sliced.map(t =>
          this.api.getAndamentoTreno(String(t.numeroTreno), t.codOrigine).pipe(
            catchError(() => of(null))
          )
        );

        if (obs.length === 0) return;

        forkJoin(obs).subscribe({
          next: (details) => {
            const valid = details.map((d, i) => d ? { dett: d as DettaglioTreno, treg: sliced[i] } : null)
              .filter((x): x is { dett: DettaglioTreno; treg: TrenoRegione } => x !== null && !!x.dett.fermate?.length);
            this.disegnaTracciatiRegione(valid.map(x => x.dett), valid.map(x => x.treg));
          }
        });
      },
      error: () => alert('Errore nel caricamento dei treni della regione')
    });
  }

  private disegnaTracciatiRegione(dettagli: DettaglioTreno[], treniReg: TrenoRegione[]) {
    this.treniRegioneLayer.clearLayers();
    this.treniAnimati = [];
    const bounds = L.latLngBounds([]);

    for (let i = 0; i < dettagli.length; i++) {
      const dett = dettagli[i];
      const treg = treniReg[i];

      const fermate = dett.fermate.filter(f => f.actualFermataType !== 3 && f.lat && f.lon);
      if (fermate.length < 2) continue;

      const colore = TRAIN_COLORS[i % TRAIN_COLORS.length];

      const searchName = (dett.stazioneUltimoRilevamento || '').toLowerCase().trim();
      let ultimoRilevIdx = searchName ? fermate.findIndex(
        f => f.stazione.toLowerCase().trim() === searchName
      ) : -1;
      if (ultimoRilevIdx >= fermate.length - 1) ultimoRilevIdx = -1;

      let posizionePersonalizzata: [number, number] | null = null;
      if (ultimoRilevIdx < 0 && searchName && treg.ultimoRilev) {
        for (let j = 0; j < fermate.length; j++) {
          const t = (fermate[j].partenza_teorica || fermate[j].arrivo_teorico || 0);
          if (t > 0 && (t + (treg.ritardo || 0) * 60000) <= treg.ultimoRilev) {
            ultimoRilevIdx = j;
          }
        }
        if (ultimoRilevIdx >= 0) {
          const staz = this.stazioni.find(s =>
            s.nome.toLowerCase().trim() === searchName ||
            (s.nome_breve && s.nome_breve.toLowerCase().trim() === searchName)
          );
          if (staz && staz.lat && staz.lon) {
            posizionePersonalizzata = [Number(staz.lat), Number(staz.lon)];
          }
        }
      }

      const ultimoRilevTime = treg.ultimoRilev || 0;

      const posIniziale: [number, number] = posizionePersonalizzata ?? (
        ultimoRilevIdx >= 0 && fermate[ultimoRilevIdx]?.lat
          ? [fermate[ultimoRilevIdx].lat!, fermate[ultimoRilevIdx].lon!]
          : [fermate[0].lat!, fermate[0].lon!]
      );

      const marker = L.marker(posIniziale, {
        icon: this.createTrainIcon(colore, treg.compNumeroTreno || String(treg.numeroTreno)),
        zIndexOffset: 1000,
      });
      marker.bindPopup(this.popupTreno(treg));
      marker.on('click', () => {
        this.onTrainSelected(dett);
      });
      marker.addTo(this.treniRegioneLayer);

      this.treniAnimati.push({
        marker,
        partenza: treg,
        dettaglio: dett,
        fermate,
        colore,
        ultimoRilevIdx,
        ultimoRilevTime,
      });

      if (ultimoRilevIdx >= 0) {
        bounds.extend(posIniziale);
      }
    }

    this.treniRegioneLayer.addTo(this.map);

    if (bounds.isValid()) {
      this.map.fitBounds(bounds, {
        paddingTopLeft: this.overlayPadding,
        paddingBottomRight: [50, 50],
        animate: true,
        maxZoom: 10,
      });
    }

    this.avviaAnimazione();
    this.startRegioneRefresh();
  }

  private createTrainIcon(colore: string, label: string): L.DivIcon {
    return L.divIcon({
      className: 'train-marker',
      html: `<div style="display:flex;flex-direction:column;align-items:center;width:80px;line-height:1;gap:1px;">
        <span style="font-size:8px;font-weight:700;color:#fff;background:${colore};padding:1px 3px;border-radius:3px;white-space:nowrap;">${label}</span>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="3" y="5" width="18" height="13" rx="3" fill="${colore}" stroke="#fff" stroke-width="1.5"/>
          <circle cx="8" cy="19" r="3" fill="#333" stroke="#fff" stroke-width="1"/>
          <circle cx="16" cy="19" r="3" fill="#333" stroke="#fff" stroke-width="1"/>
          <rect x="8" y="8" width="8" height="4" rx="1" fill="#fff" opacity="0.6"/>
        </svg>
      </div>`,
      iconSize: [80, 30],
      iconAnchor: [40, 15],
    });
  }

  private popupTreno(t: TrenoRegione): string {
    const ritardo = t.ritardo > 0 ? `Ritardo: ${t.ritardo} min` : 'In orario';
    return `<b>${t.categoria} ${t.numeroTreno}</b><br/>${t.origine || ''} → ${t.destinazione || ''}<br/>${ritardo}`;
  }

  private aggiornaPosizioneTreno(t: TrenoAnimato, lat: number, lon: number) {
    t.marker.setLatLng([lat, lon]);
  }

  private avviaAnimazione() {
    this.animInterval = setInterval(() => {
      const now = Date.now();
      for (const t of this.treniAnimati) {
        const p = t.partenza;
        if (p.nonPartito || p.arrivato) continue;

        if (t.ultimoRilevIdx >= 0 && t.ultimoRilevIdx < t.fermate.length - 1 && t.ultimoRilevTime > 0) {
          const fRilev = t.fermate[t.ultimoRilevIdx];
          const fNext = t.fermate[t.ultimoRilevIdx + 1];

          if (!fRilev?.lat || !fRilev?.lon || !fNext?.lat || !fNext?.lon) continue;

          const partenzaFermata = fRilev.partenza_teorica || fRilev.arrivo_teorico;
          const arrivoFermata = fNext.arrivo_teorico || fNext.partenza_teorica;
          if (!partenzaFermata || !arrivoFermata) continue;

          const partenzaEff = partenzaFermata + p.ritardo * 60000;
          const arrivoEff = arrivoFermata + p.ritardo * 60000;
          const durata = arrivoEff - partenzaEff;

          if (durata <= 0 || now <= partenzaEff) {
            this.aggiornaPosizioneTreno(t, fRilev.lat!, fRilev.lon!);
            continue;
          }

          const progress = Math.min(1, (now - partenzaEff) / durata);

          if (progress >= 1) {
            this.aggiornaPosizioneTreno(t, fNext.lat!, fNext.lon!);
            if (t.ultimoRilevIdx + 1 < t.fermate.length - 1) {
              t.ultimoRilevIdx++;
            }
            continue;
          }

          const lat = fRilev.lat! + (fNext.lat! - fRilev.lat!) * progress;
          const lon = fRilev.lon! + (fNext.lon! - fRilev.lon!) * progress;
          this.aggiornaPosizioneTreno(t, lat, lon);
        } else {
          const partenzaEff = (p.orarioPartenza || now) + p.ritardo * 60000;
          const arrivoEff = (p.orarioArrivo || now) + p.ritardo * 60000;
          const durata = arrivoEff - partenzaEff;
          if (durata <= 0) continue;

          const progress = (now - partenzaEff) / durata;
          if (progress <= 0) continue;

          const totalSegments = t.fermate.length - 1;
          if (totalSegments <= 0) continue;

          if (progress >= 1) {
            const last = t.fermate[t.fermate.length - 1];
            this.aggiornaPosizioneTreno(t, last.lat!, last.lon!);
            continue;
          }

          const segmentFloat = progress * totalSegments;
          const segmentIdx = Math.min(Math.floor(segmentFloat), totalSegments - 1);
          const localProgress = segmentFloat - segmentIdx;

          const f1 = t.fermate[segmentIdx];
          const f2 = t.fermate[segmentIdx + 1];
          if (!f1 || !f2 || !f1.lat || !f2.lat) continue;

          const lat = f1.lat! + (f2.lat! - f1.lat!) * localProgress;
          const lon = f1.lon! + (f2.lon! - f1.lon!) * localProgress;
          this.aggiornaPosizioneTreno(t, lat, lon);
        }
      }
    }, 1000);
  }

  private stopAnimazione() {
    if (this.animInterval) {
      clearInterval(this.animInterval);
      this.animInterval = null;
    }
    if (this.regioneRefreshInterval) {
      clearInterval(this.regioneRefreshInterval);
      this.regioneRefreshInterval = null;
    }
  }

  private startRegioneRefresh() {
    this.stopRegioneRefresh();
    const interval = this.settings().refreshInterval;
    this.regioneRefreshInterval = setInterval(() => {
      this.refreshRegioneTrains();
    }, interval * 1000);
  }

  private stopRegioneRefresh() {
    if (this.regioneRefreshInterval) {
      clearInterval(this.regioneRefreshInterval);
      this.regioneRefreshInterval = null;
    }
  }

  private refreshRegioneTrains() {
    this.api.getTreniRegione(this.regioneRfi, 40).subscribe({
      next: (res) => {
        const sliced = res.treni.slice(0, 30);
        const obs = sliced.map(t =>
          this.api.getAndamentoTreno(String(t.numeroTreno), t.codOrigine).pipe(
            catchError(() => of(null))
          )
        );
        if (obs.length === 0) return;
        forkJoin(obs).subscribe({
          next: (details) => {
            const valid = details.map((d, i) => d ? { dett: d as DettaglioTreno, treg: sliced[i] } : null)
              .filter((x): x is { dett: DettaglioTreno; treg: TrenoRegione } => x !== null && !!x.dett.fermate?.length);
            this.aggiornaTracciatiRegione(valid.map(x => x.dett), valid.map(x => x.treg));
          }
        });
      }
    });
  }

  private aggiornaTracciatiRegione(dettagli: DettaglioTreno[], treniReg: TrenoRegione[]) {
    const seenKeys = new Set<string>();

    for (let i = 0; i < dettagli.length; i++) {
      const dett = dettagli[i];
      const treg = treniReg[i];
      const key = `${treg.numeroTreno}-${treg.codOrigine}`;
      seenKeys.add(key);

      const existing = this.treniAnimati.find(
        t => t.dettaglio.numeroTreno === dett.numeroTreno
      );

      if (existing) {
        existing.partenza = treg;
        existing.dettaglio = dett;

        const fermate = dett.fermate.filter(f => f.actualFermataType !== 3 && f.lat && f.lon);
        existing.fermate = fermate;

        const searchName = (dett.stazioneUltimoRilevamento || '').toLowerCase().trim();
        const newIdx = searchName ? fermate.findIndex(
          f => f.stazione.toLowerCase().trim() === searchName
        ) : -1;

        if (newIdx >= 0 && existing.ultimoRilevIdx >= 0 && newIdx !== existing.ultimoRilevIdx) {
          existing.ultimoRilevIdx = newIdx;
          existing.ultimoRilevTime = treg.ultimoRilev || 0;
          if (fermate[newIdx]?.lat) {
            this.aggiornaPosizioneTreno(existing,
              fermate[newIdx].lat!,
              fermate[newIdx].lon!
            );
          }
        }
      }
    }

    for (let i = this.treniAnimati.length - 1; i >= 0; i--) {
      const t = this.treniAnimati[i];
      const key = `${t.partenza.numeroTreno}-${t.partenza.codOrigine}`;
      if (!seenKeys.has(key)) {
        t.marker.remove();
        this.treniAnimati.splice(i, 1);
      }
    }
  }

  resetRegion() {
    this.stopAnimazione();
    this.regionFilterActive.set(false);
    this.regionName.set('');
    this.regioneRfi = 0;
    this.treniAnimati = [];
    this.treniRegioneLayer.clearLayers();
    if (this.map.hasLayer(this.treniRegioneLayer)) this.treniRegioneLayer.remove();
    this.showSearch.set(true);
    this.selectedTrain.set(null);
    this.selectedStation.set(null);
    this.searchComp()?.reset();
    if (!this.map.hasLayer(this.stazioniLayer)) {
      this.stazioniLayer.addTo(this.map);
    }
  }

  private resetAllInner() {
    this.stopRefresh();
    this.selectedTrain.set(null);
    this.selectedStation.set(null);
    this.searchComp()?.reset();
  }

  private flyToStation(id: string) {
    const s = this.stazioni.find(s => s.id === id);
    if (s) {
      this.savedMapCenter = this.map.getCenter();
      this.savedMapZoom = this.map.getZoom();
      this.map.fitBounds(L.latLngBounds([s.lat, s.lon], [s.lat, s.lon]), { paddingTopLeft: this.overlayPadding, paddingBottomRight: [0, 0], maxZoom: 14, animate: true });
    }
  }

  onStationTrainClick(e: { num: number; codOrigine: string }) {
    this.stopRefresh();
    this.api.cercaTreno(String(e.num)).subscribe({
      next: (res) => {
        if ('disambigua' in res) {
          const match = res.disambigua.find(d => d.codiceOrigine === e.codOrigine);
          if (match) {
            this.api.getAndamentoTreno(match.numero, match.codiceOrigine, match.timestamp)
              .subscribe({ next: (dett) => this.onTrainSelected(dett) });
          }
        } else {
          this.onTrainSelected(res);
        }
      }
    });
  }

  resetAll() {
    this.stopRefresh();
    this.searchComp()?.reset();
    this.selectedTrain.set(null);
    this.selectedStation.set(null);
    this.showSearch.set(true);
    if (this.isMobile()) {
      this.sidebarOpen.set(false);
    }
    this.clearMapPaths();
    if (this.savedMapCenter && this.savedMapZoom) {
      this.map.fitBounds(L.latLngBounds(this.savedMapCenter, this.savedMapCenter), { paddingTopLeft: this.overlayPadding, paddingBottomRight: [0, 0], maxZoom: this.savedMapZoom, animate: true });
      this.savedMapCenter = null;
      this.savedMapZoom = null;
    }
    if (!this.map.hasLayer(this.stazioniLayer)) {
      this.stazioniLayer.addTo(this.map);
    }
  }

  private clearMapPaths() {
    this.markersLayer.clearLayers();
    if (this.completedPath) { this.completedPath.remove(); this.completedPath = null; }
    if (this.remainingPath) { this.remainingPath.remove(); this.remainingPath = null; }
  }

  private startRefresh(treno: DettaglioTreno) {
    this.stopRefresh();
    this.lastTrainQuery = {
      num: String(treno.numeroTreno),
      orig: treno.idOrigine,
    };

    const interval = this.settings().refreshInterval;

    this.refreshCountdown.set(interval);
    this.countdownOffset.set(94.25);

    this.countdownInterval = setInterval(() => {
      this.refreshCountdown.update(v => Math.max(0, v - 1));
      this.countdownOffset.set(94.25 * (this.refreshCountdown() / interval));
    }, 1000);

    this.refreshInterval = setInterval(() => {
      if (!this.lastTrainQuery) return;
      const q = this.lastTrainQuery;
      this.api.getAndamentoTreno(q.num, q.orig, q.data).subscribe({
        next: (dett) => {
          this.selectedTrain.set(dett);
          const lastPassed = this.showTrainPath(dett, true);
          const isCancelled = dett.provvedimento !== 0 ||
            (!!dett.subTitle && dett.subTitle.toLowerCase().includes('cancellat'));
          if (isCancelled || (this.totalCoords > 0 && lastPassed >= this.totalCoords - 1)) {
            this.stopRefresh();
          }
        }
      });
      this.refreshCountdown.set(interval);
      this.countdownOffset.set(94.25);
    }, interval * 1000);
  }

  private stopRefresh() {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
    }
    if (this.countdownInterval) {
      clearInterval(this.countdownInterval);
      this.countdownInterval = null;
    }
    this.refreshCountdown.set(0);
    this.countdownOffset.set(0);
    this.lastTrainQuery = null;
    this.lastValidRilevamentoCoords = null;
  }

  isTrainOnTime(t: DettaglioTreno): boolean {
    return (t.compRitardo[0] ?? '').toLowerCase().includes('orario');
  }

  isTrainRitardoAlto(t: DettaglioTreno): boolean {
    return t.fermate?.some(f => f.ritardo > 10) ?? false;
  }

  private showTrainPath(treno: DettaglioTreno, skipFitBounds = false): number {
    this.markersLayer.clearLayers();
    if (this.completedPath) { this.completedPath.remove(); this.completedPath = null; }
    if (this.remainingPath) { this.remainingPath.remove(); this.remainingPath = null; }

    if (!treno.fermate?.length) return -1;

    const fermateValide = treno.fermate.filter(f => f.actualFermataType !== 3);
    const ultimoRilevamento = treno.stazioneUltimoRilevamento;

    let lastPassed = -1;
    let rilevamentoCoords: [number, number] | null = null;
    let rilevamentoInFermate = false;
    let lastPassedByRilevamento = -1;
    let lastPassedByRealTime = -1;

    if (ultimoRilevamento && ultimoRilevamento !== '--') {
      const searchName = ultimoRilevamento.toLowerCase().trim();
      const fermataIdx = fermateValide.findIndex(
        f => f.stazione.toLowerCase().trim() === searchName
      );
      if (fermataIdx >= 0) {
        lastPassedByRilevamento = fermataIdx;
        rilevamentoInFermate = true;
        this.lastValidRilevamentoCoords = null;
      } else {
        const s = this.stazioni.find(st =>
          st.nome.toLowerCase().trim() === searchName ||
          (st.nome_breve && st.nome_breve.toLowerCase().trim() === searchName)
        );
        if (s && s.lat && s.lon) {
          rilevamentoCoords = [s.lat, s.lon];
          this.lastValidRilevamentoCoords = rilevamentoCoords;
        } else if (this.lastValidRilevamentoCoords) {
          rilevamentoCoords = this.lastValidRilevamentoCoords;
        }
      }
    }

    for (let i = fermateValide.length - 1; i >= 0; i--) {
      if (fermateValide[i].partenzaReale || fermateValide[i].arrivoReale) {
        lastPassedByRealTime = i;
        break;
      }
    }

    lastPassed = Math.max(lastPassedByRilevamento, lastPassedByRealTime);

    const allCoords: [number, number][] = [];
    const bounds = L.latLngBounds([]);

    for (const f of fermateValide) {
      if (f.lat && f.lon) {
        allCoords.push([f.lat, f.lon]);
        bounds.extend([f.lat, f.lon]);
      }
    }

    if (lastPassed >= 0) {
      let realIdx = -1;
      for (let i = 0; i < fermateValide.length && i <= lastPassed; i++) {
        if (fermateValide[i].lat && fermateValide[i].lon) realIdx++;
      }
      lastPassed = realIdx;
    }

    if (allCoords.length === 0 && !rilevamentoCoords) return lastPassed;

    this.totalCoords = allCoords.length;

    if (rilevamentoCoords) {
      bounds.extend(rilevamentoCoords);
    }

    if (lastPassed >= 0) {
      if (lastPassed >= allCoords.length - 1) {
        if (allCoords.length >= 2) {
          this.completedPath = L.polyline(allCoords, {
            color: '#059669',
            weight: 4,
            opacity: 0.9,
          }).addTo(this.map);
        }
      } else {
        const splitIdx = Math.min(lastPassed + 1, allCoords.length - 1);
        const completedArr = allCoords.slice(0, splitIdx);
        let remainingArr = allCoords.slice(lastPassed);

        if (rilevamentoCoords && !rilevamentoInFermate) {
          if (completedArr.length > 0) {
            completedArr.push(rilevamentoCoords);
          }
          remainingArr = [rilevamentoCoords, ...allCoords.slice(lastPassed + 1)];
        }

        if (remainingArr.length === 1 && completedArr.length >= 1) {
          remainingArr = [completedArr[completedArr.length - 1], ...remainingArr];
        }

        if (completedArr.length >= 2) {
          this.completedPath = L.polyline(completedArr, {
            color: '#059669',
            weight: 4,
            opacity: 0.9,
          }).addTo(this.map);
        }

        if (remainingArr.length >= 1) {
          this.remainingPath = L.polyline(remainingArr, {
            color: '#78350f',
            weight: 4,
            opacity: 0.9,
            dashArray: '8, 4',
          }).addTo(this.map);
        }
      }
    } else {
      this.remainingPath = L.polyline(allCoords, {
        color: '#78350f',
        weight: 4,
        opacity: 0.9,
        dashArray: '8, 4',
      }).addTo(this.map);
    }

    for (const f of fermateValide) {
      if (!f.lat || !f.lon) continue;

      const isUltimaRilevata = rilevamentoInFermate &&
        f.stazione.toLowerCase().trim() === ultimoRilevamento!.toLowerCase().trim();

      const color = isUltimaRilevata ? '#2563eb'
        : f.ritardo > 5 ? '#f59e0b'
        : f.partenzaReale || f.arrivoReale ? '#059669'
        : '#78350f';

      const marker = L.circleMarker([f.lat, f.lon], {
        radius: isUltimaRilevata ? 8 : 5,
        color,
        fillColor: color,
        fillOpacity: 0.8,
        weight: 2,
      });

      const popupContent = `
        <b>${f.stazione}</b><br/>
        ${f.arrivo_teorico ? `Arrivo: ${new Date(f.arrivo_teorico).toLocaleTimeString('it-IT', {hour: '2-digit', minute:'2-digit'})}` : ''}
        ${f.partenza_teorica ? `<br/>Partenza: ${new Date(f.partenza_teorica).toLocaleTimeString('it-IT', {hour: '2-digit', minute:'2-digit'})}` : ''}
        ${f.ritardo ? `<br/>Ritardo: ${f.ritardo} min` : ''}
      `;
      marker.bindPopup(popupContent);

      this.markersLayer.addLayer(marker);
    }

    if (rilevamentoCoords && !rilevamentoInFermate && ultimoRilevamento) {
      const marker = L.circleMarker(rilevamentoCoords, {
        radius: 8,
        color: '#2563eb',
        fillColor: '#2563eb',
        fillOpacity: 0.8,
        weight: 2,
      });
      marker.bindPopup(`<b>${ultimoRilevamento}</b><br/>Ultimo rilevamento`);
      this.markersLayer.addLayer(marker);
    }

    this.markersLayer.addTo(this.map);

    if (bounds.isValid() && !skipFitBounds) {
      this.map.fitBounds(bounds, { paddingTopLeft: this.overlayPadding, paddingBottomRight: [50, 50], animate: true });
    }

    return lastPassed;
  }
}
