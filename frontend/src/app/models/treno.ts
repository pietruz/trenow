export interface Fermata {
  id: string;
  stazione: string;
  tipoFermata: 'P' | 'A' | 'F';
  ritardo: number;
  ritardoArrivo: number | null;
  ritardoPartenza: number | null;
  arrivoReale: number | null;
  partenzaReale: number | null;
  partenza_teorica: number | null;
  arrivo_teorico: number | null;
  programmata: number | null;
  actualFermataType: number;
  binarioEffettivoArrivoDescrizione: string | null;
  binarioEffettivoPartenzaDescrizione: string | null;
  lat?: number;
  lon?: number;
}

export interface DettaglioTreno {
  numeroTreno: number;
  origine: string;
  destinazione: string;
  idOrigine: string;
  idDestinazione: string;
  orarioPartenza: number | null;
  orarioArrivo: number | null;
  compRitardo: string[];
  compRitardoAndamento: string[];
  tipoTreno: string;
  categoria?: string;
  categoriaDescrizione?: string;
  compNumeroTreno?: string;
  provvedimento: number;
  subTitle: string | null;
  stazioneUltimoRilevamento: string | null;
  oraUltimoRilevamento: number | null;
  fermate: Fermata[];
}

export interface DisambiguaTreno {
  numero: string;
  origine: string;
  codiceOrigine: string;
  timestamp: string;
}

export interface Partenza {
  numeroTreno: number;
  categoria: string;
  categoriaDescrizione: string;
  origine: string | null;
  destinazione: string;
  codOrigine: string;
  orarioPartenza: number | null;
  orarioArrivo: number | null;
  ritardo: number;
  provvedimento: number;
  binarioProgrammatoPartenzaDescrizione: string | null;
  binarioEffettivoPartenzaDescrizione: string | null;
  compRitardo: string[];
}

export interface TrenoRegione extends Partenza {
  circolante: boolean;
  nonPartito: boolean;
  arrivato: boolean;
  ultimoRilev: number | null;
  compRitardoAndamento: string[];
  compNumeroTreno?: string;
  stazionePartenza?: string | null;
  stazioneArrivo?: string | null;
}

export interface TreniRegioneResponse {
  regione: number;
  nomeRegione: string;
  timestamp: string;
  treni: TrenoRegione[];
}
