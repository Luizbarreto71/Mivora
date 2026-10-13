import { InstitutionalPage, institutionalMetadata } from "@/components/store/institutional-page";

export function generateMetadata() {
  return institutionalMetadata("politica-de-privacidade", "Política de Privacidade");
}

export default function Page() {
  return <InstitutionalPage slug="politica-de-privacidade" />;
}
