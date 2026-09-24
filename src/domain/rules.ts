// 业务规则：车次、报名、退位递补、改期与司放员/路线变更后的重新确认。
// 本文件只做纯函数计算，不接触存储与页面。

export type TicketStatus = "confirmed" | "waitlisted" | "invalid" | "withdrawn";

export const STATUS_LABEL: Record<TicketStatus, string> = {
  confirmed: "已确认",
  waitlisted: "候补中",
  invalid: "待重新确认",
  withdrawn: "已退位",
};

export interface Trip {
  id: string;
  name: string; // 车次名
  releasePoint: string; // 训放点
  route: string; // 路线
  departAt: string; // 出发时间，datetime-local 格式
  officer: string; // 司放员
  capacity: number; // 可载笼数
  createdAt: string;
}

export interface Ticket {
  id: string;
  tripId: string;
  ring: string; // 足环号，一个足环占一个笼位
  owner: string; // 鸽主
  status: TicketStatus;
  seq: number; // 全局报名顺序，候补递补按此排序
  confirmedAt: string | null;
  updatedAt: string;
}

export type ArchiveKind =
  | "trip_created"
  | "trip_updated"
  | "rescheduled"
  | "registered"
  | "waitlisted"
  | "withdrawn"
  | "promoted"
  | "invalidated"
  | "reconfirmed";

export const EVENT_LABEL: Record<ArchiveKind, string> = {
  trip_created: "开车次",
  trip_updated: "车次调整",
  rescheduled: "改期",
  registered: "报名",
  waitlisted: "候补",
  withdrawn: "退位留档",
  promoted: "候补递补",
  invalidated: "车票失效",
  reconfirmed: "重新确认",
};

export interface ArchiveEvent {
  id: string;
  at: string;
  tripId: string;
  ring?: string;
  kind: ArchiveKind;
  detail: string;
}

export interface BoardState {
  trips: Trip[];
  tickets: Ticket[];
  events: ArchiveEvent[];
  nextSeq: number;
}

// ---------- 查询辅助 ----------

export function tripById(state: BoardState, tripId: string): Trip {
  const trip = state.trips.find((t) => t.id === tripId);
  if (!trip) throw new Error("车次不存在");
  return trip;
}

export function ticketsOf(state: BoardState, tripId: string): Ticket[] {
  return state.tickets.filter((t) => t.tripId === tripId);
}

/** 占着笼位的票：已确认 + 失效待确认（失效票仍保留笼位，等鸽主重新确认） */
export function seatHolders(state: BoardState, tripId: string): Ticket[] {
  return ticketsOf(state, tripId).filter(
    (t) => t.status === "confirmed" || t.status === "invalid"
  );
}

export function waitlistOf(state: BoardState, tripId: string): Ticket[] {
  return ticketsOf(state, tripId)
    .filter((t) => t.status === "waitlisted")
    .sort((a, b) => a.seq - b.seq);
}

// ---------- 内部工具 ----------

function pushEvent(state: BoardState, ev: Omit<ArchiveEvent, "id">): BoardState {
  const event: ArchiveEvent = { ...ev, id: `E-${state.nextSeq}` };
  return {
    ...state,
    nextSeq: state.nextSeq + 1,
    events: [...state.events, event],
  };
}

function patchTicket(
  state: BoardState,
  ticketId: string,
  patch: Partial<Ticket>
): BoardState {
  return {
    ...state,
    tickets: state.tickets.map((t) =>
      t.id === ticketId ? { ...t, ...patch } : t
    ),
  };
}

/** 笼位有空余时，按报名顺序把最早候补补上来 */
function promoteWhileFree(
  state: BoardState,
  tripId: string,
  now: string
): BoardState {
  let next = state;
  for (;;) {
    const trip = tripById(next, tripId);
    if (seatHolders(next, tripId).length >= trip.capacity) return next;
    const [head] = waitlistOf(next, tripId);
    if (!head) return next;
    next = patchTicket(next, head.id, {
      status: "confirmed",
      confirmedAt: now,
      updatedAt: now,
    });
    next = pushEvent(next, {
      at: now,
      tripId,
      ring: head.ring,
      kind: "promoted",
      detail: `${head.ring}（${head.owner}）由候补递补上车，占 1 笼位`,
    });
  }
}

// ---------- 规则动作 ----------

export interface TripInput {
  name: string;
  releasePoint: string;
  route: string;
  departAt: string;
  officer: string;
  capacity: number;
}

export function createTrip(
  state: BoardState,
  input: TripInput,
  now: string
): BoardState {
  const name = input.name.trim();
  const releasePoint = input.releasePoint.trim();
  const route = input.route.trim();
  const officer = input.officer.trim();
  if (!name) throw new Error("请填写车次名称");
  if (!releasePoint) throw new Error("请填写训放点");
  if (!route) throw new Error("请填写路线");
  if (!input.departAt) throw new Error("请选择出发时间");
  if (!officer) throw new Error("请填写司放员");
  if (!Number.isInteger(input.capacity) || input.capacity < 1)
    throw new Error("可载笼数至少为 1");

  const trip: Trip = {
    id: `C-${state.nextSeq}`,
    name,
    releasePoint,
    route,
    departAt: input.departAt,
    officer,
    capacity: input.capacity,
    createdAt: now,
  };
  const next: BoardState = {
    ...state,
    nextSeq: state.nextSeq + 1,
    trips: [...state.trips, trip],
  };
  return pushEvent(next, {
    at: now,
    tripId: trip.id,
    kind: "trip_created",
    detail: `开车次「${name}」：${releasePoint} · ${route} · ${officer} 司放 · 限 ${input.capacity} 笼`,
  });
}

export interface RegisterInput {
  tripId: string;
  ring: string;
  owner: string;
}

export function register(
  state: BoardState,
  input: RegisterInput,
  now: string
): BoardState {
  const trip = tripById(state, input.tripId);
  const ring = input.ring.trim();
  const owner = input.owner.trim() || "未署名";
  if (!ring) throw new Error("请填写足环号");
  const duplicated = state.tickets.some(
    (t) => t.tripId === trip.id && t.ring === ring && t.status !== "withdrawn"
  );
  if (duplicated) throw new Error(`${ring} 已在本车次报名，请勿重复占笼`);

  const full = seatHolders(state, trip.id).length >= trip.capacity;
  const status: TicketStatus = full ? "waitlisted" : "confirmed";
  const ticket: Ticket = {
    id: `P-${state.nextSeq}`,
    tripId: trip.id,
    ring,
    owner,
    status,
    seq: state.nextSeq,
    confirmedAt: status === "confirmed" ? now : null,
    updatedAt: now,
  };
  let next: BoardState = {
    ...state,
    nextSeq: state.nextSeq + 1,
    tickets: [...state.tickets, ticket],
  };
  next = pushEvent(next, {
    at: now,
    tripId: trip.id,
    ring,
    kind: status === "confirmed" ? "registered" : "waitlisted",
    detail:
      status === "confirmed"
        ? `${ring}（${owner}）报名成功，占 1 笼位`
        : `车次已满员，${ring}（${owner}）按报名顺序进入候补`,
  });
  return next;
}

export function withdraw(
  state: BoardState,
  ticketId: string,
  now: string
): BoardState {
  const ticket = state.tickets.find((t) => t.id === ticketId);
  if (!ticket) throw new Error("报名记录不存在");
  if (ticket.status === "withdrawn") throw new Error("该报名已退位");

  const wasSeatHolder =
    ticket.status === "confirmed" || ticket.status === "invalid";
  let next = patchTicket(state, ticketId, {
    status: "withdrawn",
    updatedAt: now,
  });
  next = pushEvent(next, {
    at: now,
    tripId: ticket.tripId,
    ring: ticket.ring,
    kind: "withdrawn",
    detail: `${ticket.ring}（${ticket.owner}）退位，原报名留档可查`,
  });
  // 退位空出笼位后，最早候补补上
  if (wasSeatHolder) next = promoteWhileFree(next, ticket.tripId, now);
  return next;
}

export interface TripPatch {
  releasePoint?: string;
  route?: string;
  departAt?: string;
  officer?: string;
  capacity?: number;
}

export function updateTrip(
  state: BoardState,
  tripId: string,
  patch: TripPatch,
  now: string
): BoardState {
  const trip = tripById(state, tripId);
  const nextTrip: Trip = { ...trip };

  if (patch.releasePoint !== undefined) {
    const v = patch.releasePoint.trim();
    if (!v) throw new Error("训放点不能为空");
    nextTrip.releasePoint = v;
  }
  if (patch.route !== undefined) {
    const v = patch.route.trim();
    if (!v) throw new Error("路线不能为空");
    nextTrip.route = v;
  }
  if (patch.departAt !== undefined) {
    if (!patch.departAt) throw new Error("出发时间不能为空");
    nextTrip.departAt = patch.departAt;
  }
  if (patch.officer !== undefined) {
    const v = patch.officer.trim();
    if (!v) throw new Error("司放员不能为空");
    nextTrip.officer = v;
  }
  if (patch.capacity !== undefined) {
    if (!Number.isInteger(patch.capacity) || patch.capacity < 1)
      throw new Error("可载笼数至少为 1");
    const held = seatHolders(state, tripId).length;
    if (patch.capacity < held)
      throw new Error(`可载笼数不能小于已占笼位 ${held}`);
    nextTrip.capacity = patch.capacity;
  }

  const rescheduled = nextTrip.departAt !== trip.departAt;
  const crewChanged =
    nextTrip.officer !== trip.officer || nextTrip.route !== trip.route;
  const metaChanged =
    nextTrip.releasePoint !== trip.releasePoint ||
    nextTrip.capacity !== trip.capacity;
  if (!rescheduled && !crewChanged && !metaChanged)
    throw new Error("没有需要保存的变更");

  let next: BoardState = {
    ...state,
    trips: state.trips.map((t) => (t.id === tripId ? nextTrip : t)),
  };

  if (rescheduled) {
    next = pushEvent(next, {
      at: now,
      tripId,
      kind: "rescheduled",
      detail: `改期：出发时间 ${trip.departAt.replace("T", " ")} → ${nextTrip.departAt.replace("T", " ")}`,
    });
  }
  if (metaChanged) {
    next = pushEvent(next, {
      at: now,
      tripId,
      kind: "trip_updated",
      detail: `车次调整：训放点/可载笼数更新（限 ${nextTrip.capacity} 笼）`,
    });
  }
  if (crewChanged) {
    // 司放员或路线变化后，已确认票失效，需鸽主重新确认
    const targets = next.tickets.filter(
      (t) => t.tripId === tripId && t.status === "confirmed"
    );
    next = {
      ...next,
      tickets: next.tickets.map((t) =>
        t.tripId === tripId && t.status === "confirmed"
          ? { ...t, status: "invalid", updatedAt: now }
          : t
      ),
    };
    for (const t of targets) {
      next = pushEvent(next, {
        at: now,
        tripId,
        ring: t.ring,
        kind: "invalidated",
        detail: `司放员/路线变更（${trip.officer}→${nextTrip.officer}，${trip.route}→${nextTrip.route}），${t.ring} 已确认票失效，需重新确认`,
      });
    }
  }
  // 笼位数上调后，空出的笼位按候补顺序补上
  next = promoteWhileFree(next, tripId, now);
  return next;
}

export function reconfirm(
  state: BoardState,
  ticketId: string,
  now: string
): BoardState {
  const ticket = state.tickets.find((t) => t.id === ticketId);
  if (!ticket) throw new Error("报名记录不存在");
  if (ticket.status !== "invalid")
    throw new Error("只有失效待确认的票才需要重新确认");

  let next = patchTicket(state, ticketId, {
    status: "confirmed",
    confirmedAt: now,
    updatedAt: now,
  });
  next = pushEvent(next, {
    at: now,
    tripId: ticket.tripId,
    ring: ticket.ring,
    kind: "reconfirmed",
    detail: `${ticket.ring}（${ticket.owner}）重新确认，笼位恢复有效`,
  });
  return next;
}
