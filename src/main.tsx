import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { InsanityExperience } from "@/components/insanity/InsanityExperience";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <InsanityExperience />
  </StrictMode>,
);
