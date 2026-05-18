import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Stazione, CercaStazione } from '../models/stazione';
import { DettaglioTreno, DisambiguaTreno, Partenza } from '../models/treno';

function getApiBase(): string {
  const host = window.location.host;
  if (host === 'localhost:4200' || host === '127.0.0.1:4200') {
    return 'http://localhost:8080/api';
  }
  return '/tracker/api';
}

@Injectable({ providedIn: 'root' })
export class ApiService {
  private base = getApiBase();

  constructor(private http: HttpClient) {}

  getStazioni(): Observable<Stazione[]> {
    return this.http.get<Stazione[]>(`${this.base}/stazioni`);
  }

  cercaStazioni(query: string): Observable<CercaStazione[]> {
    return this.http.get<CercaStazione[]>(`${this.base}/cerca`, { params: { query } });
  }

  getPartenze(stazione: string): Observable<Partenza[]> {
    return this.http.get<Partenza[]>(`${this.base}/partenze`, { params: { stazione } });
  }

  getArrivi(stazione: string): Observable<Partenza[]> {
    return this.http.get<Partenza[]>(`${this.base}/arrivi`, { params: { stazione } });
  }

  cercaTreno(num: string): Observable<DettaglioTreno | { disambigua: DisambiguaTreno[] }> {
    return this.http.get<DettaglioTreno | { disambigua: DisambiguaTreno[] }>(
      `${this.base}/treno`,
      { params: { num } }
    );
  }

  getAndamentoTreno(num: string, codOrigine: string, data?: string): Observable<DettaglioTreno> {
    const params: any = { num, orig: codOrigine };
    if (data) params.data = data;
    return this.http.get<DettaglioTreno>(`${this.base}/treno`, { params });
  }
}
