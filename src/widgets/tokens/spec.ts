/**
 * Tokenizer helpers and the Token Diet puzzle. The offline tokenizer is o200k_base (a real BPE),
 * exact for the gpt-oss models NINES calls; other families (Claude included) tokenize differently.
 */
import { z } from "zod";

export const SAMPLES: { id: string; label: string; text: string }[] = [
  { id: "en", label: "English", text: "Your order has been delivered. Enjoy your meal!" },
  { id: "te", label: "Telugu", text: "మీ ఆర్డర్ డెలివరీ చేయబడింది. మీ భోజనాన్ని ఆస్వాదించండి!" },
  { id: "hi", label: "Hindi", text: "आपका ऑर्डर डिलीवर हो गया है। अपने खाने का आनंद लें!" },
  { id: "code", label: "Python", text: "def checkout(cart):\n    return sum(i.price * i.qty for i in cart.items)" },
  { id: "json", label: "JSON", text: '{"user_id": 48213, "items": [{"sku": "A-17", "qty": 2}], "total": 1499.00}' },
  { id: "nums", label: "Numbers", text: "3.14159265 1234567890 2026-09-27" },
  { id: "straw", label: "strawberry", text: "strawberry" },
];

export const SlicerConfig = z.object({
  samples: z.array(z.string()).default(["en", "te", "code", "json", "straw"]),
  /** USD per million input tokens for the cost readout. */
  usdPerMTok: z.number().default(2),
});
export type SlicerConfig = z.infer<typeof SlicerConfig>;

// ---------------------------------------------------------------- Token Diet

export const DietConfig = z.object({
  title: z.string(),
  requestsPerDay: z.number(),
  usdPerMTok: z.number(),
  budgetTokens: z.number(),
});
export type DietConfig = z.infer<typeof DietConfig>;

export function monthlyUsd(tokens: number, perDay: number, usdPerMTok: number): number {
  return (tokens * perDay * 30 * usdPerMTok) / 1e6;
}
