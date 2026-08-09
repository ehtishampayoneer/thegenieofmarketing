"use client";

// /showcase — the public pitch page. Renders the shared Showcase component in its
// standalone (marketing) mode. The same component is embedded in onboarding right
// after the URL is entered (see app/welcome/page.js).

import { Showcase } from "@/components/Showcase";

export default function ShowcasePage() {
  return <Showcase />;
}
