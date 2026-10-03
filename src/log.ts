/**
 * log.ts — nhật ký JSON mọi lệnh và sự kiện.
 *
 * Theo spec mục 1b: mỗi lệnh qua dispatcher ghi `{ t, cmd, args, ok, durationMs }`,
 * xuất được ra file JSON. Đây vừa là bằng chứng kiểm thử, vừa là dữ liệu để sau
 * này AI học cách Boss ra lệnh.
 */
import type { EventBusLike, Result, StageEvent } from './api/types';

export interface BanGhiLenh {
  t: number;
  loai: 'lenh';
  cmd: string;
  args: Record<string, unknown>;
  ok: boolean;
  durationMs: number;
  nguon: string;
  result?: unknown;
  error?: string;
}

export interface BanGhiSuKien {
  t: number;
  loai: 'su-kien';
  event: string;
  data: Record<string, unknown>;
}

export type BanGhi = BanGhiLenh | BanGhiSuKien;

/** Giữ tối đa bao nhiêu bản ghi trong bộ nhớ (xuất file vẫn đủ dùng). */
const TRAN = 2000;

export class NhatKy {
  private ds: BanGhi[] = [];
  private nghe = new Set<(b: BanGhi) => void>();

  /** Tự ghi mọi sự kiện từ bus. */
  theoBus(bus: EventBusLike): void {
    bus.on('*', (e: StageEvent) => {
      this.them({ t: e.t, loai: 'su-kien', event: e.event, data: e.data });
    });
  }

  ghiLenh(
    cmd: string,
    args: Record<string, unknown>,
    kq: Result,
    durationMs: number,
    nguon = 'ui',
  ): void {
    this.them({
      t: Date.now(),
      loai: 'lenh',
      cmd,
      args,
      ok: kq.ok,
      durationMs,
      nguon,
      ...(kq.ok ? { result: kq.result } : { error: kq.error }),
    });
  }

  private them(b: BanGhi): void {
    this.ds.push(b);
    if (this.ds.length > TRAN) this.ds.shift();
    for (const fn of Array.from(this.nghe)) fn(b);
  }

  onThem(fn: (b: BanGhi) => void): () => void {
    this.nghe.add(fn);
    return () => this.nghe.delete(fn);
  }

  tatCa(): BanGhi[] {
    return [...this.ds];
  }

  xoa(): void {
    this.ds = [];
  }

  toJSON(): string {
    return JSON.stringify(
      { version: '0.1', xuatLuc: new Date().toISOString(), banGhi: this.ds },
      null,
      2,
    );
  }

  /** Tải file JSON xuống máy (nút "Xuất JSON" trên UI). */
  xuatFile(ten = `gen-stage-log-${Date.now()}.json`): void {
    const blob = new Blob([this.toJSON()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = ten;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
}
