import { Component, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../services/api.service';
import { DisambiguaTreno, DettaglioTreno } from '../../models/treno';
import { CercaStazione } from '../../models/stazione';

export interface RegioneEntry {
  nome: string;
  rfi: number;
}

const REGIONI: RegioneEntry[] = [
  { nome: 'Abruzzo', rfi: 19 },
  { nome: 'Basilicata', rfi: 15 },
  { nome: 'Calabria', rfi: 17 },
  { nome: 'Campania', rfi: 18 },
  { nome: 'Emilia-Romagna', rfi: 8 },
  { nome: 'Friuli-Venezia Giulia', rfi: 10 },
  { nome: 'Lazio', rfi: 5 },
  { nome: 'Liguria', rfi: 2 },
  { nome: 'Lombardia', rfi: 1 },
  { nome: 'Marche', rfi: 6 },
  { nome: 'Molise', rfi: 7 },
  { nome: 'Piemonte', rfi: 3 },
  { nome: 'Puglia', rfi: 16 },
  { nome: 'Sardegna', rfi: 20 },
  { nome: 'Sicilia', rfi: 14 },
  { nome: 'Toscana', rfi: 13 },
  { nome: 'Trentino-Alto Adige', rfi: 12 },
  { nome: 'Umbria', rfi: 6 },
  { nome: "Valle d'Aosta", rfi: 3 },
  { nome: 'Veneto', rfi: 12 },
].sort((a, b) => a.nome.localeCompare(b.nome));

@Component({
  selector: 'app-search',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './search.component.html',
  styleUrl: './search.component.css',
})
export class SearchComponent {
  searchType = signal<'treno' | 'stazione' | 'regione'>('stazione');
  query = '';
  disambigua: DisambiguaTreno[] = [];
  stationResults: CercaStazione[] = [];
  regioni = REGIONI;
  selectedRegione = '';

  onTrainSelected = output<DettaglioTreno>();
  onStationSelected = output<CercaStazione>();
  onRegionSelected = output<number>();

  constructor(private api: ApiService) {}

  reset() {
    this.query = '';
    this.disambigua = [];
    this.stationResults = [];
    this.selectedRegione = '';
  }

  setType(type: 'treno' | 'stazione' | 'regione') {
    this.searchType.set(type);
    this.reset();
  }

  onRegioneChange() {
    const found = this.regioni.find(r => r.nome === this.selectedRegione);
    if (found) {
      this.onRegionSelected.emit(found.rfi);
    }
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
    } else if (this.searchType() === 'stazione') {
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
