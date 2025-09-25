import { useState } from "react";
import AddMarket from "./components/AddMarket";
import ListMarket from "./components/ListMarket";
import EditMarket from "./components/EditMarket";
import type { Umbrella } from "../../../lib/umbrellaDataService";

export default function Admin() {
  const [view, setView] = useState<"list" | "add" | "edit">("list");
  const [selected, setSelected] = useState<Umbrella | null>(null);

  return (
    <div style={{ padding: 24, color: "white" }}>
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <button
          type="button"
          onClick={() => setView("list")}
          style={{
            padding: "6px 10px",
            border: "1px solid white",
            borderRadius: 6,
            background: view === "list" ? "rgba(255,255,255,0.2)" : "transparent",
            color: "white",
          }}
        >
          List
        </button>
        <button
          type="button"
          onClick={() => setView("add")}
          style={{
            padding: "6px 10px",
            border: "1px solid white",
            borderRadius: 6,
            background: view === "add" ? "rgba(255,255,255,0.2)" : "transparent",
            color: "white",
          }}
        >
          Add
        </button>
      </div>

      {view === "list" && (
        <ListMarket
          onEdit={(u) => {
            setSelected(u);
            setView("edit");
          }}
        />
      )}

      {view === "add" && <AddMarket />}

      {view === "edit" && selected && (
        <EditMarket
          umbrella={selected}
          onBack={() => {
            setView("list");
            setSelected(null);
          }}
        />
      )}
    </div>
  );
}
