import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/store/breadcrumbs";
import { SkinAnalysisFlow } from "@/components/store/skin/skin-analysis-flow";
import { getStoreSettings } from "@/lib/catalog/queries";
import { skinAiConfigured } from "@/lib/skin/ai";

export const metadata: Metadata = {
  title: "Análise de Pele com IA",
  description: "Envie uma foto do seu rosto, receba uma análise visual cosmética da pele e descubra produtos da MIVORA para a sua rotina de skincare.",
  alternates: { canonical: "/analise-de-pele" },
};

export default async function SkinAnalysisPage() {
  const settings = await getStoreSettings();
  return (
    <div className="container-page py-8 sm:py-12">
      <Breadcrumbs items={[{ label: "Análise de Pele com IA" }]} className="mb-8" />
      <SkinAnalysisFlow available={settings.skin_analysis_enabled && skinAiConfigured()} intervalDays={settings.skin_popup_interval_days} />
    </div>
  );
}
