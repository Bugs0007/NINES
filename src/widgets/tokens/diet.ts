/**
 * Token Diet scenario: Pigeon's order-support reply generator. The prompt is assembled from segments,
 * and each edit is a flag, so edits compose cleanly and tests can verify the puzzle.
 */

export interface DietEditDef {
  id: string;
  label: string;
}

export const DIET_EDITS: DietEditDef[] = [
  { id: "preamble", label: "Cut the generic 'helpful, harmless, honest' preamble" },
  { id: "examples", label: "Keep 2 example replies instead of 6" },
  { id: "fields", label: "Drop fields the task never uses" },
  { id: "keys", label: "Shorten JSON keys" },
  { id: "minify", label: "Minify the JSON (no indentation)" },
  { id: "history", label: "Send only the latest order, not all 8" },
  { id: "profile", label: "Drop the customer profile block" },
  { id: "hindi", label: "Write the instructions in Hindi" },
];

export const DIET_REQUIRED = [
  { label: "Customer's first name", mustContain: "Aarav" },
  { label: "Latest order id", mustContain: "PGN-88213" },
  { label: "Delivery city", mustContain: "Hyderabad" },
  { label: "Allergy (peanuts)", mustContain: '"peanuts"' },
];

const PREAMBLE = `You are a helpful, harmless, and honest AI assistant created to help customers. You always strive to be polite, respectful, empathetic, and professional in every single response. You never say anything offensive. You always do your very best to provide accurate, relevant, and useful information to the user, and you carefully consider their needs before answering.

`;

const TASK_EN = `Task: write a short, friendly WhatsApp-style update for the customer about their latest Pigeon Eats order. Mention the order id and delivery city. If the order contains an ingredient the customer is allergic to, warn them first. Keep it under 50 words.
`;

const TASK_HI = `कार्य: ग्राहक के नवीनतम Pigeon Eats ऑर्डर के बारे में एक छोटा, दोस्ताना WhatsApp-शैली का अपडेट लिखें। ऑर्डर आईडी और डिलीवरी शहर का उल्लेख करें। यदि ऑर्डर में कोई ऐसी सामग्री है जिससे ग्राहक को एलर्जी है, तो पहले उन्हें चेतावनी दें। इसे 50 शब्दों से कम रखें।
`;

const EXAMPLES = [
  `Example 1:\nCustomer: Priya, order PGN-10442, Pune, no allergies, items: paneer tikka, naan\nReply: Hi Priya! Your order PGN-10442 is out for delivery in Pune. Paneer tikka and naan, still warm. Enjoy!\n`,
  `Example 2:\nCustomer: Rahul, order PGN-20931, Chennai, allergy: dairy, items: masala dosa, filter coffee (with milk)\nReply: Heads up Rahul: your filter coffee in order PGN-20931 contains milk. Everything else is dairy-free and on its way to you in Chennai.\n`,
  `Example 3:\nCustomer: Sneha, order PGN-31177, Bengaluru, no allergies, items: veg biryani, raita\nReply: Hi Sneha! Order PGN-31177 is on its way in Bengaluru. Veg biryani with raita. Enjoy your lunch!\n`,
  `Example 4:\nCustomer: Imran, order PGN-40288, Lucknow, allergy: gluten, items: kebab platter, rumali roti\nReply: Imran, careful: the rumali roti in order PGN-40288 contains gluten. Your kebab platter is gluten-free and arriving soon in Lucknow.\n`,
  `Example 5:\nCustomer: Divya, order PGN-51930, Kochi, no allergies, items: appam, stew\nReply: Hi Divya! Order PGN-51930 is out for delivery in Kochi. Appam and stew, coming right up.\n`,
  `Example 6:\nCustomer: Arjun, order PGN-62014, Delhi, allergy: shellfish, items: prawn curry, jeera rice\nReply: Arjun, please note: the prawn curry in order PGN-62014 is shellfish. Jeera rice is safe. Arriving in Delhi in about 20 minutes.\n`,
];

const ORDERS = [
  { id: "PGN-88213", city: "Hyderabad", items: ["hyderabadi chicken biryani", "mirchi ka salan", "double ka meetha (contains peanuts)"], status: "out_for_delivery", eta_min: 18 },
  { id: "PGN-87102", city: "Hyderabad", items: ["idli", "vada", "sambar"], status: "delivered", eta_min: 0 },
  { id: "PGN-86455", city: "Hyderabad", items: ["pesarattu", "ginger chutney"], status: "delivered", eta_min: 0 },
  { id: "PGN-85013", city: "Hyderabad", items: ["haleem"], status: "delivered", eta_min: 0 },
  { id: "PGN-84210", city: "Secunderabad", items: ["chole bhature", "lassi"], status: "delivered", eta_min: 0 },
  { id: "PGN-83377", city: "Hyderabad", items: ["gongura mutton", "rice"], status: "delivered", eta_min: 0 },
  { id: "PGN-82902", city: "Hyderabad", items: ["pani puri"], status: "cancelled", eta_min: 0 },
  { id: "PGN-81448", city: "Hyderabad", items: ["mango lassi"], status: "delivered", eta_min: 0 },
];

function json(obj: unknown, minify: boolean): string {
  return minify ? JSON.stringify(obj) : JSON.stringify(obj, null, 2);
}

export function buildDietPrompt(flags: string[]): string {
  const f = new Set(flags);
  const k = (long: string, short: string) => (f.has("keys") ? short : long);
  const profile: Record<string, unknown> = {
    [k("customer_first_name", "name")]: "Aarav",
    [k("customer_allergies", "allergies")]: ["peanuts"],
  };
  if (!f.has("fields")) {
    profile[k("customer_account_created_at", "created")] = "2024-03-11T09:42:17.000Z";
    profile[k("customer_avatar_url", "avatar")] = "https://cdn.pigeon.app/avatars/u/48213/original.jpg";
    profile[k("customer_marketing_opt_in", "mkt")] = false;
    profile[k("customer_loyalty_tier", "tier")] = "gold";
  }
  const orders = (f.has("history") ? ORDERS.slice(0, 1) : ORDERS).map((o) => {
    const row: Record<string, unknown> = { [k("order_id", "id")]: o.id, [k("delivery_city", "city")]: o.city, [k("order_items", "items")]: o.items, [k("order_status", "status")]: o.status };
    if (!f.has("fields")) row[k("estimated_minutes_remaining", "eta")] = o.eta_min;
    return row;
  });
  const parts: string[] = [];
  if (!f.has("preamble")) parts.push(PREAMBLE);
  parts.push(f.has("hindi") ? TASK_HI : TASK_EN);
  parts.push("\n" + (f.has("examples") ? EXAMPLES.slice(0, 2) : EXAMPLES).join("\n"));
  if (!f.has("profile")) parts.push(`\nCustomer profile:\n${json(profile, f.has("minify"))}\n`);
  parts.push(`\nOrders (most recent first):\n${json(orders, f.has("minify"))}\n`);
  return parts.join("");
}
