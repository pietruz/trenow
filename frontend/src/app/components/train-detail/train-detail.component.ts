import { Component, input, output, effect, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { DettaglioTreno, Fermata } from '../../models/treno';
import { TipoTrenoLabelPipe } from '../../pipes/tipo-treno.pipe';

@Component({
  selector: 'app-train-detail',
  standalone: true,
  imports: [DatePipe, TipoTrenoLabelPipe],
  templateUrl: './train-detail.component.html',
  styleUrl: './train-detail.component.css',
})
export class TrainDetailComponent {
  treno = input.required<DettaglioTreno>();
  refreshCountdown = input(0);
  countdownOffset = input(0);
  mode = input<'list' | 'overlay'>('list');
  onCloseSidebar = output<void>();
  fermateCollapsed = signal(false);

  toggleFermate() {
    this.fermateCollapsed.update(v => !v);
  }

  constructor() {
    effect(() => {
      this.treno();
      queueMicrotask(() => this.scrollToLastPassata());
    });
  }

  private scrollToLastPassata() {
    const fermate = this.treno().fermate;
    if (!fermate?.length) return;

    let lastIdx = -1;
    for (let i = 0; i < fermate.length; i++) {
      if (this.isPassata(fermate[i])) {
        lastIdx = i;
      }
    }

    if (lastIdx >= 0) {
      const el = document.getElementById('fermata-' + lastIdx);
      el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  isOnTime(): boolean {
    return (this.treno().compRitardo[0] ?? '').toLowerCase().includes('orario');
  }

  isRitardoAlto(): boolean {
    return this.treno().fermate?.some(f => f.ritardo > 10) ?? false;
  }

  isPassata(f: Fermata): boolean {
    if (!!f.partenzaReale || !!f.arrivoReale) return true;
    const ultimo = this.treno().stazioneUltimoRilevamento;
    if (ultimo && ultimo !== '--') {
      return f.stazione.toLowerCase().trim() === ultimo.toLowerCase().trim();
    }
    return false;
  }
}
