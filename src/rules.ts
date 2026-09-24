// 业务文件一 · 规则：车次、报名、候补、退位递补、票失效与重新确认
// 约定：
// - 每个足环在同一车次占一个笼位；
// - 满员后按确认顺序（seq 递增）进入候补；
// - 退位时最早候补（seq 最小）补上，原报名留档不删除；
// - 司放员或路线变化后，已确认票失效，需重新确认；仅改期不影响票。

import type { ArchiveLog } from "./archive";

export type TicketStatus = "confirmed" | "waitlisted" | "invalid" | "withdrawn";

export const STATUS_LABEL: Record<TicketStatus, string> = {
  confirmed: "已确认",
  waitlisted: "候补中",
  invalid: "待重新确认",
  withdrawn: "已退位",
};

export interface Trip {
  id: string;
  releasePoint: string; // 训放点
  route: string; // 路线
  departAt: string; // 出发时间（datetime-local）
  officer: string; // 司放员
  capacity: number; // 可载笼数
  revision: number; // 司放员/路线变更代数
  createdAt: string;
}

export interface Ticket {
  id: string;
  tripId: string;
  ring: string; // 足环号
  owner: string; // 鸽主
  status: TicketStatus;
  seq: number; // 确认顺序号，全局递增，候补递补按它排序
  revision: number; // 确认时所在的车次代数
  createdAt: string;
  updatedAt: string;
}

export interface Board {
  trips: Trip[];
  tickets: Ticket[];
  nextSeq: number;
}

export interface TripInput {
  releasePoint: string;
  route: string;
  departAt: string;
  officer: string;
  capacity: number;
}

export interface TripChange {
  departAt?: string;
  officer?: string;
  route?: string;
}

export interface RuleResult {
  board: Board;
  logs: ArchiveLog[];
  error?: string;
}

let idCounter = 0;
const genId = (prefix: string) =>
  `${prefix}-${Date.now().toString(36)}-${(idCounter++).toString(36)}`;
const stamp = () => new Date().toISOString();

export const normalizeRing = (ring: string) => ring.trim().toUpperCase();

export const tripLabel = (trip: Trip) => `${trip.releasePoint} · ${trip.route}`;

export const fmtTime = (value: string) => (value ? value.replace("T", " ") : "—");

function makeLog(
  action: ArchiveLog["action"],
  trip: Trip,
  detail: string,
  ring?: string
): ArchiveLog {
  return {
    id: genId("log"),
    at: stamp(),
    action,
    tripId: trip.id,
    tripLabel: tripLabel(trip),
    ring,
    detail,
  };
}

const fail = (board: Board, error: string): RuleResult => ({ board, logs: [], error });

// ---------- 查询 ----------

export function confirmedOf(board: Board, tripId: string): Ticket[] {
  return board.tickets
    .filter((t) => t.tripId === tripId && t.status === "confirmed")
    .sort((a, b) => a.seq - b.seq);
}

export function waitlistOf(board: Board, tripId: string): Ticket[] {
  return board.tickets
    .filter((t) => t.tripId === tripId && t.status === "waitlisted")
    .sort((a, b) => a.seq - b.seq);
}

export function invalidOf(board: Board, tripId: string): Ticket[] {
  return board.tickets
    .filter((t) => t.tripId === tripId && t.status === "invalid")
    .sort((a, b) => a.seq - b.seq);
}

export function archivedOf(board: Board, tripId: string): Ticket[] {
  return board.tickets
    .filter((t) => t.tripId === tripId && t.status === "withdrawn")
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function ticketsByRing(board: Board, ring: string): Ticket[] {
  const key = normalizeRing(ring);
  return board.tickets
    .filter((t) => !key || t.ring.includes(key))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

// ---------- 规则 ----------

export function createTrip(board: Board, input: TripInput): RuleResult {
  if (!input.releasePoint.trim()) return fail(board, "请填写训放点");
  if (!input.route.trim()) return fail(board, "请填写路线");
  if (!input.departAt) return fail(board, "请选择出发时间");
  if (!input.officer.trim()) return fail(board, "请填写司放员");
  if (!Number.isFinite(input.capacity) || input.capacity < 1)
    return fail(board, "可载笼数至少为 1");

  const trip: Trip = {
    id: genId("trip"),
    releasePoint: input.releasePoint.trim(),
    route: input.route.trim(),
    departAt: input.departAt,
    officer: input.officer.trim(),
    capacity: Math.floor(input.capacity),
    revision: 0,
    createdAt: stamp(),
  };
  const log = makeLog(
    "创建车次",
    trip,
    `发车 ${fmtTime(trip.departAt)}，司放员 ${trip.officer}，可载 ${trip.capacity} 笼`
  );
  return { board: { ...board, trips: [...board.trips, trip] }, logs: [log] };
}

export function register(
  board: Board,
  tripId: string,
  ring: string,
  owner: string
): RuleResult {
  const trip = board.trips.find((t) => t.id === tripId);
  if (!trip) return fail(board, "车次不存在");
  const ringNorm = normalizeRing(ring);
  if (!ringNorm) return fail(board, "请填写足环号");

  const dup = board.tickets.find(
    (t) => t.tripId === tripId && t.ring === ringNorm && t.status !== "withdrawn"
  );
  if (dup)
    return fail(board, `足环 ${ringNorm} 已在本车次（${STATUS_LABEL[dup.status]}）`);

  const confirmedCount = confirmedOf(board, tripId).length;
  const status: TicketStatus =
    confirmedCount < trip.capacity ? "confirmed" : "waitlisted";
  const ticket: Ticket = {
    id: genId("tk"),
    tripId,
    ring: ringNorm,
    owner: owner.trim() || "未署名",
    status,
    seq: board.nextSeq,
    revision: trip.revision,
    createdAt: stamp(),
    updatedAt: stamp(),
  };
  const detail =
    status === "confirmed"
      ? `足环 ${ringNorm} 占笼位 ${confirmedCount + 1}/${trip.capacity}`
      : `笼位已满，足环 ${ringNorm} 候补第 ${waitlistOf(board, tripId).length + 1} 位`;
  const log = makeLog(status === "confirmed" ? "报名" : "候补", trip, detail, ringNorm);

  return {
    board: {
      ...board,
      tickets: [...board.tickets, ticket],
      nextSeq: board.nextSeq + 1,
    },
    logs: [log],
  };
}

export function withdraw(board: Board, ticketId: string): RuleResult {
  const ticket = board.tickets.find((t) => t.id === ticketId);
  if (!ticket || ticket.status === "withdrawn") return fail(board, "报名记录不存在");
  const trip = board.trips.find((t) => t.id === ticket.tripId);
  if (!trip) return fail(board, "车次不存在");

  const logs: ArchiveLog[] = [
    makeLog(
      "退位",
      trip,
      `足环 ${ticket.ring} 退出（原状态：${STATUS_LABEL[ticket.status]}），原报名留档`,
      ticket.ring
    ),
  ];
  let tickets = board.tickets.map((t) =>
    t.id === ticketId
      ? { ...t, status: "withdrawn" as TicketStatus, updatedAt: stamp() }
      : t
  );

  // 只有确认票退位才腾出笼位，最早候补补上
  if (ticket.status === "confirmed") {
    const next = waitlistOf({ ...board, tickets }, trip.id)[0];
    if (next) {
      tickets = tickets.map((t) =>
        t.id === next.id
          ? {
              ...t,
              status: "confirmed" as TicketStatus,
              revision: trip.revision,
              updatedAt: stamp(),
            }
          : t
      );
      logs.push(
        makeLog("转正", trip, `最早候补足环 ${next.ring} 补上笼位`, next.ring)
      );
    }
  }
  return { board: { ...board, tickets }, logs };
}

export function updateTrip(
  board: Board,
  tripId: string,
  change: TripChange
): RuleResult {
  const trip = board.trips.find((t) => t.id === tripId);
  if (!trip) return fail(board, "车次不存在");

  const next: Trip = {
    ...trip,
    departAt: change.departAt ?? trip.departAt,
    officer: change.officer?.trim() || trip.officer,
    route: change.route?.trim() || trip.route,
  };
  const logs: ArchiveLog[] = [];
  let tickets = board.tickets;

  if (next.departAt !== trip.departAt) {
    logs.push(
      makeLog(
        "改期",
        next,
        `出发时间 ${fmtTime(trip.departAt)} → ${fmtTime(next.departAt)}，已确认票不受影响`
      )
    );
  }

  const crewChanged =
    next.officer !== trip.officer || next.route !== trip.route;
  if (crewChanged) {
    next.revision = trip.revision + 1;
    logs.push(
      makeLog(
        "车次变更",
        next,
        `司放员/路线调整（${trip.officer} · ${trip.route} → ${next.officer} · ${next.route}），已确认票失效`
      )
    );
    tickets = tickets.map((t) => {
      if (t.tripId === tripId && t.status === "confirmed") {
        logs.push(
          makeLog(
            "票失效",
            next,
            `足环 ${t.ring} 的确认票失效，需重新确认`,
            t.ring
          )
        );
        return { ...t, status: "invalid" as TicketStatus, updatedAt: stamp() };
      }
      return t;
    });
  }

  if (logs.length === 0) return fail(board, "没有实际变更");

  return {
    board: {
      ...board,
      trips: board.trips.map((t) => (t.id === tripId ? next : t)),
      tickets,
    },
    logs,
  };
}

export function reconfirm(board: Board, ticketId: string): RuleResult {
  const ticket = board.tickets.find((t) => t.id === ticketId);
  if (!ticket || ticket.status !== "invalid")
    return fail(board, "仅“待重新确认”的票可以操作");
  const trip = board.trips.find((t) => t.id === ticket.tripId);
  if (!trip) return fail(board, "车次不存在");

  const confirmedCount = confirmedOf(board, trip.id).length;
  const status: TicketStatus =
    confirmedCount < trip.capacity ? "confirmed" : "waitlisted";
  const tickets = board.tickets.map((t) =>
    t.id === ticketId
      ? {
          ...t,
          status,
          seq: board.nextSeq,
          revision: trip.revision,
          updatedAt: stamp(),
        }
      : t
  );
  const detail =
    status === "confirmed"
      ? `足环 ${ticket.ring} 重新确认，占笼位 ${confirmedCount + 1}/${trip.capacity}`
      : `笼位已满，足环 ${ticket.ring} 重新排入候补`;
  const log = makeLog("重新确认", trip, detail, ticket.ring);

  return {
    board: { ...board, tickets, nextSeq: board.nextSeq + 1 },
    logs: [log],
  };
}
