/** Placeholder home page for the Phase 1 foundation build (the vault UI is Phase 3). */
import en from "@/locales/en.json";

export default function Home() {
  return (
    <main style={{ padding: 24 }}>
      <h1>{en["app.title"]}</h1>
      <p>{en["home.intro"]}</p>
      <p>{en["home.status"]}</p>
    </main>
  );
}
