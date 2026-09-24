// 业务文件二 · 存档：留档记录类型、本地持久化与演示数据
// 退位、票失效、改期等动作都会留档，原报名永不删除。

import type { Board } from "./rules";

export type ArchiveAction =
  | "创建车次"
  | "报名"
  | "候补"
  | "转正"
  | "退位"
  | "票失效"
  | "重新确认"
  | "改期"
  | "车次变更";

export interface ArchiveLog {
  id: string;
  at: string; // ISO 时间
  action: ArchiveAction;
  tripId: string;
  tripLabel: string;
  ring?: string;
  detail: string;
}

export interface Store {
  board: Board;
  logs: ArchiveLog[];
}

const STORAGE_KEY = "hxyfront-62014-carpool-v1";

export function emptyBoard(): Board {
  return { trips: [], tickets: [], nextSeq: 1 };
}

export function loadStore(): Store {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Store;
      if (parsed && parsed.board && Array.isArray(parsed.logs)) return parsed;
    }
  } catch {
    // 本地数据损坏时回退到演示数据
  }
  return seedStore();
}

export function saveStore(store: Store): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // 存储不可用时静默失败，页面仍可用
  }
}

export function resetStore(): Store {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
  return seedStore();
}

export const fmtLogTime = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getMonth() + 1}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(
    d.getMinutes()
  )}`;
};

// ---------- 演示数据 ----------

function seedStore(): Store {
  const t = (s: string) => `2026-09-${s}:00`;
  const board: Board = {
    nextSeq: 7,
    trips: [
      {
        id: "trip-gaocheng",
        releasePoint: "石家庄藁城",
        route: "北线 120km",
        departAt: "2026-09-26T06:00",
        officer: "老周",
        capacity: 3,
        revision: 0,
        createdAt: t("20 09"),
      },
      {
        id: "trip-xushui",
        releasePoint: "保定徐水",
        route: "东北线 80km",
        departAt: "2026-09-27T06:30",
        officer: "阿斌",
        capacity: 2,
        revision: 1,
        createdAt: t("20 09"),
      },
    ],
    tickets: [
      {
        id: "tk-1",
        tripId: "trip-gaocheng",
        ring: "CHN-2024-001839",
        owner: "王建军",
        status: "confirmed",
        seq: 1,
        revision: 0,
        createdAt: t("21 08"),
        updatedAt: t("21 08"),
      },
      {
        id: "tk-2",
        tripId: "trip-gaocheng",
        ring: "CHN-2024-002114",
        owner: "李秀兰",
        status: "confirmed",
        seq: 2,
        revision: 0,
        createdAt: t("21 08"),
        updatedAt: t("21 08"),
      },
      {
        id: "tk-3",
        tripId: "trip-gaocheng",
        ring: "CHN-2023-008771",
        owner: "赵德柱",
        status: "confirmed",
        seq: 3,
        revision: 0,
        createdAt: t("21 09"),
        updatedAt: t("21 09"),
      },
      {
        id: "tk-4",
        tripId: "trip-gaocheng",
        ring: "CHN-2025-010020",
        owner: "陈立",
        status: "waitlisted",
        seq: 4,
        revision: 0,
        createdAt: t("21 10"),
        updatedAt: t("21 10"),
      },
      {
        id: "tk-5",
        tripId: "trip-gaocheng",
        ring: "CHN-2025-010021",
        owner: "刘敏",
        status: "waitlisted",
        seq: 5,
        revision: 0,
        createdAt: t("21 11"),
        updatedAt: t("21 11"),
      },
      {
        id: "tk-6",
        tripId: "trip-xushui",
        ring: "CHN-2024-005566",
        owner: "孙国强",
        status: "invalid",
        seq: 6,
        revision: 0,
        createdAt: t("22 07"),
        updatedAt: t("22 20"),
      },
      {
        id: "tk-7",
        tripId: "trip-xushui",
        ring: "CHN-2022-099001",
        owner: "周海燕",
        status: "withdrawn",
        seq: 0,
        revision: 0,
        createdAt: t("21 15"),
        updatedAt: t("22 08"),
      },
    ],
  };
  const logs: ArchiveLog[] = [
    {
      id: "log-seed-1",
      at: t("20 09"),
      action: "创建车次",
      tripId: "trip-gaocheng",
      tripLabel: "石家庄藁城 · 北线 120km",
      detail: "发车 2026-09-26 06:00，司放员 老周，可载 3 笼",
    },
    {
      id: "log-seed-2",
      at: t("20 09"),
      action: "创建车次",
      tripId: "trip-xushui",
      tripLabel: "保定徐水 · 东北线 80km",
      detail: "发车 2026-09-27 06:30，司放员 阿斌，可载 2 笼",
    },
    {
      id: "log-seed-3",
      at: t("22 08"),
      action: "退位",
      tripId: "trip-xushui",
      tripLabel: "保定徐水 · 东北线 80km",
      ring: "CHN-2022-099001",
      detail: "足环 CHN-2022-099001 退出（原状态：候补中），报名留档",
    },
    {
      id: "log-seed-4",
      at: t("22 20"),
      action: "车次变更",
      tripId: "trip-xushui",
      tripLabel: "保定徐水 · 东北线 80km",
      detail: "司放员/路线调整（小马 · 东线 80km → 阿斌 · 东北线 80km），已确认票失效",
    },
    {
      id: "log-seed-5",
      at: t("22 20"),
      action: "票失效",
      tripId: "trip-xushui",
      tripLabel: "保定徐水 · 东北线 80km",
      ring: "CHN-2024-005566",
      detail: "足环 CHN-2024-005566 的确认票失效，需重新确认",
    },
  ];
  return { board, logs };
}
