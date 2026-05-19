import { Component, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../services/api.service';
import { DisambiguaTreno, DettaglioTreno } from '../../models/treno';
import { CercaStazione } from '../../models/stazione';

@Component({
  selector: 'app-search',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './search.component.html',
  styleUrl: './search.component.css',
})
export class SearchComponent {
  searchType = signal<'treno' | 'stazione'>('stazione');
  query = '';
  disambigua: DisambiguaTreno[] = [];
  stationResults: CercaStazione[] = [];

  onTrainSelected = output<DettaglioTreno>();
  onStationSelected = output<CercaStazione>();

  constructor(private api: ApiService) {}

  reset() {
    this.query = '';
    this.disambigua = [];
    this.stationResults = [];
  }

  setType(type: 'treno' | 'stazione') {
    this.searchType.set(type);
    this.reset();
  }

  search(event?: Event) {
    if (!this.query.trim()) return;
    this.disambigua = [];
    this.stationResults = [];

    if (this.searchType() === 'treno') {
      this.api.cercaTreno(this.query.trim()).subscribe({
        next: (res) => {
          if ('disambigua' in res) {
            this.disambigua = res.disambigua;
          } else {
            this.onTrainSelected.emit(res);
          }
        },
        error: () => {
          alert('Treno non trovato');
        }
      });
    } else {
      if (this.query.trim().length < 2) return;
      (event?.target as HTMLInputElement)?.blur();
      this.api.cercaStazioni(this.query.trim()).subscribe({
        next: (res) => {
          if (res.length === 1) {
            this.selectStation(res[0]);
          } else {
            this.stationResults = res;
          }
        }
      });
    }
  }

  selectDisambigua(d: DisambiguaTreno) {
    this.disambigua = [];
    this.api.getAndamentoTreno(d.numero, d.codiceOrigine, d.timestamp).subscribe({
      next: (res) => this.onTrainSelected.emit(res)
    });
  }

  selectStation(s: CercaStazione) {
    this.stationResults = [];
    this.onStationSelected.emit(s);
  }
}
