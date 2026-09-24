// 存档：席位台状态的本地持久化与示例数据，所有留档记录都保存在这里。

import type { ArchiveEvent, BoardState, Ticket, Trip } from "../domain/rules";

const STORAGE_KEY = "pigeon-carpool-board-v1";

export function loadBoard(): BoardState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as BoardState;
      if (parsed && Array.isArray(parsed.trips) && Array.isArray(parsed.tickets))
        return parsed;
    }
  } catch {
    // 本地存档损坏时回退到示例数据
  }
  return seedBoard();
}

export function saveBoard(state: BoardState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // 存储不可用时仅保留内存状态
  }
}

export function resetBoard(): BoardState {
  const fresh = seedBoard();
  saveBoard(fresh);
  return fresh;
}

function seedBoard(): BoardState {
  const trips: Trip[] = [
    {
      id: "C-1",
      name: "09-25 晨放 · 栾城线",
      releasePoint: "石家庄栾城",
      route: "京港澳高速东线",
      departAt: "2026-09-25T06:00",
      officer: "老周",
      capacity: 3,
      createdAt: "2026-09-20T10:00",
    },
    {
      id: "C-2",
      name: "09-26 午放 · 沙河线",
      releasePoint: "邢台沙河",
      route: "107 国道线",
      departAt: "2026-09-26T13:30",
      officer: "阿芳",
      capacity: 2,
      createdAt: "2026-09-21T09:30",
    },
    {
      id: "C-3",
      name: "09-27 晨放 · 衡水线",
      releasePoint: "衡水湖",
      route: "大广高速线",
      departAt: "2026-09-27T05:40",
      officer: "老周",
      capacity: 4,
      createdAt: "2026-09-22T18:20",
    },
  ];

  const tickets: Ticket[] = [
    { id: "P-4", tripId: "C-1", ring: "CHN-2024-001839", owner: "张三", status: "confirmed", seq: 4, confirmedAt: "2026-09-20T10:12", updatedAt: "2026-09-20T10:12" },
    { id: "P-5", tripId: "C-1", ring: "CHN-2024-002114", owner: "李四", status: "confirmed", seq: 5, confirmedAt: "2026-09-20T11:03", updatedAt: "2026-09-20T11:03" },
    { id: "P-6", tripId: "C-1", ring: "CHN-2022-099001", owner: "陈老四", status: "withdrawn", seq: 6, confirmedAt: "2026-09-20T12:40", updatedAt: "2026-09-21T08:15" },
    { id: "P-7", tripId: "C-1", ring: "CHN-2023-008771", owner: "王五", status: "confirmed", seq: 7, confirmedAt: "2026-09-21T08:15", updatedAt: "2026-09-21T08:15" },
    { id: "P-8", tripId: "C-1", ring: "CHN-2025-010233", owner: "赵六", status: "waitlisted", seq: 8, confirmedAt: null, updatedAt: "2026-09-21T09:02" },
    { id: "P-9", tripId: "C-2", ring: "CHN-2024-006660", owner: "孙八", status: "invalid", seq: 9, confirmedAt: "2026-09-21T10:26", updatedAt: "2026-09-21T12:00" },
    { id: "P-10", tripId: "C-2", ring: "CHN-2025-000457", owner: "钱七", status: "confirmed", seq: 10, confirmedAt: "2026-09-21T15:20", updatedAt: "2026-09-21T15:20" },
    { id: "P-11", tripId: "C-3", ring: "CHN-2024-001839", owner: "张三", status: "confirmed", seq: 11, confirmedAt: "2026-09-22T19:01", updatedAt: "2026-09-22T19:01" },
  ];

  const events: ArchiveEvent[] = [
    { id: "E-12", at: "2026-09-20T10:00", tripId: "C-1", kind: "trip_created", detail: "开车次「09-25 晨放 · 栾城线」：石家庄栾城 · 京港澳高速东线 · 老周 司放 · 限 3 笼" },
    { id: "E-13", at: "2026-09-20T10:12", tripId: "C-1", ring: "CHN-2024-001839", kind: "registered", detail: "CHN-2024-001839（张三）报名成功，占 1 笼位" },
    { id: "E-14", at: "2026-09-20T11:03", tripId: "C-1", ring: "CHN-2024-002114", kind: "registered", detail: "CHN-2024-002114（李四）报名成功，占 1 笼位" },
    { id: "E-15", at: "2026-09-20T12:40", tripId: "C-1", ring: "CHN-2022-099001", kind: "registered", detail: "CHN-2022-099001（陈老四）报名成功，占 1 笼位" },
    { id: "E-16", at: "2026-09-20T13:05", tripId: "C-1", ring: "CHN-2023-008771", kind: "waitlisted", detail: "车次已满员，CHN-2023-008771（王五）按报名顺序进入候补" },
    { id: "E-17", at: "2026-09-21T08:15", tripId: "C-1", ring: "CHN-2022-099001", kind: "withdrawn", detail: "CHN-2022-099001（陈老四）退位，原报名留档可查" },
    { id: "E-18", at: "2026-09-21T08:15", tripId: "C-1", ring: "CHN-2023-008771", kind: "promoted", detail: "CHN-2023-008771（王五）由候补递补上车，占 1 笼位" },
    { id: "E-19", at: "2026-09-21T09:02", tripId: "C-1", ring: "CHN-2025-010233", kind: "waitlisted", detail: "车次已满员，CHN-2025-010233（赵六）按报名顺序进入候补" },
    { id: "E-20", at: "2026-09-21T09:30", tripId: "C-2", kind: "trip_created", detail: "开车次「09-26 午放 · 沙河线」：邢台沙河 · 107 国道南线 · 阿芳 司放 · 限 2 笼" },
    { id: "E-21", at: "2026-09-21T10:26", tripId: "C-2", ring: "CHN-2024-006660", kind: "registered", detail: "CHN-2024-006660（孙八）报名成功，占 1 笼位" },
    { id: "E-22", at: "2026-09-21T12:00", tripId: "C-2", ring: "CHN-2024-006660", kind: "invalidated", detail: "司放员/路线变更（107 国道南线→107 国道线），CHN-2024-006660 已确认票失效，需重新确认" },
    { id: "E-23", at: "2026-09-21T15:20", tripId: "C-2", ring: "CHN-2025-000457", kind: "registered", detail: "CHN-2025-000457（钱七）报名成功，占 1 笼位" },
    { id: "E-24", at: "2026-09-22T18:20", tripId: "C-3", kind: "trip_created", detail: "开车次「09-27 晨放 · 衡水线」：衡水湖 · 大广高速线 · 老周 司放 · 限 4 笼" },
    { id: "E-25", at: "2026-09-22T19:01", tripId: "C-3", ring: "CHN-2024-001839", kind: "registered", detail: "CHN-2024-001839（张三）报名成功，占 1 笼位" },
  ];

  return { trips, tickets, events, nextSeq: 26 };
}
