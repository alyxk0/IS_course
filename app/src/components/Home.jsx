import { useState, useEffect } from "react";
import { api } from "../api.js";
import { SheetLogo, IconButton } from "./UI.jsx";
import { Search, FileSpreadsheet, LogOut } from "./SheetIcons.jsx";
export default function Home({ user, onOpen, onLogout }) {
  const [docs, setDocs] = useState([]),
    [search, setSearch] = useState(""),
    [error, setError] = useState("");
  useEffect(() => {
    api("/documents")
      .then(setDocs)
      .catch((e) => setError(e.message));
  }, []);
  async function create() {
    try {
      const doc = await api("/documents", { method: "POST", body: {} });
      onOpen(doc.id);
    } catch (e) {
      setError(e.message);
    }
  }
  return (
    <div className="home">
      <header className="home-header">
        <SheetLogo size={30} />
        <span>Таблицы</span>
        <div className="home-search">
          <Search size={20} />
          <input
            placeholder="Поиск таблиц"
            aria-label="Поиск таблиц"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <IconButton icon={LogOut} label="Выйти" onClick={onLogout} />
        <span className="avatar" title={user.email}>
          {user.name[0].toUpperCase()}
        </span>
      </header>
      <section className="template-section">
        <div className="home-content">
          <p>Создать таблицу</p>
          <button className="blank-template" onClick={create}>
            <span className="multicolor-plus">+</span>
          </button>
          <strong>Пустая таблица</strong>
        </div>
      </section>
      <main className="home-content documents">
        <header>
          <h2>Недавние таблицы</h2>
          <span>Владелец · Последнее изменение</span>
        </header>
        {error && <p className="error">{error}</p>}
        {docs
          .filter((d) => d.title.toLowerCase().includes(search.toLowerCase()))
          .map((d) => (
            <button
              className="document-row"
              key={d.id}
              onClick={() => onOpen(d.id)}
            >
              <FileSpreadsheet color="#188038" size={25} />
              <strong>{d.title}</strong>
              <span>{d.owner === user.id ? "Я" : d.ownerName}</span>
              <time>{new Date(d.updated).toLocaleDateString("ru-RU")}</time>
            </button>
          ))}
        {!docs.length && (
          <div className="empty-docs">
            <FileSpreadsheet size={40} />
            <h3>Здесь будут ваши таблицы</h3>
            <p>Создайте первую и пригласите коллег к работе.</p>
          </div>
        )}
      </main>
    </div>
  );
}
