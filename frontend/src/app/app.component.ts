import { Component, AfterViewInit, signal, viewChild, ElementRef, OnDestroy, HostListener } from '@angular/core';
import { SearchComponent } from './components/search/search.component';
import { TrainDetailComponent } from './components/train-detail/train-detail.component';
import { StationPanelComponent } from './components/station-panel/station-panel.component';
import { ApiService } from './services/api.service';
import { Stazione, CercaStazione } from './models/stazione';
import { DettaglioTreno } from './models/treno';
import { TipoTrenoLabelPipe } from './pipes/tipo-treno.pipe';
import * as L from 'leaflet';

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

  constructor(private api: ApiService) {
    this.checkScreenSize();
  }

  ngAfterViewInit() {
    this.initMap();
    this.loadStazioni();
  }

  ngOnDestroy() {
    this.stopRefresh();
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

    L.control.zoom({ position: 'bottomright' }).addTo(this.map);

    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(this.map);

    this.markersLayer = L.layerGroup().addTo(this.map);
    this.stazioniLayer = L.layerGroup();

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
