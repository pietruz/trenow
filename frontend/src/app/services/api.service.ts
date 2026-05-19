import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Stazione, CercaStazione } from '../models/stazione';
import { DettaglioTreno, DisambiguaTreno, Partenza } from '../models/treno';

function isDev(): boolean {
  const host = window.location.host;
  return host === 'localhost:4200' || host === '127.0.0.1:4200';
}

function getApiBase(): string {
  if (isDev()) return 'http://localhost:8080/api';
  return '/tracker/api';
}

function endpoint(path: string): string {
  return `${getApiBase()}/${path}${isDev() ? '' : '.php'}`;
}

@Injectable({ providedIn: 'root' })
export class ApiService {
  constructor(private http: HttpClient) {}

  getStazioni(): Observable<Stazione[]> {
    return this.http.get<Stazione[]>(endpoint('stazioni'));
  }

  cercaStazioni(query: string): Observable<CercaStazione[]> {
    return this.http.get<CercaStazione[]>(endpoint('cerca'), { params: { query } });
  }

  getPartenze(stazione: string): Observable<Partenza[]> {
    return this.http.get<Partenza[]>(endpoint('partenze'), { params: { stazione } });
  }

  getArrivi(stazione: string): Observable<Partenza[]> {
    return this.http.get<Partenza[]>(endpoint('arrivi'), { params: { stazione } });
  }

  cercaTreno(num: string): Observable<DettaglioTreno | { disambigua: DisambiguaTreno[] }> {
    return this.http.get<DettaglioTreno | { disambigua: DisambiguaTreno[] }>(
      endpoint('treno'),
      { params: { num } }
    );
  }

  getAndamentoTreno(num: string, codOrigine: string, data?: string): Observable<DettaglioTreno> {
    const params: any = { num, orig: codOrigine };
    if (data) params.data = data;
    return this.http.get<DettaglioTreno>(endpoint('treno'), { params });
  }
}
