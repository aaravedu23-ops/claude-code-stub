/** Plain, serializable shapes passed from server components to client components. */

export type CategoryOption = {
  id: string;
  name: string;
  color: string;
  icon: string;
  budget: number | null;
};

export type CardOption = {
  id: string;
  nickname: string;
  issuer: string;
  network: string;
  last4: string;
  color: string;
  holderName: string | null;
  expMonth: number | null;
  expYear: number | null;
};

export type ReturnablePurchase = {
  id: string;
  merchant: string;
  amount: number;
  remaining: number;
  date: string;
  categoryId: string | null;
  cardId: string | null;
};

export type EditableTxn = {
  id: string;
  kind: "purchase" | "refund";
  amount: number;
  merchant: string;
  /** YYYY-MM-DD */
  date: string;
  categoryId: string | null;
  cardId: string | null;
  originalId: string | null;
  note: string | null;
  items: { name: string; amount: number }[];
  hasReceipt: boolean;
  refundedTotal: number;
  refundCount: number;
};
