/**
 * Message templates (spec §68).
 *
 * V1 does not automate WhatsApp — it opens the conversation with the text
 * already written, which is what an agency actually needs and costs nothing to
 * run. The Business API is explicitly V2.
 *
 * Pure string building, so the substitution can be tested and a missing variable
 * can never leak a raw `{placeholder}` to a customer.
 */

export const TEMPLATE_KEYS = [
  "confirmation",
  "pickup_reminder",
  "pickup_instructions",
  "return_reminder",
  "outstanding_payment",
] as const;

export type TemplateKey = (typeof TEMPLATE_KEYS)[number];

export type TemplateVariables = {
  customerName: string;
  agencyName: string;
  reference: string;
  vehicle: string;
  pickupAt: string;
  returnAt: string;
  pickupLocation: string;
  returnLocation: string;
  total: string;
  outstanding: string;
  agencyPhone: string;
};

type TemplateDefinition = {
  key: TemplateKey;
  label: string;
  description: string;
  body: string;
};

export const TEMPLATES: TemplateDefinition[] = [
  {
    key: "confirmation",
    label: "Confirm booking",
    description: "After the confirmation call.",
    body:
      "Hello {customerName}, this is {agencyName}.\n" +
      "Your booking {reference} is confirmed.\n\n" +
      "Car: {vehicle}\n" +
      "Collection: {pickupAt} — {pickupLocation}\n" +
      "Return: {returnAt} — {returnLocation}\n" +
      "Total: {total}\n\n" +
      "Please bring your driving licence and ID. See you soon.",
  },
  {
    key: "pickup_reminder",
    label: "Pickup reminder",
    description: "The day before collection.",
    body:
      "Hello {customerName}, a reminder from {agencyName}.\n" +
      "You are collecting the {vehicle} tomorrow at {pickupAt}, at {pickupLocation}.\n\n" +
      "Booking {reference}. Please bring your driving licence and ID.",
  },
  {
    key: "pickup_instructions",
    label: "Pickup instructions",
    description: "Where to meet and what to bring.",
    body:
      "Hello {customerName}, here are your collection details.\n\n" +
      "Where: {pickupLocation}\n" +
      "When: {pickupAt}\n" +
      "Car: {vehicle}\n" +
      "Booking: {reference}\n\n" +
      "Bring your driving licence and ID. Any problem, call us on {agencyPhone}.",
  },
  {
    key: "return_reminder",
    label: "Return reminder",
    description: "The day before the car is due back.",
    body:
      "Hello {customerName}, a reminder from {agencyName}.\n" +
      "The {vehicle} is due back on {returnAt} at {returnLocation}.\n\n" +
      "Booking {reference}. Please return it with the same fuel level.",
  },
  {
    key: "outstanding_payment",
    label: "Outstanding payment",
    description: "When a balance is still owed.",
    body:
      "Hello {customerName}, this is {agencyName} about booking {reference}.\n\n" +
      "There is still {outstanding} outstanding on your rental.\n" +
      "You can settle it at the counter, or call us on {agencyPhone}.",
  },
];

const PLACEHOLDER = /\{(\w+)\}/g;

/**
 * Fill a template.
 *
 * An unknown or empty variable collapses to an em dash rather than leaving the
 * placeholder in place — a customer receiving "Hello {customerName}" is worse
 * than a customer receiving "Hello —".
 */
export function renderTemplate(
  body: string,
  variables: Partial<TemplateVariables>,
): string {
  return body.replace(PLACEHOLDER, (_match, name: string) => {
    const value = variables[name as keyof TemplateVariables];
    return value && value.trim() !== "" ? value : "—";
  });
}

export function getTemplate(key: string): TemplateDefinition | null {
  return TEMPLATES.find((template) => template.key === key) ?? null;
}

/** A wa.me link with the message pre-filled (spec §68). */
export function whatsappLink(phoneDigits: string, message: string): string {
  return `https://wa.me/${phoneDigits}?text=${encodeURIComponent(message)}`;
}
