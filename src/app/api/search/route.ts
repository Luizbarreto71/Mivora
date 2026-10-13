import { NextResponse, type NextRequest } from "next/server";
import { getSearchSuggestions } from "@/lib/catalog/queries";

export async function GET(request: NextRequest) {
  const q = (request.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 80);
  const data = await getSearchSuggestions(q);
  return NextResponse.json(data, {
    headers: { "Cache-Control": "public, max-age=30, s-maxage=60, stale-while-revalidate=300" },
  });
}
