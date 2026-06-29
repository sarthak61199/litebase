import { StrictMode } from "react";
import ReactDOM from "react-dom/client";
import { App } from "./app";
import "./styles.css";

const root = document.getElementById("app")!;
ReactDOM.createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>
);
