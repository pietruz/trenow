import { Component, input, effect } from '@angular/core';
import { DatePipe } from '@angular/common';
import { DettaglioTreno, Fermata } from '../../models/treno';

@Component({
  selector: 'app-train-detail',
  standalone: true,
  imports: [DatePipe],
  template: `
    @if (treno()) {
      <div class="train-detail">
        <div class="train-detail-top">
          <div class="header">
            <h3>
              <span>Treno {{ treno().numeroTreno }}</span>
              <span class="h3-spacer"></span>
              @if (refreshCountdown() > 0) {
                <span class="countdown-indicator" [title]="'Prossimo aggiornamento tra ' + refreshCountdown() + 's'">
                  <svg width="14" height="14" viewBox="0 0 36 36">
                    <circle cx="18" cy="18" r="15" fill="none" stroke="#e5e7eb" stroke-width="4" />
                    <circle cx="18" cy="18" r="15" fill="none" stroke="#2563eb" stroke-width="4"
                      [attr.stroke-dasharray]="countdownOffset() + ', 94.25'"
                      stroke-linecap="round"
                      transform="rotate(-90 18 18)" />
                  </svg>
                </span>
              }
            </h3>
            <span class="route">{{ treno().origine }} → {{ treno().destinazione }}</span>
            @if (treno().compRitardo.length > 0) {
              <span class="ritardo" [class.in-orario]="isOnTime()" [class.ritardo-alto]="isRitardoAlto()">
                {{ treno().compRitardo[0] }}
              </span>
            }
          </div>

          @if (treno().subTitle) {
            <div class="subtitle">{{ treno().subTitle }}</div>
          }

          @if (treno().stazioneUltimoRilevamento && treno().stazioneUltimoRilevamento !== '--') {
            <div class="rilevamento">
              Ultimo rilevamento: <strong>{{ treno().stazioneUltimoRilevamento }}</strong>
            </div>
          }
        </div>

        <div class="train-detail-list">
          <h4>Fermate</h4>
          @for (f of treno().fermate; track $index) {
            <div class="fermata" [class.soppressa]="f.actualFermataType === 3" [class.passata]="isPassata(f)" [id]="'fermata-' + $index">
              <div class="fermata-info">
                <span class="fermata-nome">{{ f.stazione }}</span>
                <span class="fermata-tipo">{{ tipoFermataLabel(f.tipoFermata) }}</span>
              </div>
              <div class="fermata-orari">
                @if (f.partenza_teorica) {
                  <span class="teorico">{{ f.partenza_teorica | date:'HH:mm' }}</span>
                }
                @if (f.partenzaReale) {
                  <span class="reale" [class.in-orario]="f.ritardoPartenza! <= 1" [class.ritardo]="f.ritardoPartenza! > 1">
                    {{ f.partenzaReale | date:'HH:mm' }}
                  </span>
                }
                @if (f.ritardo !== 0) {
                  <span class="ritardo-badge" [class.ok]="f.ritardo <= 1" [class.ko]="f.ritardo > 1">
                    {{ f.ritardo }} min
                  </span>
                }
              </div>
              @if (f.binarioEffettivoPartenzaDescrizione) {
                <div class="binario">Binario: {{ f.binarioEffettivoPartenzaDescrizione }}</div>
              }
            </div>
          }
        </div>
      </div>
    }
  `,
  styles: [`
    .train-detail { padding: 10px; display: flex; flex-direction: column; height: 100%; box-sizing: border-box; }
    .train-detail-top { flex: 0 0 auto; }
    .train-detail-list { flex: 1; overflow-y: auto; border-top: 1px solid #e5e7eb; padding-top: 8px; margin-top: 8px; }
    .header { margin-bottom: 10px; }
    h3 { margin: 0; font-size: 16px; display: flex; align-items: center; }
    .h3-spacer { flex: 1; }
    .countdown-indicator { display: inline-flex; align-items: center; margin-left: 8px; }
    h4 { margin: 0 0 8px; font-size: 13px; color: #666; text-transform: uppercase; }
    .route { display: block; font-size: 13px; color: #666; margin: 4px 0; }
    .ritardo { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 12px; font-weight: 600; background: #fef3c7; color: #92400e; }
    .in-orario { background: #d1fae5; color: #065f46; }
    .ritardo-alto { background: #fee2e2; color: #991b1b; }
    .subtitle { padding: 6px 8px; background: #fef3c7; border-radius: 4px; font-size: 12px; margin-bottom: 8px; }
    .rilevamento { font-size: 12px; color: #666; margin-bottom: 8px; }
    .fermata { padding: 8px; border-bottom: 1px solid #f3f4f6; transition: background 0.2s; }
    .fermata:hover { background: #f9fafb; }
    .fermata.soppressa { opacity: 0.5; text-decoration: line-through; }
    .fermata-info { display: flex; justify-content: space-between; align-items: center; }
    .fermata-nome { font-size: 13px; font-weight: 500; }
    .fermata-tipo { font-size: 11px; color: #888; }
    .fermata-orari { display: flex; gap: 8px; align-items: center; margin-top: 4px; font-size: 12px; }
    .teorico { color: #888; }
    .reale { font-weight: 600; color: #059669; }
    .reale.ritardo { color: #dc2626; }
    .ritardo-badge { font-size: 11px; padding: 1px 6px; border-radius: 3px; font-weight: 600; }
    .ritardo-badge.ok { background: #d1fae5; color: #065f46; }
    .ritardo-badge.ko { background: #fee2e2; color: #991b1b; }
    .binario { font-size: 11px; color: #888; margin-top: 2px; }
  `]
})
export class TrainDetailComponent {
  treno = input.required<DettaglioTreno>();
  refreshCountdown = input(0);
  countdownOffset = input(0);

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
    return !!f.partenzaReale || !!f.arrivoReale;
  }

  tipoFermataLabel(tipo: string): string {
    switch (tipo) {
      case 'P': return 'Partenza';
      case 'A': return 'Arrivo';
      case 'F': return 'Fermata';
      default: return '';
    }
  }
}
