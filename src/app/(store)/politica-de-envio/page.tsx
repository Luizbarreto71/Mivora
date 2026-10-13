import { InstitutionalPage, institutionalMetadata } from "@/components/store/institutional-page";

export function generateMetadata() {
  return institutionalMetadata("politica-de-envio", "Política de Envio");
}

export default function Page() {
  return <InstitutionalPage slug="politica-de-envio" />;
}
