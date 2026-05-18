import { Component, input, output, signal, effect } from '@angular/core';
import { ApiService } from '../../services/api.service';
import { CercaStazione } from '../../models/stazione';
import { Partenza } from '../../models/treno';
import { DatePipe } from '@angular/common';

@Component({
  selector: 'app-station-panel',
  standalone: true,
  imports: [DatePipe],
  template: `
    @if (stazione()) {
      <div class="station-panel">
        <h3>{{ stazione().nomeLungo }}</h3>

        <div class="tabs">
          <button [class.active]="tab() === 'partenze'" (click)="tab.set('partenze')">Partenze</button>
          <button [class.active]="tab() === 'arrivi'" (click)="tab.set('arrivi')">Arrivi</button>
        </div>

        <div class="train-list">
          @for (t of treni(); track t.numeroTreno + t.codOrigine + t.orarioPartenza) {
            <div class="train-item" (click)="selectTrain(t)">
              <div class="train-header">
                <span class="train-num">{{ t.categoriaDescrizione }} {{ t.numeroTreno }}</span>
                <span class="train-dest">{{ tab() === 'arrivi' ? (t.origine || '?') : t.destinazione }}</span>
              </div>
              <div class="train-orari">
                <span class="orario">
                  {{ (tab() === 'partenze' ? t.orarioPartenza : t.orarioArrivo) | date:'HH:mm' }}
                </span>
                @if (t.ritardo !== 0) {
                  <span class="ritardo" [class.negativo]="t.ritardo < 0">
                    {{ t.ritardo > 0 ? '+' : '' }}{{ t.ritardo }} min
                  </span>
                }
              </div>
              @if (t.binarioEffettivoPartenzaDescrizione || t.binarioProgrammatoPartenzaDescrizione) {
                <div class="binario">
                  Bin: {{ t.binarioEffettivoPartenzaDescrizione || t.binarioProgrammatoPartenzaDescrizione }}
                </div>
              }
            </div>
          } @empty {
            <div class="empty">Nessun treno trovato</div>
          }
        </div>
      </div>
    }
  `,
  styles: [`
    .station-panel { padding: 10px; }
    h3 { margin: 0 0 10px; font-size: 15px; }
    .tabs { display: flex; gap: 4px; margin-bottom: 10px; }
    .tabs button { flex: 1; padding: 6px; border: 1px solid #ccc; background: #f9fafb; border-radius: 4px; cursor: pointer; font-size: 13px; }
    .tabs button.active { background: #2563eb; color: #fff; border-color: #2563eb; }
    .train-list { max-height: 400px; overflow-y: auto; }
    .train-item { padding: 8px; border-bottom: 1px solid #f3f4f6; cursor: pointer; }
    .train-item:hover { background: #f9fafb; }
    .train-header { display: flex; justify-content: space-between; font-size: 13px; }
    .train-num { font-weight: 600; }
    .train-dest { color: #666; }
    .train-orari { display: flex; gap: 8px; align-items: center; margin-top: 4px; font-size: 12px; }
    .orario { font-weight: 600; color: #059669; }
    .ritardo { padding: 1px 6px; border-radius: 3px; font-size: 11px; font-weight: 600; background: #fee2e2; color: #991b1b; }
    .ritardo.negativo { background: #d1fae5; color: #065f46; }
    .binario { font-size: 11px; color: #888; margin-top: 2px; }
    .empty { padding: 20px; text-align: center; color: #888; font-size: 13px; }
  `]
})
export class StationPanelComponent {
  stazione = input.required<CercaStazione>();
  tab = signal<'partenze' | 'arrivi'>('partenze');
  treni = signal<Partenza[]>([]);

  onTrainClick = output<{ num: number; codOrigine: string }>();

  constructor(private api: ApiService) {
    effect(() => {
      const s = this.stazione();
      const t = this.tab();
      if (!s) return;

      (t === 'partenze' ? this.api.getPartenze(s.id) : this.api.getArrivi(s.id))
        .subscribe({ next: (res) => this.treni.set(res) });
    });
  }

  selectTrain(t: Partenza) {
    this.onTrainClick.emit({ num: t.numeroTreno, codOrigine: t.codOrigine });
  }
}
