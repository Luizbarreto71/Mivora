/**
 * Vocabulary of the skin analysis, shared by the AI schema, the recommendation engine and the UI.
 * Cosmetic and visual only: no medical terms, no diagnoses.
 */

export const CHARACTERISTICS = ["hidratacao", "oleosidade", "textura", "poros", "uniformidade", "manchas", "vermelhidao", "olhos", "linhas"] as const;
export type Characteristic = (typeof CHARACTERISTICS)[number];

export const CHARACTERISTIC_LABEL: Record<Characteristic, string> = {
  hidratacao: "Hidratação",
  oleosidade: "Oleosidade",
  textura: "Textura",
  poros: "Poros",
  uniformidade: "Uniformidade do tom",
  manchas: "Manchas e marcas",
  vermelhidao: "Vermelhidão",
  olhos: "Região dos olhos",
  linhas: "Linhas finas",
};

/** What the photo showed for one characteristic */
export const OBSERVATION_STATUS = ["evidente", "leve", "nao_observado", "sem_evidencia"] as const;
export type ObservationStatus = (typeof OBSERVATION_STATUS)[number];

export const OBSERVATION_STATUS_LABEL: Record<ObservationStatus, string> = {
  evidente: "Merece atenção",
  leve: "Sinais leves",
  nao_observado: "Sem sinais aparentes",
  sem_evidencia: "Não foi possível avaliar",
};

export const NEEDS = ["hidratacao", "oleosidade_poros", "uniformidade_manchas", "luminosidade", "conforto", "area_dos_olhos", "linhas_finas"] as const;
export type SkinNeed = (typeof NEEDS)[number];

export const NEED_LABEL: Record<SkinNeed, string> = {
  hidratacao: "Hidratação",
  oleosidade_poros: "Oleosidade e poros",
  uniformidade_manchas: "Uniformidade e aparência de manchas",
  luminosidade: "Luminosidade e viço",
  conforto: "Conforto da pele",
  area_dos_olhos: "Área dos olhos",
  linhas_finas: "Linhas finas e firmeza",
};

/** The store's own "concern" categories (Painel → Categorias) that answer each need */
export const NEED_CATEGORIES: Record<SkinNeed, string[]> = {
  hidratacao: ["hidratacao"],
  oleosidade_poros: ["poros-e-oleosidade"],
  uniformidade_manchas: ["aparencia-de-manchas", "luminosidade"],
  luminosidade: ["luminosidade"],
  conforto: ["pele-sensivel"],
  area_dos_olhos: ["area-dos-olhos"],
  linhas_finas: ["firmeza-e-linhas-finas"],
};

export const PRIORITIES = ["alta", "media", "baixa"] as const;
export type NeedPriority = (typeof PRIORITIES)[number];
export const PRIORITY_WEIGHT: Record<NeedPriority, number> = { alta: 3, media: 2, baixa: 1 };

export const ROUTINE_STEPS = ["limpeza", "tonico", "tratamento", "olhos", "hidratante", "mascara", "protetor"] as const;
export type RoutineStep = (typeof ROUTINE_STEPS)[number];

export const ROUTINE_STEP_LABEL: Record<RoutineStep, string> = {
  limpeza: "Limpeza",
  tonico: "Tônico",
  tratamento: "Tratamento",
  olhos: "Área dos olhos",
  hidratante: "Hidratação",
  mascara: "Máscara",
  protetor: "Proteção solar",
};

export const ROUTINE_TIMES = ["manha", "noite", "ambos"] as const;
export type RoutineTime = (typeof ROUTINE_TIMES)[number];

/** Product-type categories → routine step (subcategories inherit through their parent's slug) */
export const TYPE_STEP: Record<string, RoutineStep> = {
  limpeza: "limpeza",
  "tonicos-e-discos": "tonico",
  "seruns-e-ampolas": "tratamento",
  "cuidados-com-os-olhos": "olhos",
  "cuidados-especificos": "tratamento",
  hidratantes: "hidratante",
  mascaras: "mascara",
  "protecao-solar": "protetor",
};

/** Image problems the AI reports instead of an analysis */
export const IMAGE_PROBLEMS = ["sem_rosto", "varios_rostos", "rosto_cortado", "muito_escura", "desfocada", "filtro_ou_edicao", "nao_e_foto", "rosto_coberto"] as const;
export type ImageProblem = (typeof IMAGE_PROBLEMS)[number];

export const IMAGE_PROBLEM_MESSAGE: Record<ImageProblem, string> = {
  sem_rosto: "Não encontramos um rosto na foto. Envie uma foto do seu rosto, de frente.",
  varios_rostos: "A foto tem mais de uma pessoa. Envie uma foto só com o seu rosto.",
  rosto_cortado: "O rosto aparece cortado ou muito pequeno. Centralize o rosto na moldura e tente de novo.",
  muito_escura: "A foto está escura demais para observar a pele. Procure uma luz natural ou uniforme.",
  desfocada: "A foto está desfocada. Segure o celular firme e tente de novo.",
  filtro_ou_edicao: "A foto parece ter filtro ou edição, o que esconde a textura da pele. Envie uma foto sem filtros.",
  nao_e_foto: "A imagem não parece ser uma foto real de um rosto. Envie uma foto tirada com a câmera.",
  rosto_coberto: "Parte importante do rosto está coberta. Tire óculos escuros, máscara ou cabelo da frente e tente de novo.",
};
