import { Component, input, output, signal, effect } from '@angular/core';
import { ApiService } from '../../services/api.service';
import { CercaStazione } from '../../models/stazione';
import { Partenza } from '../../models/treno';
import { DatePipe } from '@angular/common';

@Component({
  selector: 'app-station-panel',
  standalone: true,
  imports: [DatePipe],
  templateUrl: './station-panel.component.html',
  styleUrl: './station-panel.component.css',
})
export class StationPanelComponent {
  stazione = input.required<CercaStazione>();
  tab = signal<'partenze' | 'arrivi'>('partenze');
  treni = signal<Partenza[]>([]);

  onTrainClick = output<{ num: number; codOrigine: string }>();
  onReset = output<void>();

  constructor(private api: ApiService) {
    effect(() => {
      const s = this.stazione();
      const t = this.tab();
      if (!s) return;

      (t === 'partenze' ? this.api.getPartenze(s.id) : this.api.getArrivi(s.id))
        .subscribe({
          next: (res) => this.treni.set(res),
          error: () => {}
        });
    });
  }

  selectTrain(t: Partenza) {
    this.onTrainClick.emit({ num: t.numeroTreno, codOrigine: t.codOrigine });
  }
}
