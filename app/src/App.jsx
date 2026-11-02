import { useState, useEffect } from "react";
import { api } from "./api.js";
import { SheetLogo } from "./components/UI.jsx";
import Auth from "./components/Auth.jsx";
import Home from "./components/Home.jsx";
import Editor from "./Editor.jsx";
function App() {
  const [user, setUser] = useState(undefined),
    [docId, setDocId] = useState(
      new URLSearchParams(location.search).get("doc"),
    ),
    [error, setError] = useState("");
  useEffect(() => {
    api("/me")
      .then((d) => setUser(d.user))
      .catch((e) => {
        setError(e.message);
        setUser(null);
      });
  }, []);
  useEffect(() => {
    const listener = () =>
      setDocId(new URLSearchParams(location.search).get("doc"));
    window.addEventListener("popstate", listener);
    return () => window.removeEventListener("popstate", listener);
  }, []);
  function open(id) {
    window.history.pushState({}, "", id ? `?doc=${id}` : "/");
    setDocId(id);
  }
  if (user === undefined)
    return (
      <div className="loading">
        <SheetLogo />
        <p>Загрузка таблиц…</p>
      </div>
    );
  if (!user) return <Auth onLogin={setUser} initialError={error} />;
  return docId ? (
    <Editor
      key={docId}
      id={docId}
      user={user}
      onHome={() => open(null)}
      onLogout={() => setUser(null)}
    />
  ) : (
    <Home
      user={user}
      onOpen={open}
      onLogout={async () => {
        await api("/logout", { method: "POST" });
        setUser(null);
      }}
    />
  );
}

export default App;
