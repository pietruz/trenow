export interface Stazione {
  id: string;
  nome: string;
  nome_breve: string;
  lat: number;
  lon: number;
  regione: number;
}

export interface CercaStazione {
  nomeLungo: string;
  nomeBreve: string;
  label: string | null;
  id: string;
}
