import { InstitutionalPage, institutionalMetadata } from "@/components/store/institutional-page";

export function generateMetadata() {
  return institutionalMetadata("trocas-e-devolucoes", "Trocas e Devoluções");
}

export default function Page() {
  return <InstitutionalPage slug="trocas-e-devolucoes" />;
}
