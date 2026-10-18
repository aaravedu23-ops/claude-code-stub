import {
  Baby,
  Book,
  Car,
  Circle,
  Clapperboard,
  Coffee,
  Dumbbell,
  Fuel,
  Gift,
  GraduationCap,
  HeartPulse,
  House,
  type LucideIcon,
  PawPrint,
  Plane,
  Shirt,
  ShoppingBag,
  ShoppingCart,
  Smartphone,
  Utensils,
  Wrench,
  Zap,
} from "lucide-react";

export const CATEGORY_ICONS: Record<string, LucideIcon> = {
  cart: ShoppingCart,
  utensils: Utensils,
  car: Car,
  bag: ShoppingBag,
  zap: Zap,
  heart: HeartPulse,
  film: Clapperboard,
  plane: Plane,
  house: House,
  coffee: Coffee,
  fuel: Fuel,
  gift: Gift,
  school: GraduationCap,
  book: Book,
  paw: PawPrint,
  gym: Dumbbell,
  shirt: Shirt,
  phone: Smartphone,
  tools: Wrench,
  baby: Baby,
  other: Circle,
};

export function categoryIcon(key: string | null | undefined): LucideIcon {
  return (key && CATEGORY_ICONS[key]) || Circle;
}

/** Validated categorical palette (dataviz reference order) plus a neutral for "Other". */
export const CATEGORY_COLORS = [
  "#2a78d6",
  "#eb6834",
  "#1baf7a",
  "#eda100",
  "#e87ba4",
  "#008300",
  "#6250d6",
  "#e34948",
  "#7C8290",
];

export const DEFAULT_CATEGORIES: { name: string; icon: string; color: string }[] = [
  { name: "Groceries", icon: "cart", color: "#1baf7a" },
  { name: "Dining", icon: "utensils", color: "#eb6834" },
  { name: "Transport", icon: "car", color: "#2a78d6" },
  { name: "Shopping", icon: "bag", color: "#6250d6" },
  { name: "Bills & utilities", icon: "zap", color: "#eda100" },
  { name: "Health", icon: "heart", color: "#e34948" },
  { name: "Entertainment", icon: "film", color: "#e87ba4" },
  { name: "Travel", icon: "plane", color: "#008300" },
  { name: "Other", icon: "other", color: "#7C8290" },
];

export const CARD_NETWORKS = ["Visa", "Mastercard", "Amex", "Discover", "Debit", "Other"] as const;

/** Card face colors. `ink` is the text color that reads on that face. */
export const CARD_FACES: { color: string; ink: string; name: string }[] = [
  { color: "#172033", ink: "#F4F5F7", name: "Midnight" },
  { color: "#2F45C5", ink: "#FFFFFF", name: "Carbon" },
  { color: "#0F7A58", ink: "#FFFFFF", name: "Fern" },
  { color: "#7A3B5E", ink: "#FFFFFF", name: "Plum" },
  { color: "#B4471E", ink: "#FFFFFF", name: "Rust" },
  { color: "#D9DCE3", ink: "#172033", name: "Silver" },
  { color: "#D8B56A", ink: "#2A2112", name: "Gold" },
];

export function cardInk(color: string) {
  return CARD_FACES.find((f) => f.color === color)?.ink ?? "#FFFFFF";
}
