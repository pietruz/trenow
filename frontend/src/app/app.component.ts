import { Component, AfterViewInit, signal, viewChild, ElementRef, OnDestroy } from '@angular/core';
import { SearchComponent } from './components/search/search.component';
import { TrainDetailComponent } from './components/train-detail/train-detail.component';
import { StationPanelComponent } from './components/station-panel/station-panel.component';
import { ApiService } from './services/api.service';
import { Stazione, CercaStazione } from './models/stazione';
import { DettaglioTreno } from './models/treno';
import * as L from 'leaflet';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [SearchComponent, TrainDetailComponent, StationPanelComponent],
  template: `
    <div class="app-container">
      <div class="sidebar">
        <div class="sidebar-top">
          <app-search #searchComp (onTrainSelected)="onTrainSelected($event)" (onStationSelected)="onStationSelected($event)" />
        </div>
        <div class="sidebar-middle">
          @if (selectedTrain()) {
            <app-train-detail [treno]="selectedTrain()!" [refreshCountdown]="refreshCountdown()" [countdownOffset]="countdownOffset()" />
          }
          @if (selectedStation()) {
            <app-station-panel [stazione]="selectedStation()!" (onTrainClick)="onStationTrainClick($event)" />
          }
        </div>
        <div class="sidebar-footer">
          <button class="reset-btn" (click)="resetAll()">✕ Resetta</button>
        </div>
      </div>
      <div class="map-container" #mapContainer></div>
    </div>
  `,
  styles: [`
    .app-container { display: flex; height: 100vh; width: 100vw; }
    .sidebar { width: 360px; display: flex; flex-direction: column; border-right: 1px solid #e5e7eb; background: #fff; }
    .sidebar-top { flex: 0 0 auto; }
    .sidebar-middle { flex: 1; overflow-y: auto; }
    .sidebar-footer { flex: 0 0 auto; padding: 8px 10px; border-top: 1px solid #e5e7eb; background: #f9fafb; }
    .reset-btn { width: 100%; padding: 8px; background: #6b7280; color: #fff; border: none; border-radius: 4px; cursor: pointer; font-size: 13px; text-align: center; }
    .reset-btn:hover { background: #4b5563; }
    .map-container { flex: 1; }
  `]
})
export class AppComponent implements AfterViewInit, OnDestroy {
  mapContainer = viewChild.required<ElementRef<HTMLDivElement>>('mapContainer');
  searchComp = viewChild<SearchComponent>('searchComp');

  selectedTrain = signal<DettaglioTreno | null>(null);
  selectedStation = signal<CercaStazione | null>(null);
  refreshCountdown = signal(0);
  countdownOffset = signal(0);

  private map!: L.Map;
  private stazioniLayer!: L.LayerGroup;
  private completedPath!: L.Polyline | null;
  private remainingPath!: L.Polyline | null;
  private markersLayer!: L.LayerGroup;
  private stazioni: Stazione[] = [];
  private refreshInterval: ReturnType<typeof setInterval> | null = null;
  private countdownInterval: ReturnType<typeof setInterval> | null = null;
  private lastTrainQuery: { num: string; orig: string; data?: string } | null = null;

  constructor(private api: ApiService) {}

  ngAfterViewInit() {
    this.initMap();
    this.loadStazioni();
  }

  ngOnDestroy() {
    this.stopRefresh();
  }

  private initMap() {
    this.map = L.map(this.mapContainer().nativeElement, {
      center: [41.9, 12.5],
      zoom: 6,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
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
        this.map.fitBounds(bounds, { padding: [20, 20], maxZoom: 12 });
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
      const marker = L.circleMarker([s.lat, s.lon], {
        radius: 3,
        color: '#2563eb',
        fillColor: '#2563eb',
        fillOpacity: 0.8,
        weight: 1,
      });

      marker.on('click', () => {
        this.map.setView([s.lat, s.lon], 14, { animate: true });
        this.selectedStation.set({
          nomeLungo: s.nome,
          nomeBreve: s.nome_breve,
          label: null,
          id: s.id
        });
      });

      this.stazioniLayer.addLayer(marker);
    }

    this.stazioniLayer.addTo(this.map);
  }

  onTrainSelected(treno: DettaglioTreno) {
    this.selectedStation.set(null);
    this.selectedTrain.set(treno);
    this.showTrainPath(treno);
    this.startRefresh(treno);
  }

  onStationSelected(stazione: CercaStazione) {
    this.stopRefresh();
    this.selectedTrain.set(null);
    this.selectedStation.set(stazione);
    this.flyToStation(stazione.id);
  }

  private flyToStation(id: string) {
    const s = this.stazioni.find(s => s.id === id);
    if (s) {
      this.map.setView([s.lat, s.lon], 14, { animate: true });
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
    this.clearMapPaths();
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

    this.refreshCountdown.set(10);
    this.countdownOffset.set(94.25);

    this.countdownInterval = setInterval(() => {
      this.refreshCountdown.update(v => Math.max(0, v - 1));
      this.countdownOffset.set(94.25 * (this.refreshCountdown() / 10));
    }, 1000);

    this.refreshInterval = setInterval(() => {
      if (!this.lastTrainQuery) return;
      const q = this.lastTrainQuery;
      this.api.getAndamentoTreno(q.num, q.orig, q.data).subscribe({
        next: (dett) => {
          this.selectedTrain.set(dett);
          this.showTrainPath(dett, true);
        }
      });
      this.refreshCountdown.set(10);
      this.countdownOffset.set(94.25);
    }, 10000);
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
  }

  private showTrainPath(treno: DettaglioTreno, skipFitBounds = false) {
    this.markersLayer.clearLayers();
    if (this.completedPath) { this.completedPath.remove(); this.completedPath = null; }
    if (this.remainingPath) { this.remainingPath.remove(); this.remainingPath = null; }

    if (!treno.fermate?.length) return;

    const fermateValide = treno.fermate.filter(f => f.actualFermataType !== 3);

    const ultimoRilevamento = treno.stazioneUltimoRilevamento;
    let lastPassed = -1;
    if (ultimoRilevamento && ultimoRilevamento !== '--') {
      lastPassed = fermateValide.findIndex(f => f.stazione === ultimoRilevamento);
    }

    const allCoords: [number, number][] = [];
    const bounds = L.latLngBounds([]);

    for (const f of fermateValide) {
      if (f.lat && f.lon) {
        allCoords.push([f.lat, f.lon]);
        bounds.extend([f.lat, f.lon]);
      }
    }

    if (allCoords.length === 0) return;

    if (lastPassed >= 0) {
      const splitIdx = Math.min(lastPassed + 1, allCoords.length - 1);
      const completed = allCoords.slice(0, splitIdx);
      const remaining = allCoords.slice(lastPassed);

      if (completed.length >= 2) {
        this.completedPath = L.polyline(completed, {
          color: '#059669',
          weight: 4,
          opacity: 0.9,
        }).addTo(this.map);
      }

      if (remaining.length >= 2) {
        this.remainingPath = L.polyline(remaining, {
          color: '#78350f',
          weight: 4,
          opacity: 0.9,
          dashArray: '8, 4',
        }).addTo(this.map);
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

      const isUltimaRilevata = f.stazione === treno.stazioneUltimoRilevamento;
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

    this.markersLayer.addTo(this.map);

    if (bounds.isValid() && !skipFitBounds) {
      this.map.fitBounds(bounds, { padding: [50, 50] });
    }
  }
}
