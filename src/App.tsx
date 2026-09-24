import { useMemo, useState } from "react";
import "./styles.css";
import {
  EVENT_LABEL,
  STATUS_LABEL,
  createTrip,
  reconfirm,
  register,
  updateTrip,
  withdraw,
  type BoardState,
  type Ticket,
  type Trip,
  type TripPatch,
} from "./domain/rules";
import { loadBoard, resetBoard, saveBoard } from "./data/archive";

function nowLocal(): string {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

function fmt(t: string | null): string {
  return t ? t.replace("T", " ") : "—";
}

type Tab = "trips" | "rings" | "archive";

const emptyTripForm = {
  name: "",
  releasePoint: "",
  route: "",
  departAt: "",
  officer: "",
  capacity: "4",
};

function App() {
  const [board, setBoard] = useState<BoardState>(loadBoard);
  const [tab, setTab] = useState<Tab>("trips");
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [tripForm, setTripForm] = useState(emptyTripForm);

  const apply = (op: (s: BoardState) => BoardState, okText: string) => {
    try {
      const next = op(board);
      setBoard(next);
      saveBoard(next);
      setMsg({ kind: "ok", text: okText });
    } catch (err) {
      setMsg({ kind: "err", text: err instanceof Error ? err.message : String(err) });
    }
  };

  const stats = useMemo(() => {
    const confirmed = board.tickets.filter((t) => t.status === "confirmed").length;
    const waitlisted = board.tickets.filter((t) => t.status === "waitlisted").length;
    const invalid = board.tickets.filter((t) => t.status === "invalid").length;
    return { trips: board.trips.length, confirmed, waitlisted, invalid };
  }, [board]);

  const submitTrip = () => {
    apply(
      (s) =>
        createTrip(
          s,
          {
            name: tripForm.name,
            releasePoint: tripForm.releasePoint,
            route: tripForm.route,
            departAt: tripForm.departAt,
            officer: tripForm.officer,
            capacity: Number(tripForm.capacity),
          },
          nowLocal()
        ),
      "车次已开通"
    );
    setTripForm(emptyTripForm);
  };

  return (
    <main className="app">
      <section className="hero">
        <p>拼车训放 · 席位台</p>
        <h1>鸽棚拼车训放席位台</h1>
        <span>
          管理员开车次、报名、撤回或改期；每个足环占一个笼位，满员后按报名顺序候补，
          退位由最早候补自动递补，原报名留档。司放员或路线变更后，已确认票失效，需重新确认。
        </span>
      </section>

      <section className="metrics">
        <article>
          <small>开放车次</small>
          <strong>{stats.trips}</strong>
        </article>
        <article>
          <small>已确认笼位</small>
          <strong>{stats.confirmed}</strong>
        </article>
        <article>
          <small>候补鸽数</small>
          <strong>{stats.waitlisted}</strong>
        </article>
        <article>
          <small>待重新确认</small>
          <strong>{stats.invalid}</strong>
        </article>
      </section>

      {msg && (
        <div className={`banner ${msg.kind}`} onClick={() => setMsg(null)}>
          {msg.text}
        </div>
      )}

      <section className="panel">
        <div className="heading">
          <div>
            <p>管理员</p>
            <h2>开车次</h2>
          </div>
          <button className="primary" onClick={submitTrip}>
            开通车次
          </button>
        </div>
        <div className="field-grid">
          <label>
            <span>车次名称</span>
            <input
              placeholder="如 09-28 晨放 · 正定线"
              value={tripForm.name}
              onChange={(e) => setTripForm({ ...tripForm, name: e.target.value })}
            />
          </label>
          <label>
            <span>训放点</span>
            <input
              placeholder="如 石家庄正定"
              value={tripForm.releasePoint}
              onChange={(e) => setTripForm({ ...tripForm, releasePoint: e.target.value })}
            />
          </label>
          <label>
            <span>路线</span>
            <input
              placeholder="如 京港澳高速西线"
              value={tripForm.route}
              onChange={(e) => setTripForm({ ...tripForm, route: e.target.value })}
            />
          </label>
          <label>
            <span>出发时间</span>
            <input
              type="datetime-local"
              value={tripForm.departAt}
              onChange={(e) => setTripForm({ ...tripForm, departAt: e.target.value })}
            />
          </label>
          <label>
            <span>司放员</span>
            <input
              placeholder="跟车司放员"
              value={tripForm.officer}
              onChange={(e) => setTripForm({ ...tripForm, officer: e.target.value })}
            />
          </label>
          <label>
            <span>可载笼数</span>
            <input
              type="number"
              min={1}
              value={tripForm.capacity}
              onChange={(e) => setTripForm({ ...tripForm, capacity: e.target.value })}
            />
          </label>
        </div>
      </section>

      <nav className="tabs">
        <button className={tab === "trips" ? "tab active" : "tab"} onClick={() => setTab("trips")}>
          按车次
        </button>
        <button className={tab === "rings" ? "tab active" : "tab"} onClick={() => setTab("rings")}>
          按足环
        </button>
        <button className={tab === "archive" ? "tab active" : "tab"} onClick={() => setTab("archive")}>
          留档记录
        </button>
      </nav>

      {tab === "trips" && (
        <section className="trip-list">
          {board.trips.map((trip) => (
            <TripCard
              key={trip.id}
              trip={trip}
              tickets={board.tickets.filter((t) => t.tripId === trip.id)}
              onRegister={(ring, owner) =>
                apply((s) => register(s, { tripId: trip.id, ring, owner }, nowLocal()), "报名已提交")
              }
              onWithdraw={(ticketId) =>
                apply((s) => withdraw(s, ticketId, nowLocal()), "已退位，候补按顺序递补")
              }
              onReconfirm={(ticketId) =>
                apply((s) => reconfirm(s, ticketId, nowLocal()), "已重新确认，笼位恢复有效")
              }
              onUpdate={(patch) =>
                apply((s) => updateTrip(s, trip.id, patch, nowLocal()), "车次已更新")
              }
            />
          ))}
          {board.trips.length === 0 && <p className="empty">还没有车次，先在上方开车次。</p>}
        </section>
      )}

      {tab === "rings" && <RingView board={board} />}

      {tab === "archive" && (
        <section className="panel">
          <div className="heading">
            <div>
              <p>留档</p>
              <h2>操作与退位存档</h2>
            </div>
            <button
              onClick={() => {
                if (window.confirm("确定清空当前数据并恢复示例存档？")) {
                  setBoard(resetBoard());
                  setMsg({ kind: "ok", text: "已恢复示例数据" });
                }
              }}
            >
              恢复示例数据
            </button>
          </div>
          <div className="records">
            {[...board.events].reverse().map((ev) => (
              <article key={ev.id}>
                <b>{EVENT_LABEL[ev.kind]}</b>
                <div>
                  <h3>
                    {ev.ring ?? board.trips.find((t) => t.id === ev.tripId)?.name ?? ev.tripId}
                  </h3>
                  <p>
                    {fmt(ev.at)} · {board.trips.find((t) => t.id === ev.tripId)?.name ?? "已删除车次"} ·{" "}
                    {ev.detail}
                  </p>
                </div>
              </article>
            ))}
            {board.events.length === 0 && <p className="empty">暂无留档。</p>}
          </div>
        </section>
      )}
    </main>
  );
}

function TripCard(props: {
  trip: Trip;
  tickets: Ticket[];
  onRegister: (ring: string, owner: string) => void;
  onWithdraw: (ticketId: string) => void;
  onReconfirm: (ticketId: string) => void;
  onUpdate: (patch: TripPatch) => void;
}) {
  const { trip, tickets } = props;
  const holders = tickets
    .filter((t) => t.status === "confirmed" || t.status === "invalid")
    .sort((a, b) => a.seq - b.seq);
  const waiters = tickets
    .filter((t) => t.status === "waitlisted")
    .sort((a, b) => a.seq - b.seq);
  const withdrawnCount = tickets.filter((t) => t.status === "withdrawn").length;

  const [reg, setReg] = useState({ ring: "", owner: "" });
  const [editing, setEditing] = useState(false);
  const [edit, setEdit] = useState({
    releasePoint: trip.releasePoint,
    route: trip.route,
    departAt: trip.departAt,
    officer: trip.officer,
    capacity: String(trip.capacity),
  });

  const crewChanged = edit.officer !== trip.officer || edit.route !== trip.route;
  const occupancy = Math.min(100, Math.round((holders.length / trip.capacity) * 100));

  const submitEdit = () => {
    props.onUpdate({
      releasePoint: edit.releasePoint,
      route: edit.route,
      departAt: edit.departAt,
      officer: edit.officer,
      capacity: Number(edit.capacity),
    });
    setEditing(false);
  };

  return (
    <article className="panel trip-card">
      <div className="heading">
        <div>
          <p>{trip.name}</p>
          <h2>
            {trip.releasePoint} · {fmt(trip.departAt)}
          </h2>
          <p className="meta">
            路线 {trip.route} · 司放员 {trip.officer} · 笼位 {holders.length}/{trip.capacity}
            {waiters.length > 0 && ` · 候补 ${waiters.length}`}
            {withdrawnCount > 0 && ` · 退位留档 ${withdrawnCount}`}
          </p>
        </div>
        <button onClick={() => setEditing(!editing)}>{editing ? "收起" : "改期 / 调整"}</button>
      </div>

      <div className="seat-bar">
        <i style={{ width: `${occupancy}%` }} />
      </div>

      <div className="ticket-table">
        {holders.map((t, i) => (
          <TicketRow
            key={t.id}
            ticket={t}
            seatNo={i + 1}
            onWithdraw={() => props.onWithdraw(t.id)}
            onReconfirm={() => props.onReconfirm(t.id)}
          />
        ))}
        {waiters.map((t, i) => (
          <TicketRow
            key={t.id}
            ticket={t}
            seatNo={null}
            queueNo={i + 1}
            onWithdraw={() => props.onWithdraw(t.id)}
            onReconfirm={() => props.onReconfirm(t.id)}
          />
        ))}
        {holders.length === 0 && waiters.length === 0 && (
          <p className="empty">暂无报名，可在下方登记足环。</p>
        )}
      </div>

      <div className="inline-form">
        <input
          placeholder="足环号，如 CHN-2026-012345"
          value={reg.ring}
          onChange={(e) => setReg({ ...reg, ring: e.target.value })}
        />
        <input
          placeholder="鸽主（选填）"
          value={reg.owner}
          onChange={(e) => setReg({ ...reg, owner: e.target.value })}
        />
        <button
          className="primary"
          onClick={() => {
            props.onRegister(reg.ring, reg.owner);
            setReg({ ring: "", owner: "" });
          }}
        >
          报名占笼
        </button>
      </div>

      {editing && (
        <div className="edit-box">
          <div className="field-grid">
            <label>
              <span>训放点</span>
              <input
                value={edit.releasePoint}
                onChange={(e) => setEdit({ ...edit, releasePoint: e.target.value })}
              />
            </label>
            <label>
              <span>路线</span>
              <input
                value={edit.route}
                onChange={(e) => setEdit({ ...edit, route: e.target.value })}
              />
            </label>
            <label>
              <span>出发时间（改期）</span>
              <input
                type="datetime-local"
                value={edit.departAt}
                onChange={(e) => setEdit({ ...edit, departAt: e.target.value })}
              />
            </label>
            <label>
              <span>司放员</span>
              <input
                value={edit.officer}
                onChange={(e) => setEdit({ ...edit, officer: e.target.value })}
              />
            </label>
            <label>
              <span>可载笼数</span>
              <input
                type="number"
                min={1}
                value={edit.capacity}
                onChange={(e) => setEdit({ ...edit, capacity: e.target.value })}
              />
            </label>
          </div>
          {crewChanged && (
            <p className="warn">
              司放员或路线变更后，本车次已确认票将全部失效，需鸽主重新确认。
            </p>
          )}
          <button className="primary" onClick={submitEdit}>
            保存车次变更
          </button>
        </div>
      )}
    </article>
  );
}

function TicketRow(props: {
  ticket: Ticket;
  seatNo: number | null;
  queueNo?: number;
  onWithdraw: () => void;
  onReconfirm: () => void;
}) {
  const { ticket } = props;
  return (
    <div className="ticket-row">
      <b>{props.seatNo !== null ? `笼 ${props.seatNo}` : `候 ${props.queueNo}`}</b>
      <div>
        <h3>{ticket.ring}</h3>
        <p>
          {ticket.owner} · 确认于 {fmt(ticket.confirmedAt)}
        </p>
      </div>
      <span className={`chip status-${ticket.status}`}>{STATUS_LABEL[ticket.status]}</span>
      <div className="row-actions">
        {ticket.status === "invalid" && (
          <button className="primary mini" onClick={props.onReconfirm}>
            重新确认
          </button>
        )}
        <button className="mini danger" onClick={props.onWithdraw}>
          退位
        </button>
      </div>
    </div>
  );
}

function RingView({ board }: { board: BoardState }) {
  const [kw, setKw] = useState("");
  const groups = useMemo(() => {
    const map = new Map<string, Ticket[]>();
    for (const t of board.tickets) {
      const list = map.get(t.ring) ?? [];
      list.push(t);
      map.set(t.ring, list);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [board]);

  const keyword = kw.trim().toLowerCase();
  const visible = keyword
    ? groups.filter(([ring]) => ring.toLowerCase().includes(keyword))
    : groups;
  const tripName = (id: string) => board.trips.find((t) => t.id === id)?.name ?? id;

  return (
    <section className="panel">
      <div className="heading">
        <div>
          <p>按足环查看</p>
          <h2>足环报名台账</h2>
        </div>
        <input
          className="search"
          placeholder="搜索足环号"
          value={kw}
          onChange={(e) => setKw(e.target.value)}
        />
      </div>
      <div className="records">
        {visible.map(([ring, list]) => (
          <article key={ring}>
            <b>{list[0].owner.slice(0, 1)}</b>
            <div>
              <h3>
                {ring} <small>（{list[0].owner}）</small>
              </h3>
              {list
                .slice()
                .sort((a, b) => a.seq - b.seq)
                .map((t) => (
                  <p key={t.id}>
                    <span className={`chip status-${t.status}`}>{STATUS_LABEL[t.status]}</span>{" "}
                    {tripName(t.tripId)} · 确认于 {fmt(t.confirmedAt)}
                  </p>
                ))}
            </div>
          </article>
        ))}
        {visible.length === 0 && <p className="empty">没有匹配的足环。</p>}
      </div>
    </section>
  );
}

export default App;
