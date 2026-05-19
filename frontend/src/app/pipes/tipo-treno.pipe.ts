import { Pipe, PipeTransform } from '@angular/core';

const TIPO_TRENO_MAP: Record<string, string> = {
  'R': 'Regionale',
  'FR': 'Frecciarossa',
  'FB': 'Frecciabianca',
  'FA': 'Frecciargento',
  'ES': 'Eurostar',
  'IC': 'Intercity',
  'ICN': 'Intercity Notte',
  'RER': 'Regionale Express',
  'RV': 'Regionale Veloce',
  'S': 'Suburbano',
  'EB': 'Eurocity',
  'EC': 'Eurocity',
  'EN': 'Eurocity Notte',
  'TB': 'Treno + Bus',
  'EX': 'Espresso',
  'REG': 'Regionale',
  'EXP': 'Express',
};

@Pipe({
  name: 'tipoTrenoLabel',
  standalone: true,
})
export class TipoTrenoLabelPipe implements PipeTransform {
  transform(tipo: string | undefined, compNumeroTreno?: string): string {
    if (!tipo) {
      if (compNumeroTreno && compNumeroTreno !== '--') {
        const firstToken = compNumeroTreno.trim().split(' ')[0];
        return TIPO_TRENO_MAP[firstToken] || firstToken;
      }
      return '';
    }
    return TIPO_TRENO_MAP[tipo] || tipo;
  }
}
