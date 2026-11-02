import { useState } from "react";
import { api } from "../api.js";
import { SheetLogo } from "./UI.jsx";
export default function Auth({ onLogin, initialError }) {
  const [register, setRegister] = useState(false),
    [error, setError] = useState(initialError),
    [busy, setBusy] = useState(false);
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      onLogin(
        await api(`/auth/${register ? "register" : "login"}`, {
          method: "POST",
          body: Object.fromEntries(new FormData(e.target)),
        }),
      );
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="auth-page">
      <div className="auth-brand">
        <SheetLogo size={28} />
        <span>Таблицы</span>
      </div>
      <section className="auth-card">
        <div className="auth-intro">
          <SheetLogo size={42} />
          <h1>{register ? "Создайте аккаунт" : "Вход в аккаунт"}</h1>
          <p>
            Работайте над таблицами вместе.
            <br />
            Все изменения сохраняются автоматически.
          </p>
        </div>
        <form onSubmit={submit}>
          {register && (
            <label>
              Имя
              <input
                name="name"
                required
                autoComplete="name"
                maxLength={80}
                placeholder="Как вас зовут"
              />
            </label>
          )}
          <label>
            Электронная почта
            <input
              name="email"
              type="email"
              required
              autoComplete="email"
              placeholder="you@example.com"
            />
          </label>
          <label>
            Пароль
            <input
              name="password"
              type="password"
              required
              minLength={8}
              maxLength={128}
              autoComplete={register ? "new-password" : "current-password"}
              placeholder="Не менее 8 символов"
            />
          </label>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <div className="auth-actions">
            <button
              type="button"
              className="text-button"
              onClick={() => {
                setRegister(!register);
                setError("");
              }}
            >
              {register ? "Уже есть аккаунт" : "Создать аккаунт"}
            </button>
            <button className="primary" disabled={busy}>
              {busy ? "Подождите…" : register ? "Создать" : "Войти"}
            </button>
          </div>
        </form>
      </section>
      <footer>Открытые технологии. Ваши данные. Совместная работа.</footer>
    </main>
  );
}
