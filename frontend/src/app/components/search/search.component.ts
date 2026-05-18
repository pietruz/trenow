import { Component, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../services/api.service';
import { DisambiguaTreno, DettaglioTreno } from '../../models/treno';
import { CercaStazione } from '../../models/stazione';

@Component({
  selector: 'app-search',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="search-panel">
      <h3>Ricerca</h3>

      <div class="search-section">
        <label>Cerca treno</label>
        <div class="input-row">
          <div class="input-wrap">
            <input
              [(ngModel)]="trainNum"
              (keyup.enter)="searchTrain()"
              placeholder="Numero treno (es. 2107)"
            />
            @if (trainNum) {
              <button class="clear-btn" (click)="clearTrainSearch()" tabindex="-1">✕</button>
            }
          </div>
          <button (click)="searchTrain()">Cerca</button>
        </div>

        @if (disambigua.length > 0) {
          <div class="disambigua">
            <p>Scegli origine:</p>
            @for (d of disambigua; track d.codiceOrigine) {
              <div class="disambigua-item" (click)="selectDisambigua(d)">
                {{ d.origine }}
              </div>
            }
          </div>
        }

      </div>

      <div class="search-section">
        <label>Cerca stazione</label>
        <div class="input-row">
          <div class="input-wrap">
            <input
              [(ngModel)]="stationQuery"
              (keyup.enter)="searchStation()"
              placeholder="Nome stazione"
            />
            @if (stationQuery) {
              <button class="clear-btn" (click)="clearStationSearch()" tabindex="-1">✕</button>
            }
          </div>
          <button (click)="searchStation()">Cerca</button>
        </div>

        @if (stationResults.length > 0) {
          <div class="station-list">
            @for (s of stationResults; track s.id) {
              <div class="station-item" (click)="selectStation(s)">
                {{ s.nomeLungo }} ({{ s.id }})
              </div>
            }
          </div>
        }
      </div>
    </div>
  `,
  styles: [`
    .search-panel { padding: 10px; }
    h3 { margin: 0 0 10px; font-size: 14px; text-transform: uppercase; color: #666; }
    .search-section { margin-bottom: 12px; }
    label { display: block; font-size: 12px; color: #888; margin-bottom: 4px; }
    .input-row { display: flex; gap: 4px; }
    .input-wrap { position: relative; flex: 1; }
    .input-wrap input { width: 100%; padding: 6px 24px 6px 8px; border: 1px solid #ccc; border-radius: 4px; font-size: 13px; box-sizing: border-box; }
    .clear-btn { position: absolute; right: 4px; top: 50%; transform: translateY(-50%); background: none; border: none; cursor: pointer; font-size: 13px; color: #9ca3af; padding: 2px 4px; line-height: 1; }
    .clear-btn:hover { color: #4b5563; }
    button { padding: 6px 12px; background: #2563eb; color: #fff; border: none; border-radius: 4px; cursor: pointer; font-size: 13px; }
    button:hover { background: #1d4ed8; }
    .disambigua, .station-list { margin-top: 6px; }
    .disambigua p { margin: 0 0 4px; font-size: 12px; color: #666; }
    .disambigua-item, .station-item { padding: 6px 8px; background: #f3f4f6; border-radius: 4px; margin-bottom: 4px; cursor: pointer; font-size: 13px; }
    .disambigua-item:hover, .station-item:hover { background: #e5e7eb; }

  `]
})
export class SearchComponent {
  trainNum = '';
  stationQuery = '';
  disambigua: DisambiguaTreno[] = [];
  trainResult: DettaglioTreno | null = null;
  stationResults: CercaStazione[] = [];

  onTrainSelected = output<DettaglioTreno>();
  onStationSelected = output<CercaStazione>();

  constructor(private api: ApiService) {}

  reset() {
    this.clearTrainSearch();
    this.clearStationSearch();
  }

  clearTrainSearch() {
    this.trainNum = '';
    this.disambigua = [];
    this.trainResult = null;
  }

  clearStationSearch() {
    this.stationQuery = '';
    this.stationResults = [];
  }

  searchTrain() {
    if (!this.trainNum.trim()) return;
    this.disambigua = [];
    this.trainResult = null;
    this.clearStationSearch();

    this.api.cercaTreno(this.trainNum.trim()).subscribe({
      next: (res) => {
        if ('disambigua' in res) {
          this.disambigua = res.disambigua;
        } else {
          this.trainResult = res;
          this.onTrainSelected.emit(res);
        }
      },
      error: () => {
        alert('Treno non trovato');
      }
    });
  }

  selectDisambigua(d: DisambiguaTreno) {
    this.disambigua = [];
    this.clearStationSearch();
    this.api.getAndamentoTreno(d.numero, d.codiceOrigine, d.timestamp).subscribe({
      next: (res) => {
        this.trainResult = res;
        this.onTrainSelected.emit(res);
      }
    });
  }

  searchStation() {
    if (this.stationQuery.trim().length < 2) return;
    this.clearTrainSearch();
    this.api.cercaStazioni(this.stationQuery.trim()).subscribe({
      next: (res) => this.stationResults = res
    });
  }

  selectStation(s: CercaStazione) {
    this.stationResults = [];
    this.clearTrainSearch();
    this.onStationSelected.emit(s);
  }
}
