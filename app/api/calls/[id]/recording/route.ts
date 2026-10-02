import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { toneWav } from "@/lib/wav";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new Response("Sign in required", { status: 401 });
  const { id } = await context.params;
  const call = await prisma.call.findUnique({ where: { id } });
  if (!call) return new Response("Not found", { status: 404 });
  const wav = toneWav(Math.min(3, Math.max(0.6, call.durationSec / 40 || 1.2)), 340 + (call.durationSec % 80));
  return new Response(wav, {
    headers: { "Content-Type": "audio/wav", "Cache-Control": "private, max-age=3600" },
  });
}
