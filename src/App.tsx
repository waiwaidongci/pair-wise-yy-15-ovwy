// 业务文件三 · 页面：拼车席位台
// 管理员开车次、报名、退位递补、改期与车次变更；列表支持按车次 / 按足环查看，留档可查。

import { useMemo, useState } from "react";
import "./styles.css";
import {
  STATUS_LABEL,
  archivedOf,
  confirmedOf,
  createTrip,
  fmtTime,
  invalidOf,
  register,
  reconfirm,
  ticketsByRing,
  tripLabel,
  updateTrip,
  waitlistOf,
  withdraw,
  type RuleResult,
  type Ticket,
  type Trip,
} from "./rules";
import {
  fmtLogTime,
  loadStore,
  resetStore,
  saveStore,
  type Store,
} from "./archive";

type ViewTab = "trips" | "rings" | "archive";

interface Notice {
  kind: "ok" | "error";
  text: string;
}

function App() {
  const [store, setStore] = useState<Store>(loadStore);
  const [tab, setTab] = useState<ViewTab>("trips");
  const [notice, setNotice] = useState<Notice | null>(null);

  // 创建车次表单
  const [tripForm, setTripForm] = useState({
    releasePoint: "",
    route: "",
    departAt: "",
    officer: "",
    capacity: 4,
  });
  // 报名表单
  const [regForm, setRegForm] = useState({ tripId: "", ring: "", owner: "" });
  // 车次改期/变更
  const [editingTripId, setEditingTripId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ departAt: "", officer: "", route: "" });
  // 按足环查询
  const [ringQuery, setRingQuery] = useState("");

  const { board, logs } = store;

  const apply = (result: RuleResult, okText: string) => {
    if (result.error) {
      setNotice({ kind: "error", text: result.error });
      return;
    }
    setStore((prev) => {
      const next: Store = {
        board: result.board,
        logs: [...result.logs, ...prev.logs],
      };
      saveStore(next);
      return next;
    });
    setNotice({ kind: "ok", text: okText });
  };

  const stats = useMemo(() => {
    const confirmed = board.tickets.filter((t) => t.status === "confirmed").length;
    const waiting = board.tickets.filter((t) => t.status === "waitlisted").length;
    const invalid = board.tickets.filter((t) => t.status === "invalid").length;
    return { confirmed, waiting, invalid };
  }, [board]);

  const ringRows = useMemo(() => ticketsByRing(board, ringQuery), [board, ringQuery]);
  const tripOf = (id: string) => board.trips.find((t) => t.id === id);

  // ---------- 表单提交 ----------

  const submitTrip = () => {
    const result = createTrip(board, {
      releasePoint: tripForm.releasePoint,
      route: tripForm.route,
      departAt: tripForm.departAt,
      officer: tripForm.officer,
      capacity: Number(tripForm.capacity),
    });
    apply(result, "车次已创建");
    if (!result.error)
      setTripForm({ releasePoint: "", route: "", departAt: "", officer: "", capacity: 4 });
  };

  const submitRegister = () => {
    const result = register(board, regForm.tripId, regForm.ring, regForm.owner);
    apply(result, result.error ? "" : "报名已受理");
    if (!result.error) setRegForm({ ...regForm, ring: "", owner: "" });
  };

  const startEdit = (trip: Trip) => {
    setEditingTripId(trip.id);
    setEditForm({ departAt: trip.departAt, officer: trip.officer, route: trip.route });
  };

  const submitEdit = (tripId: string) => {
    const result = updateTrip(board, tripId, {
      departAt: editForm.departAt,
      officer: editForm.officer,
      route: editForm.route,
    });
    apply(result, "车次已更新");
    if (!result.error) setEditingTripId(null);
  };

  // ---------- 渲染 ----------

  const renderTicketRow = (ticket: Ticket, trip: Trip, cageNo?: number) => (
    <div className={`ticket st-${ticket.status}`} key={ticket.id}>
      <span className="cage">{cageNo ? `笼位 ${cageNo}` : "—"}</span>
      <span className="ring">{ticket.ring}</span>
      <span className="owner">{ticket.owner}</span>
      <span className={`badge st-${ticket.status}`}>{STATUS_LABEL[ticket.status]}</span>
      <span className="ops">
        {ticket.status === "invalid" && (
          <button
            className="primary small"
            onClick={() => apply(reconfirm(board, ticket.id), "已重新确认")}
          >
            重新确认
          </button>
        )}
        {(ticket.status === "confirmed" || ticket.status === "waitlisted") && (
          <button
            className="small danger"
            onClick={() => apply(withdraw(board, ticket.id), "已退位，原报名留档")}
          >
            退位
          </button>
        )}
      </span>
    </div>
  );

  const renderTrip = (trip: Trip) => {
    const confirmed = confirmedOf(board, trip.id);
    const waiting = waitlistOf(board, trip.id);
    const invalid = invalidOf(board, trip.id);
    const archived = archivedOf(board, trip.id);
    const seats = Array.from({ length: trip.capacity }, (_, i) => confirmed[i]);

    return (
      <article className="trip" key={trip.id}>
        <header>
          <div>
            <h3>{tripLabel(trip)}</h3>
            <p>
              出发 {fmtTime(trip.departAt)} · 司放员 {trip.officer} · 笼位{" "}
              {confirmed.length}/{trip.capacity}
              {trip.revision > 0 && ` · 第 ${trip.revision + 1} 版司放方案`}
            </p>
          </div>
          <div className="trip-ops">
            <button className="small" onClick={() => startEdit(trip)}>
              改期 / 变更
            </button>
          </div>
        </header>

        {editingTripId === trip.id && (
          <div className="edit-box">
            <label>
              <span>出发时间（改期不影响已确认票）</span>
              <input
                type="datetime-local"
                value={editForm.departAt}
                onChange={(e) => setEditForm({ ...editForm, departAt: e.target.value })}
              />
            </label>
            <label>
              <span>司放员（变更后已确认票失效）</span>
              <input
                value={editForm.officer}
                onChange={(e) => setEditForm({ ...editForm, officer: e.target.value })}
              />
            </label>
            <label>
              <span>路线（变更后已确认票失效）</span>
              <input
                value={editForm.route}
                onChange={(e) => setEditForm({ ...editForm, route: e.target.value })}
              />
            </label>
            <div className="edit-ops">
              <button className="primary small" onClick={() => submitEdit(trip.id)}>
                保存变更
              </button>
              <button className="small" onClick={() => setEditingTripId(null)}>
                取消
              </button>
            </div>
          </div>
        )}

        <div className="seats">
          {seats.map((ticket, i) => (
            <span
              key={i}
              className={ticket ? "seat taken" : "seat"}
              title={ticket ? `${ticket.ring} · ${ticket.owner}` : "空笼位"}
            >
              {ticket ? ticket.ring.slice(-6) : `空 ${i + 1}`}
            </span>
          ))}
        </div>

        <div className="ticket-list">
          {confirmed.map((t, i) => renderTicketRow(t, trip, i + 1))}
          {invalid.map((t) => renderTicketRow(t, trip))}
          {waiting.map((t) => renderTicketRow(t, trip))}
          {confirmed.length + invalid.length + waiting.length === 0 && (
            <p className="empty">暂无报名，左侧可登记足环。</p>
          )}
        </div>

        {archived.length > 0 && (
          <p className="archived">留档 {archived.length} 条已退位报名（见“留档”页）</p>
        )}
      </article>
    );
  };

  return (
    <main className="app">
      <section className="hero">
        <p>hxyfront-62014 · 拼车训放</p>
        <h1>拼车席位台</h1>
        <span>
          几个鸽棚拼车训放，一个足环占一个笼位。管理员开车次（训放点、路线、出发时间、司放员、可载笼数），
          满员后按确认顺序候补；退位由最早候补补上，原报名留档；司放员或路线变化后已确认票失效，需重新确认。
        </span>
      </section>

      <section className="metrics">
        <article>
          <small>开放车次</small>
          <strong>{board.trips.length}</strong>
        </article>
        <article>
          <small>已确认笼位</small>
          <strong>{stats.confirmed}</strong>
        </article>
        <article>
          <small>候补足环</small>
          <strong>{stats.waiting}</strong>
        </article>
        <article>
          <small>留档记录</small>
          <strong>{logs.length}</strong>
        </article>
      </section>

      {notice && (
        <p className={`notice ${notice.kind}`} onClick={() => setNotice(null)}>
          {notice.text}
        </p>
      )}

      <section className="workspace">
        <aside className="panel">
          <h2>开车次</h2>
          <div className="stack">
            <label>
              <span>训放点</span>
              <input
                placeholder="如：石家庄藁城"
                value={tripForm.releasePoint}
                onChange={(e) =>
                  setTripForm({ ...tripForm, releasePoint: e.target.value })
                }
              />
            </label>
            <label>
              <span>路线</span>
              <input
                placeholder="如：北线 120km"
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
                onChange={(e) =>
                  setTripForm({ ...tripForm, capacity: Number(e.target.value) })
                }
              />
            </label>
            <button className="primary" onClick={submitTrip}>
              创建车次
            </button>
          </div>

          <h2 className="gap-top">报名占笼</h2>
          <div className="stack">
            <label>
              <span>车次</span>
              <select
                value={regForm.tripId}
                onChange={(e) => setRegForm({ ...regForm, tripId: e.target.value })}
              >
                <option value="">选择车次</option>
                {board.trips.map((t) => (
                  <option key={t.id} value={t.id}>
                    {tripLabel(t)} · {fmtTime(t.departAt)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>足环号</span>
              <input
                placeholder="如：CHN-2025-010022"
                value={regForm.ring}
                onChange={(e) => setRegForm({ ...regForm, ring: e.target.value })}
              />
            </label>
            <label>
              <span>鸽主</span>
              <input
                placeholder="可留空"
                value={regForm.owner}
                onChange={(e) => setRegForm({ ...regForm, owner: e.target.value })}
              />
            </label>
            <button className="primary" onClick={submitRegister} disabled={!regForm.tripId}>
              报名
            </button>
          </div>
        </aside>

        <section className="panel">
          <div className="heading">
            <div>
              <p>席位台账</p>
              <h2>
                {tab === "trips" && "按车次查看"}
                {tab === "rings" && "按足环查看"}
                {tab === "archive" && "留档记录"}
              </h2>
            </div>
            <div className="chips">
              <button
                className={tab === "trips" ? "chip on" : "chip"}
                onClick={() => setTab("trips")}
              >
                按车次
              </button>
              <button
                className={tab === "rings" ? "chip on" : "chip"}
                onClick={() => setTab("rings")}
              >
                按足环
              </button>
              <button
                className={tab === "archive" ? "chip on" : "chip"}
                onClick={() => setTab("archive")}
              >
                留档
              </button>
            </div>
          </div>

          {tab === "trips" && (
            <div className="trips">
              {board.trips.length === 0 && <p className="empty">还没有车次，先开一个。</p>}
              {board.trips.map(renderTrip)}
            </div>
          )}

          {tab === "rings" && (
            <div>
              <label className="ring-filter">
                <span>输入足环号片段筛选</span>
                <input
                  placeholder="如：001839"
                  value={ringQuery}
                  onChange={(e) => setRingQuery(e.target.value)}
                />
              </label>
              <div className="ticket-list">
                {ringRows.length === 0 && <p className="empty">没有匹配的足环记录。</p>}
                {ringRows.map((t) => {
                  const trip = tripOf(t.tripId);
                  return (
                    <div className={`ticket st-${t.status}`} key={t.id}>
                      <span className="ring">{t.ring}</span>
                      <span className="owner">{t.owner}</span>
                      <span className="trip-name">
                        {trip ? `${tripLabel(trip)} · ${fmtTime(trip.departAt)}` : "车次已删除"}
                      </span>
                      <span className={`badge st-${t.status}`}>{STATUS_LABEL[t.status]}</span>
                      <span className="ops">
                        {t.status === "invalid" && (
                          <button
                            className="primary small"
                            onClick={() => apply(reconfirm(board, t.id), "已重新确认")}
                          >
                            重新确认
                          </button>
                        )}
                        {(t.status === "confirmed" || t.status === "waitlisted") && (
                          <button
                            className="small danger"
                            onClick={() => apply(withdraw(board, t.id), "已退位，原报名留档")}
                          >
                            退位
                          </button>
                        )}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {tab === "archive" && (
            <div className="ticket-list">
              {logs.length === 0 && <p className="empty">暂无留档。</p>}
              {logs.map((log) => (
                <div className="log" key={log.id}>
                  <span className="log-time">{fmtLogTime(log.at)}</span>
                  <span className="log-action">{log.action}</span>
                  <span className="log-detail">
                    <b>{log.tripLabel}</b>
                    {log.ring ? ` · ${log.ring}` : ""} · {log.detail}
                  </span>
                </div>
              ))}
              <button
                className="small danger reset"
                onClick={() => {
                  const fresh = resetStore();
                  setStore(fresh);
                  setNotice({ kind: "ok", text: "已重置为演示数据" });
                }}
              >
                清空并恢复演示数据
              </button>
            </div>
          )}
        </section>
      </section>
    </main>
  );
}

export default App;
